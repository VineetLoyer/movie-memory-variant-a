// NFR-08: Support repeatable checks without changing production code.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { pathToFileURL } from 'node:url'
import { openTestDatabase } from '../fixtures/database.ts'
import { controller } from './controller.ts'

const database = await openTestDatabase()
const signature = `task19_${randomUUID()}_`
const control = controller(database, signature)
const stub = createServer((request, response) => {
  control.handle(request, response).catch(() => {
    response.writeHead(500).end('Controlled fixture error')
  })
}).listen(0, '127.0.0.1')
await once(stub, 'listening')
const stubAddress = stub.address()
if (!stubAddress || typeof stubAddress === 'string') throw new TypeError('Missing stub address')
const reservation = createServer().listen(0, '127.0.0.1')
await once(reservation, 'listening')
const address = reservation.address()
if (!address || typeof address === 'string') throw new TypeError('Missing application address')
await new Promise<void>(done => reservation.close(() => done()))
const origin = `http://127.0.0.1:${address.port}`
const privateFile = parseEnv(await readFile('.env', 'utf8'))
const child = spawn(process.execPath, [
  '--import', pathToFileURL(resolve('tests/fixtures/provider-preload.mjs')).href,
  '--import', pathToFileURL(resolve('tests/fixtures/identity-preload.mjs')).href,
  resolve('node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(address.port),
], {
  windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  env: {
    ...process.env, NODE_ENV: 'production', DATABASE_URL: privateFile['TEST_DATABASE_URL'],
    AUTH_URL: origin, AUTH_SECRET: 'harmless-task19-production-secret-long-enough',
    AUTH_GOOGLE_ID: 'harmless-google-id', AUTH_GOOGLE_SECRET: 'harmless-google-secret',
    OPENAI_API_KEY: 'harmless-sdk-upstream-key',
    MOVIE_MEMORY_TEST_PROVIDER_ORIGIN: `http://127.0.0.1:${stubAddress.port}`,
    NEXT_TELEMETRY_DISABLED: '1', TASK19_SERVER_SIGNATURE: signature,
  },
})
control.bind(child)
child.stderr?.on('data', () => {})
await new Promise<void>((ready, reject) => {
  const timer = setTimeout(() => reject(new Error('Production readiness timed out')), 15_000)
  child.once('error', () => { clearTimeout(timer); reject(new Error('Production spawn failed')) })
  child.once('exit', () => { clearTimeout(timer); reject(new Error('Production exited before readiness')) })
  child.stdout?.on('data', (chunk: Buffer) => {
    if (chunk.toString().includes('Ready in')) { clearTimeout(timer); ready() }
  })
})
const runtimePath = resolve(process.env['MOVIE_MEMORY_E2E_RUNTIME'] ?? '.omo/tmp/e2e/runtime.json')
await mkdir(dirname(runtimePath), { recursive: true })
await writeFile(runtimePath, JSON.stringify({
  origin, controlOrigin: `http://127.0.0.1:${stubAddress.port}`,
  controlKey: control.controlKey, pid: child.pid, signature,
}), { flag: 'wx' })
console.info('TASK19_READY', JSON.stringify({ pid: child.pid, port: address.port, stubPort: stubAddress.port, signature }))
async function stop() {
  const stopped = once(child, 'exit')
  child.kill()
  await stopped
  const counts = await control.cleanup()
  stub.closeAllConnections()
  await new Promise<void>(done => stub.close(() => done()))
  await database.$disconnect()
  await writeFile(runtimePath + '.cleanup.json', JSON.stringify({ ...counts, serverStopped: true, disconnected: true }))
  if (Object.values(counts).some(count => count !== 0)) process.exitCode = 1
  process.stdin.destroy()
}
process.stdin.resume()
process.stdin.once('data', () => { void stop() })
process.once('SIGINT', () => { void stop() })
process.once('SIGTERM', () => { void stop() })
