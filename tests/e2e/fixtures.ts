// NFR-08: Support repeatable checks without changing production code.
import { test as base, expect } from '@playwright/test'
import type { BrowserContext } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const raw: unknown = JSON.parse(readFileSync(resolve(
  process.env['MOVIE_MEMORY_E2E_RUNTIME'] ?? '.omo/tmp/e2e/runtime.json',
), 'utf8'))
if (typeof raw !== 'object' || raw === null ||
    !('origin' in raw) || typeof raw.origin !== 'string' ||
    !('controlOrigin' in raw) || typeof raw.controlOrigin !== 'string' ||
    !('controlKey' in raw) || typeof raw.controlKey !== 'string') throw new TypeError('Invalid owned runtime')
export const runtime = { origin: raw.origin, controlOrigin: raw.controlOrigin, controlKey: raw.controlKey }
export async function control(path: string, input: object = {}) {
  const response = await fetch(runtime.controlOrigin + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-E2E-Control': runtime.controlKey },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new TypeError('Owned controller rejected operation: ' + path)
  const data: unknown = await response.json()
  if (typeof data !== 'object' || data === null) throw new TypeError('Invalid control response')
  return data
}
export async function fixture(movie: string | null, options: object = {}) {
  const data = await control('/fixture', { movie, ...options })
  if (!('id' in data) || typeof data.id !== 'string' ||
      !('token' in data) || typeof data.token !== 'string' ||
      !('cookieName' in data) || typeof data.cookieName !== 'string') throw new TypeError('Invalid real session')
  return { id: data.id, token: data.token, cookieName: data.cookieName }
}
export async function authenticate(context: BrowserContext, session: Awaited<ReturnType<typeof fixture>>) {
  await context.addCookies([{
    name: session.cookieName, value: session.token, url: runtime.origin,
    httpOnly: true, sameSite: 'Lax',
  }])
}
export const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [async ({ page }, use, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await use(errors)
    await testInfo.attach('browser-errors', { body: JSON.stringify(errors), contentType: 'application/json' })
    expect(errors).toEqual([])
  }, { auto: true }],
})
export { expect }
