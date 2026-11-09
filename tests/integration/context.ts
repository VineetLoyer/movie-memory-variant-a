// NFR-08: Support repeatable checks without changing production code.
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { afterAll, afterEach, beforeEach, expect, vi } from 'vitest'
import { openTestDatabase } from '../fixtures/database'
import { seedSession } from '../fixtures/session'

export const database = await openTestDatabase()
const namespace = `task17_${randomUUID()}_`
const ownedIds: string[] = []

// Mutable fault counters belong to one synthetic request, never the database.
export type RequestContext = {
  readonly sessionToken: string
  readonly fault: 'none' | 'read' | 'fallback'
  rawQueries: number
  databaseRejected: boolean
}
export const requests = new AsyncLocalStorage<RequestContext>()

// A real client with request-scoped SQL error injection. Normal operations
// always execute their original Prisma query; no identity/store result is faked.
export const applicationDatabase = database.$extends({
  query: {
    async $allOperations({ operation, args, query }) {
      const request = requests.getStore()
      if (request && operation === '$queryRaw') {
        request.rawQueries += 1
        const failsRead = request.fault === 'read' && request.rawQueries === 1
        const failsFallback = request.fault === 'fallback' && request.rawQueries === 3
        if (failsRead || failsFallback) {
          try {
            await database.$queryRaw`SELECT 1 / 0`
          } catch (error) {
            request.databaseRejected = error instanceof Prisma.PrismaClientKnownRequestError
            throw error
          }
          throw new TypeError('The deliberate PostgreSQL error did not reject')
        }
      }
      return query(args)
    },
  },
})

export async function fixture(label: string, favoriteMovie: string | null = 'Arrival') {
  const id = namespace + label
  ownedIds.push(id)
  return seedSession(database, { id, favoriteMovie })
}

export function requestFor(sessionToken: string): RequestContext {
  return { sessionToken, fault: 'none', rawQueries: 0, databaseRejected: false }
}

export async function databaseNow(): Promise<Date> {
  const rows = await database.$queryRaw<readonly { now: Date }[]>`
    SELECT statement_timestamp() AS now
  `
  const now = rows[0]?.now
  if (!now) throw new TypeError('PostgreSQL did not return its clock')
  return now
}

export function wireFact(text: string): Response {
  return Response.json({
    id: 'controlled', object: 'chat.completion', created: 0, model: 'controlled',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: text } }],
  })
}

export const transport = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubEnv('AUTH_URL', 'http://localhost:3000')
  vi.stubEnv('AUTH_SECRET', 'harmless-integration-secret-long-enough-for-testing')
  vi.stubEnv('AUTH_GOOGLE_ID', 'harmless-google-id')
  vi.stubEnv('AUTH_GOOGLE_SECRET', 'harmless-google-secret')
  vi.stubEnv('OPENAI_API_KEY', 'harmless-controlled-sdk-key')
  vi.stubEnv('OPENAI_BASE_URL', 'https://api.openai.com/v1')
  transport.mockReset().mockRejectedValue(new TypeError('External transport is closed'))
  vi.stubGlobal('fetch', transport)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

afterAll(async () => {
  try {
    const owners = { in: ownedIds }
    await database.movieFact.deleteMany({ where: { userId: owners } })
    await database.session.deleteMany({ where: { userId: owners } })
    await database.account.deleteMany({ where: { userId: owners } })
    await database.user.deleteMany({ where: { id: owners } })
    const counts = {
      facts: await database.movieFact.count({ where: { userId: owners } }),
      sessions: await database.session.count({ where: { userId: owners } }),
      accounts: await database.account.count({ where: { userId: owners } }),
      users: await database.user.count({ where: { id: owners } }),
    }
    console.info('TASK17_FIXTURE_READBACK', JSON.stringify(counts))
    expect(counts).toEqual({ facts: 0, sessions: 0, accounts: 0, users: 0 })
  } finally {
    await database.$disconnect()
  }
})
