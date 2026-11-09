// FR-12, NFR-02, NFR-08: Check private access and publication boundaries.
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { parseEnv } from 'node:util'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect } from 'vitest'
import { openTestDatabase } from '../../fixtures/database'
import { seedSession } from '../../fixtures/session'

export const database = await openTestDatabase()
const prefix = `task18_${randomUUID()}_`
const runtimeReceipt = join(tmpdir(), prefix + 'runtime.jsonl')
const ownedIds: string[] = []
let child: ChildProcess | undefined
let origin = ''
let providerCalls = 0
const provider = createServer((_request, response) => {
  providerCalls += 1
  response.writeHead(503, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify({ error: { message: 'Controlled provider unavailable' } }))
})

export const httpOrigin = () => origin

export async function fixture(label: string, favoriteMovie: string | null = null) {
  const id = prefix + label
  ownedIds.push(id)
  return seedSession(database, { id, favoriteMovie })
}

export async function actionId(name: string): Promise<string> {
  const manifest: unknown = JSON.parse(await readFile('.next/server/server-reference-manifest.json', 'utf8'))
  if (typeof manifest === 'object' && manifest !== null && 'node' in manifest &&
      typeof manifest.node === 'object' && manifest.node !== null) {
    for (const [id, value] of Object.entries(manifest.node)) {
      if (typeof value === 'object' && value !== null &&
          'exportedName' in value && value.exportedName === name) return id
    }
  }
  throw new TypeError('The canonical build does not expose the required action.')
}

export async function actionBody(form: FormData): Promise<string | FormData> {
  const require = createRequire(import.meta.url)
  const encoder: unknown = require('next/dist/compiled/react-server-dom-turbopack/client.node')
  if (typeof encoder === 'object' && encoder !== null && 'encodeReply' in encoder &&
      typeof encoder.encodeReply === 'function') {
    const body: unknown = await encoder.encodeReply([null, form])
    if (typeof body === 'string' || body instanceof FormData) return body
  }
  throw new TypeError('The installed action transport did not encode FormData.')
}

beforeAll(async () => {
  provider.listen(0, '127.0.0.1')
  await once(provider, 'listening')
  const providerAddress = provider.address()
  if (!providerAddress || typeof providerAddress === 'string') throw new TypeError('Missing provider port')
  const reservation = createServer()
  reservation.listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const address = reservation.address()
  if (!address || typeof address === 'string') throw new TypeError('Missing application port')
  await new Promise<void>((done, reject) => reservation.close((error) => error ? reject(error) : done()))
  origin = `http://127.0.0.1:${address.port}`
  const privateFile = parseEnv(await readFile('.env', 'utf8'))
  const connection = privateFile['TEST_DATABASE_URL']
  if (!connection) throw new TypeError('Missing guarded test connection')
  // The real client above already checked the private URL and database/role.
  child = spawn(process.execPath, [
    '--import', pathToFileURL(resolve('tests/fixtures/provider-preload.mjs')).href,
    resolve('node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(address.port),
  ], {
    cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env, NODE_ENV: 'production', DATABASE_URL: connection, AUTH_URL: origin,
      AUTH_SECRET: 'harmless-security-http-secret-long-enough',
      AUTH_GOOGLE_ID: 'harmless-google-id', AUTH_GOOGLE_SECRET: 'harmless-google-secret',
      OPENAI_API_KEY: 'harmless-wire-key', OPENAI_BASE_URL: 'https://api.openai.com/v1',
      MOVIE_MEMORY_TEST_PROVIDER_ORIGIN: `http://127.0.0.1:${providerAddress.port}`,
      TASK18_SERVER_SIGNATURE: prefix, NEXT_TELEMETRY_DISABLED: '1',
    },
  })
  const server = child
  await new Promise<void>((ready, reject) => {
    const timer = setTimeout(() => reject(new TypeError('Owned server readiness timed out')), 12_000)
    server.once('error', () => { clearTimeout(timer); reject(new TypeError('Owned server failed')) })
    server.once('exit', () => { clearTimeout(timer); reject(new TypeError('Owned server exited before readiness')) })
    server.stdout?.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('Ready in')) { clearTimeout(timer); ready() }
    })
    // Drain framework diagnostics without logging cookies, bodies or config.
    server.stderr?.on('data', () => {})
  })
  console.info('TASK18_HTTP_READY', JSON.stringify({ pid: server.pid, port: address.port }))
  await writeFile(runtimeReceipt, JSON.stringify({
    kind: 'ready', signature: prefix, pid: server.pid,
    port: address.port, providerPort: providerAddress.port,
  }) + '\n', { flag: 'wx' })
})

afterAll(async () => {
  try {
    if (child && child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, 'exit')
      child.kill()
      await stopped
    }
    await new Promise<void>((done, reject) => provider.close((error) => error ? reject(error) : done()))
    const owners = { in: ownedIds }
    await database.movieFact.deleteMany({ where: { userId: owners } })
    await database.session.deleteMany({ where: { userId: owners } })
    await database.account.deleteMany({ where: { userId: owners } })
    await database.user.deleteMany({ where: { id: owners } })
    const counts = {
      facts: await database.movieFact.count({ where: { userId: owners } }),
      sessions: await database.session.count({ where: { userId: owners } }),
      accounts: await database.account.count({ where: { userId: owners } }),
      users: await database.user.count({ where: { id: owners } }),
    }
    console.info('TASK18_HTTP_CLEANUP', JSON.stringify({ ...counts, providerCalls }))
    const serverStopped = child === undefined || child.exitCode !== null || child.signalCode !== null
    await appendFile(runtimeReceipt, JSON.stringify({
      kind: 'cleanup', ...counts, providerCalls, serverStopped,
    }) + '\n')
    expect(counts).toEqual({ facts: 0, sessions: 0, accounts: 0, users: 0 })
    expect(providerCalls).toBe(0)
    expect(serverStopped).toBe(true)
  } finally {
    await database.$disconnect()
    await appendFile(runtimeReceipt, '{"kind":"disconnected"}\n')
  }
})
