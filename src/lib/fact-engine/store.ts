import 'server-only'

import { randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import type { FactSnapshot, FactStore, StoredFact } from './types'

type Database = PrismaClient | Prisma.TransactionClient
type LatestRow = Readonly<{ databaseNow: Date }> &
  (StoredFact | Readonly<{ id: null; text: null; createdAt: null }>)

export class FactClockError extends Error {
  constructor() {
    super('The fact clock query did not return its statement timestamp.')
    this.name = 'FactClockError'
  }
}

// FR-04, FR-07, FR-08: Keep every fact read and write within the user/movie scope.
export function createFactStore(database: Database): FactStore {
  // NFR-04: timestamp(3) has no zone. All fact-engine writes use its DB default in UTC;
  // all reads explicitly interpret that representation as a UTC instant.
  // Each transaction is short and ends before any external provider work.
  const inUtc = <T>(work: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
    const normalized = async (transaction: Prisma.TransactionClient): Promise<T> => {
      await transaction.$executeRaw`SET LOCAL TIME ZONE 'UTC'`
      return work(transaction)
    }
    return '$transaction' in database ? database.$transaction(normalized) : normalized(database)
  }

  return {
    readLatest: (scope) => inUtc(async (transaction): Promise<FactSnapshot> => {
      // FR-07: Exclude test preview records from normal fact reads.
      const rows = await transaction.$queryRaw<readonly LatestRow[]>`
        SELECT statement_timestamp() AS "databaseNow",
               fact.id, fact.text, fact."createdAt" AT TIME ZONE 'UTC' AS "createdAt"
        FROM (SELECT 1) AS clock
        LEFT JOIN LATERAL (
          SELECT id, text, "createdAt" FROM "MovieFact"
          WHERE "userId" = ${scope.userId} AND "movieTitle" = ${scope.movieTitle}
            AND position('[CONTROLLED PREVIEW DATA]' in text) = 0
          ORDER BY "createdAt" DESC, id DESC LIMIT 1
        ) AS fact ON true
      `
      const row = rows[0]
      if (!row) throw new FactClockError()
      return {
        databaseNow: row.databaseNow,
        latest: row.id === null ? null : { id: row.id, text: row.text, createdAt: row.createdAt },
      }
    }),
    insert: (scope, text) => inUtc(async (transaction): Promise<StoredFact> => {
      // Raw INSERT deliberately omits createdAt: Prisma's create engine can
      // supply @default(now()) itself instead of exercising the database default.
      const rows = await transaction.$queryRaw<readonly StoredFact[]>`
        INSERT INTO "MovieFact" (id, "userId", "movieTitle", text)
        VALUES (${randomUUID()}, ${scope.userId}, ${scope.movieTitle}, ${text})
        RETURNING id, text, "createdAt" AT TIME ZONE 'UTC' AS "createdAt"
      `
      const row = rows[0]
      if (!row) throw new FactClockError()
      return row
    }),
  }
}
