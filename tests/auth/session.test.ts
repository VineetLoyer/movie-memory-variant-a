// FR-01, FR-12, NFR-02: Check session identity and safe redirects with controlled storage.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { NextRequest } from 'next/server'

const boundary = vi.hoisted(() => ({
  cookie: 'authjs.session-token=harmless-unit-session',
  findSession: vi.fn(),
  findUser: vi.fn(),
  deleteSession: vi.fn(),
  updateSession: vi.fn(),
  setCookie: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'localhost:3000', cookie: boundary.cookie }),
  cookies: async () => ({ set: boundary.setCookie }),
}))
vi.mock('../../src/lib/db', () => ({
  prisma: {
    session: {
      findUnique: boundary.findSession,
      delete: boundary.deleteSession,
      update: boundary.updateSession,
    },
    user: { findUnique: boundary.findUser },
  },
}))

import { prisma } from '../../src/lib/db'

const persisted = {
  id: 'internal-owner', name: null, email: null, image: null,
  favoriteMovie: null,
}
const expires = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

beforeEach(() => {
  vi.stubEnv('AUTH_URL', 'http://localhost:3000')
  vi.stubEnv('AUTH_SECRET', 'harmless-unit-secret-long-enough-for-testing')
  vi.stubEnv('AUTH_GOOGLE_ID', 'harmless-google-id')
  vi.stubEnv('AUTH_GOOGLE_SECRET', 'harmless-google-secret')
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('External network forbidden'))))
  boundary.cookie = 'authjs.session-token=harmless-unit-session'
  boundary.findSession.mockReset().mockResolvedValue({
    id: 'session-row', sessionToken: 'harmless-unit-session',
    userId: persisted.id, expires: expires(), user: { ...persisted, emailVerified: null },
  })
  boundary.findUser.mockReset().mockResolvedValue(persisted)
  boundary.deleteSession.mockReset().mockResolvedValue({})
  boundary.updateSession.mockReset().mockResolvedValue({})
  boundary.setCookie.mockReset()
})

describe('installed Auth.js storage failure behavior', () => {
  it('converts a failing Prisma adapter session read into null without application handling', async () => {
    boundary.findSession.mockRejectedValue(new Error('Synthetic storage outage'))
    const framework = NextAuth({
      adapter: PrismaAdapter(prisma), providers: [], session: { strategy: 'database' },
      logger: { error: vi.fn() },
    })

    const result = await framework.auth()

    expect(result).toBeNull()
  })
})

describe('current identity through the installed session helper', () => {
  it('rejects an adapter outage instead of reporting an anonymous identity', async () => {
    boundary.findSession.mockRejectedValue(new Error('Synthetic storage outage'))
    const { getCurrentUser } = await import('../../src/lib/identity')

    await expect(getCurrentUser()).rejects.toThrow('Authentication is temporarily unavailable.')
  })

  it('returns the persisted nullable profile using the adapter internal ID', async () => {
    const { getCurrentUser } = await import('../../src/lib/identity')

    const result = await getCurrentUser()

    expect(result).toEqual({
      id: 'internal-owner', name: null, email: null, image: null, favoriteMovie: null,
    })
  })

  it.each(['absent', 'deleted', 'expired'] as const)('returns null for a %s session', async (state) => {
    if (state === 'absent') boundary.cookie = ''
    if (state === 'deleted') boundary.findSession.mockResolvedValue(null)
    if (state === 'expired') boundary.findSession.mockResolvedValue({
      id: 'expired', sessionToken: 'harmless-unit-session', userId: persisted.id,
      expires: new Date(0), user: persisted,
    })
    const { getCurrentUser } = await import('../../src/lib/identity')

    expect(await getCurrentUser()).toBeNull()
  })

  it('returns null if the persisted user was deleted after session resolution', async () => {
    boundary.findUser.mockResolvedValue(null)
    const { getCurrentUser } = await import('../../src/lib/identity')

    expect(await getCurrentUser()).toBeNull()
  })

  it('rejects a failed persisted-user reread', async () => {
    boundary.findUser.mockRejectedValue(new Error('Synthetic user read outage'))
    const { getCurrentUser } = await import('../../src/lib/identity')

    await expect(getCurrentUser()).rejects.toThrow('Synthetic user read outage')
  })

  it('preserves separate concurrent outcomes when only one session read fails', async () => {
    boundary.findSession.mockRejectedValueOnce(new Error('Synthetic storage outage'))
    const { getCurrentUser } = await import('../../src/lib/identity')

    const results = await Promise.allSettled([getCurrentUser(), getCurrentUser()])

    expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled'])
  })

  it('does not use a stale adapter profile instead of the persisted user', async () => {
    boundary.findUser.mockResolvedValue({ ...persisted, name: 'Persisted name', favoriteMovie: 'Arrival' })
    const { getCurrentUser } = await import('../../src/lib/identity')

    expect(await getCurrentUser()).toEqual({
      id: persisted.id, name: 'Persisted name', email: null, image: null, favoriteMovie: 'Arrival',
    })
  })
})

describe('installed authentication route and sign-out', () => {
  it('serves a session with the internal ID through the actual GET handler', async () => {
    const { GET } = await import('../../src/app/api/auth/[...nextauth]/route')

    const response = await GET(new NextRequest('http://localhost:3000/api/auth/session', {
      headers: { cookie: boundary.cookie },
    }))

    expect(await response.json()).toEqual({
      expires: expect.any(String),
      user: { id: persisted.id, name: null, email: null, image: null },
    })
  })

  it('routes a safe sign-in error to the retry landing page', async () => {
    const { handlers } = await import('../../src/auth')

    const response = await handlers.GET(new NextRequest('http://localhost:3000/api/auth/error?error=AccessDenied'))

    expect(response.headers.get('location')).toBe('/?error=AccessDenied')
  })

  it('removes the database session through the installed server sign-out helper', async () => {
    boundary.deleteSession.mockImplementation(async () => {
      boundary.findSession.mockResolvedValue(null)
      return {}
    })
    const { signOut } = await import('../../src/auth')
    const { getCurrentUser } = await import('../../src/lib/identity')

    await signOut({ redirect: false, redirectTo: '/' })

    expect(await getCurrentUser()).toBeNull()
  })
})
