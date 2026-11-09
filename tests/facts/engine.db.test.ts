// FR-07 through FR-10, NFR-09: Check storage and shared work on the guarded test database.
import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { openTestDatabase } from '../fixtures/database'
import { createFactStore } from '../../src/lib/fact-engine/store'
import { createFactService } from '../../src/lib/fact-engine/service'

const prefix = `task10_B_${randomUUID()}_`
const owners = ['burst', 'fallback', 'deleted', 'future'].map((suffix) => `${prefix}${suffix}`)
let db: PrismaClient

beforeAll(async () => {
  db = await openTestDatabase()
  await db.user.createMany({ data: owners.map((id) => ({ id, favoriteMovie: 'Arrival' })) })
})

afterAll(async () => {
  if (db) {
    await db.user.deleteMany({ where: { id: { in: owners } } })
    const rows = await db.movieFact.count({ where: { userId: { in: owners } } })
    const users = await db.user.count({ where: { id: { in: owners } } })
    console.info(`ENGINE_DB_CLEANUP owned_facts=${rows} owned_users=${users}`)
    await db.$disconnect()
    expect({ rows, users }).toEqual({ rows: 0, users: 0 })
  }
})

function identity(suffix: string) {
  return () => db.user.findUnique({ where: { id: `${prefix}${suffix}` } })
}

it('persists one trimmed fact for a real 50-caller burst and then reuses the database cache', async () => {
  const provider = vi.fn().mockResolvedValue('  Controlled real DB fact  ')
  const store = createFactStore(db)
  const service = createFactService({ getCurrentUser: identity('burst'), store, provider })
  const results = await Promise.all(Array.from({ length: 50 }, () => service()))
  const latest = await store.readLatest({ userId: `${prefix}burst`, movieTitle: 'Arrival' })
  expect(results).toEqual(Array.from({ length: 50 }, () => ({
    kind: 'fact', text: 'Controlled real DB fact',
    createdAt: latest.latest?.createdAt.toISOString(), stale: false,
  })))
  expect(await db.movieFact.count({ where: { userId: `${prefix}burst` } })).toBe(1)
  expect(await service()).toEqual(results[0])
  expect(provider).toHaveBeenCalledTimes(1)
})

it('rereads a newly persisted matching fallback after controlled provider failure', async () => {
  const store = createFactStore(db)
  const provider = vi.fn(async () => {
    await store.insert({ userId: `${prefix}fallback`, movieTitle: 'Arrival' }, 'Concurrent matching fact')
    throw new Error('controlled provider failure')
  })
  const service = createFactService({ getCurrentUser: identity('fallback'), store, provider })
  expect(await service()).toMatchObject({ kind: 'fact', text: 'Concurrent matching fact', stale: false })
  expect(provider).toHaveBeenCalledTimes(1)
  expect(await db.movieFact.count({ where: { userId: `${prefix}fallback` } })).toBe(1)
})

it('returns unavailable on actual FK insertion failure after concurrent owner deletion', async () => {
  const provider = vi.fn(async () => {
    await db.user.delete({ where: { id: `${prefix}deleted` } })
    return 'Unpersisted text must not escape'
  })
  const service = createFactService({
    getCurrentUser: identity('deleted'), store: createFactStore(db), provider,
  })
  expect(await service()).toEqual({
    kind: 'error', code: 'UNAVAILABLE', message: 'We could not load a movie fact. Please try again.',
  })
  expect(await db.movieFact.count({ where: { userId: `${prefix}deleted` } })).toBe(0)
})

it('treats the newest future row as stale and never chooses an older fresh row instead', async () => {
  const store = createFactStore(db)
  await store.insert({ userId: `${prefix}future`, movieTitle: 'Arrival' }, 'Older fresh row')
  await db.$executeRaw`
    INSERT INTO "MovieFact" (id, "userId", "movieTitle", text, "createdAt")
    VALUES (${`${prefix}futurefact`}, ${`${prefix}future`}, 'Arrival', 'Newest future row',
            (statement_timestamp() AT TIME ZONE 'UTC') + INTERVAL '1 day')
  `
  const provider = vi.fn().mockRejectedValue(new Error('controlled provider failure'))
  const service = createFactService({ getCurrentUser: identity('future'), store, provider })
  expect(await service()).toMatchObject({ kind: 'fact', text: 'Newest future row', stale: true })
  expect(provider).toHaveBeenCalledTimes(1)
})
