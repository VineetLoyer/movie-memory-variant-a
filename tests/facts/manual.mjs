// FR-07, FR-08, NFR-08: Check real service composition with a controlled provider.
// Test-only CLI channel: real guarded Postgres, controlled provider, no OAuth/API calls.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { registerHooks } from 'node:module'
import { extname } from 'node:path'

const sourceRoot = new URL('../../src/', import.meta.url).href
const fixtureRoot = new URL('../fixtures/', import.meta.url).href
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') {
      return nextResolve(new URL('../fixtures/server-only.ts', import.meta.url).href, context)
    }
    if ((context.parentURL?.startsWith(sourceRoot) || context.parentURL?.startsWith(fixtureRoot)) &&
        specifier.startsWith('.') && !extname(specifier)) {
      return nextResolve(`${specifier}.ts`, context)
    }
    return nextResolve(specifier, context)
  },
})
const { openTestDatabase } = await import('../fixtures/database.ts')
const { createFactStore } = await import('../../src/lib/fact-engine/store.ts')
const { createFactService } = await import('../../src/lib/fact-engine/service.ts')
const db = await openTestDatabase()
const id = `task10_B_manual_${randomUUID()}`
let providerCalls = 0
try {
  await db.user.create({ data: { id, favoriteMovie: 'Arrival' } })
  const store = createFactStore(db)
  const service = createFactService({
    getCurrentUser: () => db.user.findUnique({ where: { id } }),
    store,
    provider: async () => {
      providerCalls += 1
      return '  Controlled CLI demonstration fact  '
    },
  })
  const generated = await service()
  const cached = await service()
  const persisted = await store.readLatest({ userId: id, movieTitle: 'Arrival' })
  assert.equal(generated.kind, 'fact')
  assert.deepEqual(cached, generated)
  assert.equal(persisted.latest?.text, 'Controlled CLI demonstration fact')
  assert.equal(providerCalls, 1)
  assert.equal(await db.movieFact.count({ where: { userId: id } }), 1)
  console.info(JSON.stringify({
    channel: 'native Node CLI', generated, cached, persisted: persisted.latest,
    providerCalls, persistedRows: 1, binaryOutcome: 'PASS',
  }))
} finally {
  await db.user.deleteMany({ where: { id } })
  const ownedFacts = await db.movieFact.count({ where: { userId: id } })
  const ownedUsers = await db.user.count({ where: { id } })
  await db.$disconnect()
  hooks.deregister()
  console.info(JSON.stringify({ cleanup: { ownedFacts, ownedUsers }, disconnected: true }))
  assert.deepEqual({ ownedFacts, ownedUsers }, { ownedFacts: 0, ownedUsers: 0 })
}
