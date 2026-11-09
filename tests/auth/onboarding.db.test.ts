// FR-04, FR-05, NFR-02: Check racing saves and owner isolation on the guarded test database.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'

const request = vi.hoisted(() => ({
  cookie: '', failSession: false, failWrite: false, databaseRejected: false,
}))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'localhost:3000', cookie: request.cookie }),
  cookies: async () => ({ set: vi.fn() }),
}))
vi.mock('../../src/lib/db', async () => {
  const { prisma } = await import('./database')
  const failQuery = async (): Promise<never> => {
    try {
      await prisma.$queryRaw`SELECT 1 / 0`
    } catch (error) {
      request.databaseRejected = error instanceof Prisma.PrismaClientKnownRequestError
      throw error
    }
    throw new Error('The deliberate PostgreSQL fault did not reject')
  }
  return {
    prisma: prisma.$extends({
      query: {
        session: {
          async findUnique({ args, query }) {
            if (request.failSession) return failQuery()
            return query(args)
          },
        },
        user: {
          async updateMany({ args, query }) {
            if (request.failWrite) return failQuery()
            return query(args)
          },
        },
      },
    }),
  }
})

import { createIdentity, namespace, prisma } from './database'
import * as identity from '../../src/lib/identity'

beforeEach(() => {
  vi.stubEnv('AUTH_URL', 'http://localhost:3000')
  vi.stubEnv('AUTH_SECRET', 'harmless-db-secret-long-enough-for-testing')
  vi.stubEnv('AUTH_GOOGLE_ID', 'harmless-google-id')
  vi.stubEnv('AUTH_GOOGLE_SECRET', 'harmless-google-secret')
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('External network forbidden'))))
  request.cookie = ''
  request.failSession = false
  request.failWrite = false
  request.databaseRejected = false
})
afterAll(async () => {
  try {
    await prisma.user.deleteMany({ where: { id: { startsWith: namespace } } })
  } finally {
    await prisma.$disconnect()
  }
})

describe('real database first-write onboarding', () => {
  it.each([
    { label: 'one', input: ' A ', saved: 'A' },
    { label: 'maximum', input: 'x'.repeat(200), saved: 'x'.repeat(200) },
    { label: 'emoji', input: '\u{1f3ac}'.repeat(100), saved: '\u{1f3ac}'.repeat(100) },
  ])('persists the trimmed $label boundary', async ({ label, input, saved }) => {
    const { user, session } = await createIdentity(label)
    request.cookie = `authjs.session-token=${session.sessionToken}`

    expect(await identity.saveFavoriteMovie(input)).toEqual({ kind: 'saved' })
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({
      favoriteMovie: saved,
    })
  })

  it('allows exactly one winner when distinct valid titles race', async () => {
    const { user, session } = await createIdentity('race')
    request.cookie = `authjs.session-token=${session.sessionToken}`

    const results = await Promise.all([
      identity.saveFavoriteMovie('Arrival'), identity.saveFavoriteMovie('Moon'),
    ])

    expect(results.filter((result) => result.kind === 'saved')).toEqual([{ kind: 'saved' }])
    expect(results.filter((result) => result.kind === 'error')).toEqual([{
      kind: 'error', code: 'ALREADY_ONBOARDED', message: 'Your favorite movie is already saved.',
    }])
    const winner = results[0]?.kind === 'saved' ? 'Arrival' : 'Moon'
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({
      favoriteMovie: winner,
    })
  })

  it('never overwrites an already saved movie', async () => {
    const { user, session } = await createIdentity('repeat')
    request.cookie = `authjs.session-token=${session.sessionToken}`
    await prisma.user.update({ where: { id: user.id }, data: { favoriteMovie: 'Original' } })

    expect(await identity.saveFavoriteMovie('Replacement')).toMatchObject({
      kind: 'error', code: 'ALREADY_ONBOARDED',
    })
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({
      favoriteMovie: 'Original',
    })
  })

  it('ignores forged owner arguments and mutates only the authenticated user', async () => {
    const actor = await createIdentity('actor')
    const victim = await createIdentity('victim')
    request.cookie = `authjs.session-token=${actor.session.sessionToken}`

    const result: unknown = await Reflect.apply(identity.saveFavoriteMovie, undefined, [
      'Actor movie', victim.user.id,
    ])

    expect(result).toEqual({ kind: 'saved' })
    expect(await prisma.user.findMany({
      where: { id: { in: [actor.user.id, victim.user.id] } },
      select: { id: true, favoriteMovie: true }, orderBy: { id: 'asc' },
    })).toEqual([
      { id: actor.user.id, favoriteMovie: 'Actor movie' },
      { id: victim.user.id, favoriteMovie: null },
    ])
  })

  it.each(['absent', 'expired'] as const)('rejects a real %s session without a write', async (state) => {
    const { user, session } = await createIdentity(`unauthenticated-${state}`)
    switch (state) {
      case 'absent': break
      case 'expired':
        request.cookie = `authjs.session-token=${session.sessionToken}`
        await prisma.session.update({ where: { id: session.id }, data: { expires: new Date(0) } })
        break
      default: {
        const unreachable: never = state
        throw new Error(`Unexpected state: ${unreachable}`)
      }
    }

    expect(await identity.saveFavoriteMovie('Forbidden')).toMatchObject({
      kind: 'error', code: 'UNAUTHENTICATED',
    })
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({
      favoriteMovie: null,
    })
  })

  it.each(['session', 'write'] as const)('reports an actual PostgreSQL %s failure as unavailable', async (stage) => {
    const { user, session } = await createIdentity(`outage-${stage}`)
    request.cookie = `authjs.session-token=${session.sessionToken}`
    switch (stage) {
      case 'session': request.failSession = true; break
      case 'write': request.failWrite = true; break
      default: {
        const unreachable: never = stage
        throw new Error(`Unexpected stage: ${unreachable}`)
      }
    }

    expect(await identity.saveFavoriteMovie('Not persisted')).toEqual({
      kind: 'error', code: 'UNAVAILABLE', message: 'We could not save your movie. Please try again.',
    })
    expect(request.databaseRejected).toBe(true)
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({
      favoriteMovie: null,
    })
  })
})
