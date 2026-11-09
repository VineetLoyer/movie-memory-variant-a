// NFR-02, NFR-10: Inspect publication inputs and browser assets without printing secret values.
import { execFile as execFileCallback } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, relative, join } from 'node:path'
import { parseArgs, parseEnv } from 'node:util'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)
const { values } = parseArgs({ options: { root: { type: 'string', default: process.cwd() } } })
const root = resolve(values.root)

class SecretScanError extends Error {
  constructor() {
    super('Secret scan could not inspect every required input.')
    this.name = 'SecretScanError'
  }
}

async function git(args) {
  const result = await execFile('git', ['-C', root, ...args], {
    env: { ...process.env, GIT_MASTER: '1' }, encoding: 'buffer',
    windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  })
  return result.stdout
}

async function optionalFile(path) {
  try {
    return await readFile(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

async function clientFiles(path) {
  const entries = await readdir(path, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) files.push(...await clientFiles(child))
    else if (entry.isFile()) files.push(child)
    else throw new SecretScanError()
  }
  return files
}

async function scan() {
  const configurations = [process.env]
  for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const file = await optionalFile(join(root, name))
    if (file) configurations.push(parseEnv(file.toString()))
  }
  const secrets = new Set(configurations.flatMap((config) =>
    Object.entries(config).filter(([key, value]) =>
      /SECRET|TOKEN|API_KEY|DATABASE_URL|AUTH_GOOGLE_ID|CANARY/.test(key) &&
      typeof value === 'string' && value.length >= 8,
    ).flatMap(([, value]) => [value, JSON.stringify(value).slice(1, -1)]),
  ))
  const paths = (await git(['ls-files', '--cached', '-z'])).toString().split('\0').filter(Boolean)
  const untracked = (await git(['ls-files', '--others', '--exclude-standard', '-z']))
    .toString().split('\0').filter(Boolean)
  const findings = new Set()
  const inspect = (label, bytes) => {
    const text = bytes.toString()
    if ([...secrets].some((secret) => text.includes(secret)) ||
        /sk-(?:proj-)?[A-Za-z0-9_-]{24,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) {
      findings.add(label)
    }
  }
  for (const path of paths) {
    if (/^\.env(?:\.|$)/.test(path) && path !== '.env.example') findings.add(path)
    const working = await optionalFile(join(root, path))
    if (working) inspect(path, working)
    inspect(`index:${path}`, await git(['show', `:${path}`]))
  }
  for (const path of untracked) {
    const working = await optionalFile(join(root, path))
    if (working) inspect(`untracked:${path}`, working)
  }
  const clients = await clientFiles(join(root, '.next/static'))
  if (clients.length === 0) throw new SecretScanError()
  for (const path of clients) inspect(relative(root, path).replaceAll('\\', '/'), await readFile(path))
  if (findings.size) {
    console.error('Secret scan rejected sensitive content in:', [...findings].join(', '))
    process.exitCode = 1
  } else {
    console.info(`Secret scan passed: ${paths.length} tracked paths, ${untracked.length} untracked paths and ${clients.length} client files.`)
  }
}

try {
  await scan()
} catch (error) {
  // CLI boundary: never print private file contents, command output or causes.
  console.error(error instanceof SecretScanError ? error.message : 'Secret scan failed to inspect its inputs.')
  process.exitCode = 2
}
