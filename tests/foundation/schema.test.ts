import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { openTestDatabase } from '../fixtures/database'

const prefix = `task4_${randomUUID()}_`
const owner = `${prefix}owner`
const other = `${prefix}other`
const expires = new Date('2030-01-01T00:00:00.000Z')
const db = await openTestDatabase()
let ownsRows = false

beforeAll(async () => {
  // NFR-02: No mutation until the test connection and owned rows are verified.
  expect(await db.user.count({ where: { id: { startsWith: prefix } } })).toBe(0)
  expect(await db.account.count({ where: { id: { startsWith: prefix } } })).toBe(0)
  expect(await db.session.count({ where: { id: { startsWith: prefix } } })).toBe(0)
  expect(await db.movieFact.count({ where: { id: { startsWith: prefix } } })).toBe(0)
  expect(await db.verificationToken.count({ where: { identifier: { startsWith: prefix } } })).toBe(0)
  ownsRows = true
  await db.user.createMany({ data: [{ id: owner }, { id: other }] })
})

afterAll(async () => {
  try {
    if (ownsRows) {
      // Clean children explicitly so a failed cascade/FK regression cannot leak.
      await db.account.deleteMany({ where: { id: { startsWith: prefix } } })
      await db.session.deleteMany({ where: { id: { startsWith: prefix } } })
      await db.movieFact.deleteMany({ where: { id: { startsWith: prefix } } })
      await db.user.deleteMany({ where: { id: { startsWith: prefix } } })
      await db.verificationToken.deleteMany({ where: { identifier: { startsWith: prefix } } })
      // Required fixture-cleanup readback; this is not a behavior assertion.
      const counts = await Promise.all([
        db.user.count({ where: { id: { startsWith: prefix } } }),
        db.account.count({ where: { id: { startsWith: prefix } } }),
        db.session.count({ where: { id: { startsWith: prefix } } }),
        db.movieFact.count({ where: { id: { startsWith: prefix } } }),
        db.verificationToken.count({ where: { identifier: { startsWith: prefix } } }),
      ])
      expect(counts).toEqual([0, 0, 0, 0, 0])
      console.info('task4 owned fixture cleanup: 0 rows in all five tables')
    }
  } finally {
    await db.$disconnect()
  }
})

