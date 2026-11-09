import { defineConfig } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const runtimePath = process.env['MOVIE_MEMORY_E2E_RUNTIME'] ?? '.omo/tmp/e2e/runtime.json'
const runtime: unknown = JSON.parse(readFileSync(resolve(runtimePath), 'utf8'))
if (typeof runtime !== 'object' || runtime === null || !('origin' in runtime) ||
    typeof runtime.origin !== 'string' || !/^http:\/\/127\.0\.0\.1:\d+$/.test(runtime.origin)) {
  throw new TypeError('Start the guarded tests/e2e/launch.ts production launcher first.')
}
const evidence = process.env['MOVIE_MEMORY_E2E_EVIDENCE'] ?? '.omo/evidence/e2e'
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  outputDir: resolve(evidence, 'traces/private'),
  reporter: [['list'], ['html', { outputFolder: resolve(evidence, 'playwright-report'), open: 'never' }]],
  use: {
    baseURL: runtime.origin, channel: 'chrome', headless: true,
    trace: 'on', screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
})
