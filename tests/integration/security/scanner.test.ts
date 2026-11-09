// NFR-02, NFR-10: Check secret detection across source, index, untracked files, and client assets.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'

const roots: string[] = []
const scanner = resolve('scripts/check-secrets.mjs')

function run(executable: string, args: readonly string[], root: string) {
  return new Promise<{ readonly exit: number | null; readonly output: string }>((resolveRun, reject) => {
    const child = spawn(executable, args, {
      cwd: root, env: { ...process.env, GIT_MASTER: '1' },
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.once('error', reject)
    child.once('close', (exit) => resolveRun({ exit, output }))
  })
}

async function repository() {
  const root = await mkdtemp(join(tmpdir(), 'task18-scanner-'))
  roots.push(root)
  expect((await run('git', ['init', '--quiet'], root)).exit).toBe(0)
  await mkdir(join(root, '.next/static'), { recursive: true })
  await writeFile(join(root, '.next/static/app.js'), 'console.log("public")')
  await writeFile(join(root, '.env.example'), 'OPENAI_API_KEY=replace-with-openai-api-key\n')
  await writeFile(join(root, 'app.js'), 'export const publicName = "Movie Memory"\n')
  expect((await run('git', ['add', '.env.example', 'app.js'], root)).exit).toBe(0)
  return root
}

afterEach(async () => {
  delete process.env['SECRET_SCAN_CANARY']
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })))
})

it('accepts placeholders and public tracked/staged code with a nonempty client build', async () => {
  const root = await repository()
  const result = await run(process.execPath, [scanner, '--root', root], root)
  expect(result.exit).toBe(0)
})

it.each(['index', 'working', 'client', 'untracked'] as const)('rejects a private canary in %s without echoing it', async (surface) => {
  const root = await repository()
  const canary = randomUUID() + randomUUID()
  process.env['SECRET_SCAN_CANARY'] = canary
  switch (surface) {
    case 'index':
      await writeFile(join(root, 'app.js'), canary)
      expect((await run('git', ['add', 'app.js'], root)).exit).toBe(0)
      await writeFile(join(root, 'app.js'), 'export const clean = true\n')
      break
    case 'working':
      await writeFile(join(root, 'app.js'), canary)
      break
    case 'client':
      await writeFile(join(root, '.next/static/leak.js'), canary)
      break
    case 'untracked':
      await writeFile(join(root, 'new-source.ts'), canary)
      break
    default: {
      const exhaustive: never = surface
      throw new TypeError(String(exhaustive))
    }
  }

  const result = await run(process.execPath, [scanner, '--root', root], root)

  expect(result.exit).toBe(1)
  expect(result.output).not.toContain(canary)
})