// FR-01, FR-04, FR-06: Check identity constraints, ownership, and optional profile fields.
describe('generated Prisma client with real PostgreSQL', () => {
  test('accepts two null emails and preserves every nullable profile field', async () => {
    const users = await db.user.findMany({
      where: { id: { in: [owner, other] } },
      select: { name: true, email: true, image: true, emailVerified: true, favoriteMovie: true },
    })
    expect(users).toEqual([
      { name: null, email: null, image: null, emailVerified: null, favoriteMovie: null },
      { name: null, email: null, image: null, emailVerified: null, favoriteMovie: null },
    ])
  })

  test('rejects duplicate non-null user emails', async () => {
    const email = `${prefix}profile@example.invalid`
    await db.user.create({ data: { id: `${prefix}email_a`, email } })
    await expect(db.user.create({ data: { id: `${prefix}email_b`, email } }))
      .rejects.toMatchObject({ code: 'P2002' })
  })

  // FR-07, NFR-04: Check the database timestamp default, not the application clock.
  test('generates createdAt in the database using the matching local SQL clock type', async () => {
    // Raw INSERT omits createdAt, so a client-side default cannot make this pass.
    // TIMESTAMP(3) is without time zone; compare to the same DB local type.
    const rows = await db.$queryRaw<readonly { id: string; matchesClock: boolean }[]>`
      INSERT INTO "MovieFact" ("id", "userId", "movieTitle", "text")
      VALUES (${`${prefix}default`}, ${owner}, 'Arrival', 'Database-owned timestamp')
      RETURNING "id",
        "createdAt" = CURRENT_TIMESTAMP::timestamp(3) AS "matchesClock"
    `
    expect(rows).toEqual([{ id: `${prefix}default`, matchesClock: true }])
  })

  test('enforces provider-account uniqueness across owners', async () => {
    const data = { type: 'oauth', provider: prefix, providerAccountId: 'google-id' }
    await db.account.create({ data: { ...data, id: `${prefix}account`, userId: owner } })
    await expect(db.account.create({
      data: { ...data, id: `${prefix}duplicate_account`, userId: other },
    })).rejects.toMatchObject({ code: 'P2002' })
  })

  test('enforces session token uniqueness across owners', async () => {
    const sessionToken = `${prefix}session`
    await db.session.create({ data: { id: `${prefix}session`, userId: owner, sessionToken, expires } })
    await expect(db.session.create({
      data: { id: `${prefix}duplicate_session`, userId: other, sessionToken, expires },
    })).rejects.toMatchObject({ code: 'P2002' })
  })

  test('enforces global verification-token uniqueness across identifiers', async () => {
    const token = `${prefix}token`
    await db.verificationToken.create({ data: { identifier: `${prefix}first`, token, expires } })
    await expect(db.verificationToken.create({
      data: { identifier: `${prefix}second`, token, expires },
    })).rejects.toMatchObject({ code: 'P2002' })
  })

  test('exposes the adapter compound token key backed by its unique database index', async () => {
    const identifier = `${prefix}pair`
    const token = `${prefix}pair-token`
    await db.verificationToken.create({ data: { identifier, token, expires } })
    expect(await db.verificationToken.findUnique({
      where: { identifier_token: { identifier, token } },
    })).toEqual({ identifier, token, expires })
    await expect(db.verificationToken.create({ data: { identifier, token, expires } }))
      .rejects.toMatchObject({ code: 'P2002' })
    // The duplicate also violates the global token key; inspect the distinct
    // compound index rather than claiming that rejection isolates it.
    const indexes = await db.$queryRaw<readonly { unique: boolean; columns: string[] }[]>`
      SELECT i.indisunique AS unique,
        array_agg(a.attname::text ORDER BY keys.ordinality) AS columns
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN LATERAL unnest(i.indkey) WITH ORDINALITY keys(attnum, ordinality) ON true
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = keys.attnum
      WHERE n.nspname = 'public' AND t.relname = 'VerificationToken'
      GROUP BY i.indexrelid, i.indisunique
    `
    expect(indexes).toContainEqual({ unique: true, columns: ['identifier', 'token'] })
  })

  // FR-04, NFR-02: Reject child records without an existing owner.
  test.each(['Account', 'Session', 'MovieFact'] as const)(
    'rejects an orphan %s at the actual foreign key',
    async (table) => {
      const missing = `${prefix}missing`
      const id = `${prefix}orphan_${table}`
      let insert: Prisma.PrismaPromise<unknown>
      switch (table) {
        case 'Account':
          insert = db.account.create({ data: {
            id, userId: missing, type: 'oauth', provider: prefix, providerAccountId: 'orphan',
          } })
          break
        case 'Session':
          insert = db.session.create({ data: { id, userId: missing, sessionToken: id, expires } })
          break
        case 'MovieFact':
          insert = db.movieFact.create({ data: { id, userId: missing, movieTitle: 'Arrival', text: 'Orphan' } })
          break
        default:
          table satisfies never
          throw new TypeError('Unreachable table')
      }
      await expect(insert).rejects.toMatchObject({ code: 'P2003' })
    },
  )

  // FR-04, NFR-02: Deleting one owner must not remove another owner's records.
  test('cascades only the deleted owner while retaining another owner and its children', async () => {
    const deleted = `${prefix}cascade_a`
    const retained = `${prefix}cascade_b`
    for (const id of [deleted, retained]) {
      await db.user.create({ data: {
        id,
        accounts: { create: { id, type: 'oauth', provider: prefix, providerAccountId: id } },
        sessions: { create: { id, sessionToken: id, expires } },
        movieFacts: { create: { id, movieTitle: 'Arrival', text: id } },
      } })
    }
    await db.user.delete({ where: { id: deleted } })
    for (const userId of [deleted, retained]) {
      const expected = userId === deleted ? 0 : 1
      expect(await db.user.count({ where: { id: userId } })).toBe(expected)
      expect(await db.account.count({ where: { userId } })).toBe(expected)
      expect(await db.session.count({ where: { userId } })).toBe(expected)
      expect(await db.movieFact.count({ where: { userId } })).toBe(expected)
    }
  })
})
