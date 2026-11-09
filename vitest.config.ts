import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = fileURLToPath(new URL('./src/', import.meta.url))
const fixture = (name: string) => fileURLToPath(new URL(`./tests/fixtures/${name}.ts`, import.meta.url))
const productionAliases = [
  { find: 'server-only', replacement: fixture('server-only') },
  { find: '@', replacement: src },
]
const isolatedAliases = [
  { find: '@/lib/identity', replacement: fixture('identity') },
  { find: '@/lib/facts', replacement: fixture('facts') },
  { find: '@/auth', replacement: fixture('auth') },
  ...productionAliases,
]

export default defineConfig({
  cacheDir: process.env['VITEST_CACHE_DIR'] ?? './node_modules/.vite',
  test: {
    projects: [
      {
        resolve: { alias: isolatedAliases },
        test: {
          name: 'foundation', environment: 'node',
          include: ['tests/foundation/**/*.test.ts'],
          server: { deps: { inline: ['next-auth'] } },
          testTimeout: 15000, hookTimeout: 15000,
        },
      },
      {
        resolve: { alias: [
          { find: '@/lib/identity', replacement: fixture('identity') },
          ...productionAliases,
        ] },
        test: {
          name: 'unit', environment: 'node',
          include: ['tests/{auth,facts}/**/*.test.ts'],
          exclude: ['**/*.db.test.ts'],
          server: { deps: { inline: ['next-auth'] } },
          clearMocks: true,
        },
      },
      {
        resolve: { alias: isolatedAliases },
        test: {
          name: 'ui', environment: 'jsdom',
          include: ['tests/ui/**/*.test.{ts,tsx}'],
          server: { deps: { inline: ['next-auth'] } },
          clearMocks: true,
        },
      },
      {
        resolve: { alias: productionAliases },
        test: {
          name: 'db', environment: 'node',
          include: ['tests/{auth,facts}/**/*.db.test.ts'],
          server: { deps: { inline: ['next-auth'] } },
          testTimeout: 15000, hookTimeout: 15000,
        },
      },
      {
        resolve: { alias: productionAliases },
        test: {
          name: 'integration', environment: 'node',
          include: ['tests/integration/**/*.test.{ts,tsx}'],
          exclude: ['tests/integration/security/**'],
          server: { deps: { inline: ['next-auth'] } },
          testTimeout: 15000, hookTimeout: 15000,
        },
      },
      {
        resolve: { alias: productionAliases },
        test: {
          name: 'security', environment: 'node',
          include: ['tests/integration/security/**/*.test.{ts,tsx}'],
          server: { deps: { inline: ['next-auth'] } },
          testTimeout: 15000, hookTimeout: 15000,
        },
      },
    ],
  },
})
