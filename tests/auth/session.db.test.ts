// FR-11, FR-12, NFR-02: Verify stored sessions and real database revocation failures.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const request = vi.hoisted(() => ({ cookie: '', failDelete: false }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'localhost:3000', cookie: request.cookie }),
  cookies: async () => ({ set: vi.fn() }),
}))
vi.mock('../../src/lib/db', async () => {
  const { prisma } = await import('./database')
  return {
    prisma: prisma.$extends({
      query: {
        session: {
          async delete({ args, query }) {
            if (request.failDelete) {
              await prisma.$queryRaw`SELECT 1 / 0`
              throw new Error('The deliberate PostgreSQL fault did not reject')
            }
            return query(args)
          },
        },
      },
    }),
  }
})

import { createIdentity, namespace, prisma } from './database'
import { getCurrentUser } from '../../src/lib/identity'
import { handlers, signOut } from '../../src/auth'

beforeEach(() => {
  vi.stubEnv('AUTH_URL', 'http://localhost:3000')
  vi.stubEnv('AUTH_SECRET', 'harmless-db-secret-long-enough-for-testing')
  vi.stubEnv('AUTH_GOOGLE_ID', 'harmless-google-id')
  vi.stubEnv('AUTH_GOOGLE_SECRET', 'harmless-google-secret')
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('External network forbidden'))))
  request.cookie = ''
  request.failDelete = false
})

afterAll(async () => {
  try {
    await prisma.user.deleteMany({ where: { id: { startsWith: namespace } } })
  } finally {
    await prisma.$disconnect()
  }
})

describe('real PrismaAdapter database sessions', () => {
  it('maps a session to the stable user ID and rereads the saved profile', async () => {
    const { user, session } = await createIdentity('profile')
    request.cookie = `authjs.session-token=${session.sessionToken}`
    await prisma.account.create({
      data: {
        userId: user.id, type: 'oauth', provider: 'google',
        providerAccountId: namespace + 'google-profile',
      },
    })
    await prisma.user.update({
      where: { id: user.id }, data: { name: 'Persisted name', favoriteMovie: 'Arrival' },
    })

    expect(await getCurrentUser()).toEqual({
      id: user.id, name: 'Persisted name', email: null, image: null, favoriteMovie: 'Arrival',
    })
  })

  it('exposes only the stable ID and nullable profile in the real route response', async () => {
    const { user, session } = await createIdentity('route')
    const response = await handlers.GET(new NextRequest('http://localhost:3000/api/auth/session', {
      headers: { cookie: `authjs.session-token=${session.sessionToken}` },
    }))

    expect(await response.json()).toEqual({
      expires: session.expires.toISOString(),
      user: { id: user.id, name: null, email: null, image: null },
    })
  })

  it.each(['expired', 'deleted-session', 'deleted-user'] as const)(
    'rejects a real %s identity', async (state) => {
      const { user, session } = await createIdentity(state)
      request.cookie = `authjs.session-token=${session.sessionToken}`
      switch (state) {
        case 'expired':
          await prisma.session.update({ where: { id: session.id }, data: { expires: new Date(0) } })
          break
        case 'deleted-session':
          await prisma.session.delete({ where: { id: session.id } })
          break
        case 'deleted-user':
          await prisma.user.delete({ where: { id: user.id } })
          break
        default: {
          const unreachable: never = state
          throw new Error(`Unexpected state: ${unreachable}`)
        }
      }

      expect(await getCurrentUser()).toBeNull()
    },
  )

  it('invalidates the persisted session and preserves the framework logout redirect', async () => {
    const { session } = await createIdentity('logout')
    request.cookie = `authjs.session-token=${session.sessionToken}`

    await expect(signOut({ redirectTo: '/' })).rejects.toMatchObject({
      digest: 'NEXT_REDIRECT;replace;http://localhost:3000/;307;',
    })

    expect(await getCurrentUser()).toBeNull()
  })

  it('reports an actual PostgreSQL revocation failure without claiming logout completed', async () => {
    const { user, session } = await createIdentity('logout-outage')
    request.cookie = `authjs.session-token=${session.sessionToken}`
    request.failDelete = true

    await expect(signOut({ redirectTo: '/' })).rejects.toThrow(
      'Authentication is temporarily unavailable.',
    )

    expect(await getCurrentUser()).toEqual({
      id: user.id, name: null, email: null, image: null, favoriteMovie: null,
    })
  })
})
