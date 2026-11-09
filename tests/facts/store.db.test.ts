// FR-04, FR-07, FR-08, NFR-04: Check ownership, database timestamps, and exact movie scope.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { openTestDatabase } from '../fixtures/database'
import { createFactStore } from '../../src/lib/fact-engine/store'

const prefix = `task8_B_${randomUUID()}_`
let db: PrismaClient
const owner = `${prefix}owner`
const other = `${prefix}other`

beforeAll(async () => {
  db = await openTestDatabase()
  await db.user.createMany({ data: [{ id: owner }, { id: other }] })
})

afterAll(async () => {
  if (db) {
    await db.user.deleteMany({ where: { id: { in: [owner, other] } } })
    const remaining = await db.movieFact.count({ where: { userId: { in: [owner, other] } } })
    console.info(`FACT_FIXTURE_CLEANUP owned_rows=${remaining}`)
    await db.$disconnect()
    expect(remaining).toBe(0)
  }
})

describe('real scoped UTC store', () => {
  it('excludes controlled preview fixtures without deleting saved rows', async () => {
    const scope = { userId: owner, movieTitle: 'Preview isolation' }
    await db.movieFact.create({ data: { ...scope, text: '[CONTROLLED PREVIEW DATA] fixture' } })
    expect((await createFactStore(db).readLatest(scope)).latest).toBeNull()
    expect(await db.movieFact.count({ where: scope })).toBe(1)
  })
  it('returns statement time even when the exact scope has no row', async () => {
    const start = await db.$queryRaw<readonly { now: Date }[]>`SELECT statement_timestamp() AS now`
    const result = await createFactStore(db).readLatest({ userId: owner, movieTitle: 'empty' })
    const end = await db.$queryRaw<readonly { now: Date }[]>`SELECT statement_timestamp() AS now`
    expect(result.latest).toBeNull()
    expect(result.databaseNow.getTime()).toBeGreaterThanOrEqual(start[0]?.now.getTime() ?? Infinity)
    expect(result.databaseNow.getTime()).toBeLessThanOrEqual(end[0]?.now.getTime() ?? -Infinity)
  })

  it('isolates both owner and exact movie and breaks timestamp ties by descending id', async () => {
    const createdAt = new Date('2026-10-01T00:00:00Z')
    await db.movieFact.createMany({ data: [
      { id: `${prefix}a`, userId: owner, movieTitle: 'Arrival', text: 'older id', createdAt },
      { id: `${prefix}z`, userId: owner, movieTitle: 'Arrival', text: 'winner', createdAt },
      { userId: other, movieTitle: 'Arrival', text: 'other owner' },
      { userId: owner, movieTitle: 'arrival', text: 'different case' },
      { userId: owner, movieTitle: "Arrival' OR true --", text: 'SQL title data' },
    ] })
    const store = createFactStore(db)
    expect((await store.readLatest({ userId: owner, movieTitle: 'Arrival' })).latest?.text).toBe('winner')
    expect((await store.readLatest({ userId: owner, movieTitle: "Arrival' OR true --" })).latest?.text)
      .toBe('SQL title data')
  })

  it('uses the DB default as an actual UTC instant under a controlled non-UTC session', async () => {
    await db.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL TIME ZONE 'America/Los_Angeles'`
      const before = await transaction.$queryRaw<readonly { now: Date; zone: string }[]>`
        SELECT statement_timestamp() AS now, current_setting('TimeZone') AS zone
      `
      expect(before[0]?.zone).toBe('America/Los_Angeles')
      const store = createFactStore(transaction)
      vi.spyOn(Date, 'now').mockReturnValue(0)
      try {
        const saved = await store.insert({ userId: owner, movieTitle: 'UTC probe' }, 'UTC fact')
        const read = await store.readLatest({ userId: owner, movieTitle: 'UTC probe' })
        const actual = await transaction.$queryRaw<readonly {
          epoch: number; zone: string; usedDefault: boolean
        }[]>`
          SELECT EXTRACT(EPOCH FROM statement_timestamp())::double precision AS epoch,
                 current_setting('TimeZone') AS zone,
                 "createdAt" = transaction_timestamp()::timestamp(3) AS "usedDefault"
          FROM "MovieFact" WHERE id = ${saved.id}
        `
        const epoch = actual[0]?.epoch ?? 0
        expect(Math.abs(saved.createdAt.getTime() / 1000 - epoch)).toBeLessThan(2)
        expect(actual[0]?.usedDefault).toBe(true)
        expect(saved.createdAt.toISOString()).toBe(read.latest?.createdAt.toISOString())
        expect(read.databaseNow.getTime() - saved.createdAt.getTime()).toBeGreaterThanOrEqual(0)
        console.info('UTC_PROBE actual_instant_matches_database_epoch=true application_clock_ignored=true')
      } finally {
        vi.restoreAllMocks()
      }
    })
  })
})
