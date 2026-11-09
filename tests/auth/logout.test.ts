// FR-11, NFR-06: Verify revocation failures never become successful logout.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const boundary = vi.hoisted(() => ({
  findSession: vi.fn(), findUser: vi.fn(), deleteSession: vi.fn(),
  cookie: 'authjs.session-token=harmless-logout-session',
}))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'localhost:3000', cookie: boundary.cookie }),
  cookies: async () => ({ set: vi.fn() }),
}))
vi.mock('../../src/lib/db', () => ({
  prisma: {
    session: {
      findUnique: boundary.findSession, delete: boundary.deleteSession, update: vi.fn(),
    },
    user: { findUnique: boundary.findUser },
  },
}))

import { signOut, handlers } from '../../src/auth'
import { getCurrentUser } from '../../src/lib/identity'
import { POST } from '../../src/app/api/auth/[...nextauth]/route'

const user = { id: 'logout-owner', name: null, email: null, image: null, favoriteMovie: 'Arrival' }

beforeEach(() => {
  vi.stubEnv('AUTH_URL', 'http://localhost:3000')
  vi.stubEnv('AUTH_SECRET', 'harmless-logout-secret-long-enough-for-testing')
  vi.stubEnv('AUTH_GOOGLE_ID', 'harmless-google-id')
  vi.stubEnv('AUTH_GOOGLE_SECRET', 'harmless-google-secret')
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('External network forbidden'))))
  boundary.findSession.mockReset().mockResolvedValue({
    id: 'logout-session', userId: user.id, sessionToken: 'harmless-logout-session',
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    user: { ...user, emailVerified: null },
  })
  boundary.findUser.mockReset().mockResolvedValue(user)
  boundary.deleteSession.mockReset().mockImplementation(async () => {
    boundary.findSession.mockResolvedValue(null)
    return {}
  })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function postLogout() {
  const csrf = await handlers.GET(new NextRequest('http://localhost:3000/api/auth/csrf'))
  const payload: unknown = await csrf.json()
  if (!payload || typeof payload !== 'object' || !('csrfToken' in payload) ||
      typeof payload.csrfToken !== 'string') throw new Error('Missing synthetic CSRF token')
  const cookies = csrf.headers.getSetCookie()
    .map((value) => value.split(';')[0]).filter((value) => value !== undefined).join('; ')
  return POST(new NextRequest('http://localhost:3000/api/auth/signout', {
    method: 'POST',
    headers: {
      cookie: `${boundary.cookie}; ${cookies}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ csrfToken: payload.csrfToken, callbackUrl: '/' }),
  }))
}

describe('T14-H1 actual installed logout boundaries', () => {
  it.each([true, false])('rejects failed revocation with redirect=%s instead of reporting success', async (redirect) => {
    boundary.deleteSession.mockRejectedValue(new Error('Synthetic private deletion failure'))

    await expect(signOut({ redirect, redirectTo: '/' })).rejects.toThrow(
      'Authentication is temporarily unavailable.',
    )
    // Revocation failed: the original token remains valid, and success must not be claimed.
    expect(await getCurrentUser()).toEqual(user)
  })

  it('preserves the successful helper redirect after revocation', async () => {
    await expect(signOut({ redirectTo: '/' })).rejects.toMatchObject({
      digest: 'NEXT_REDIRECT;replace;http://localhost:3000/;307;',
    })

    expect(await getCurrentUser()).toBeNull()
  })

  it('keeps concurrent failed and successful logout contexts separate', async () => {
    boundary.deleteSession.mockRejectedValueOnce(new Error('Synthetic private deletion failure'))

    const results = await Promise.allSettled([
      signOut({ redirect: false }), signOut({ redirect: false }),
    ])

    expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled'])
  })

  it('does not mark a concurrent identity read as failed when logout revocation fails', async () => {
    boundary.deleteSession.mockRejectedValue(new Error('Synthetic private deletion failure'))

    const [logout, identity] = await Promise.allSettled([
      signOut({ redirect: false }), getCurrentUser(),
    ])

    expect(logout.status).toBe('rejected')
    expect(identity).toEqual({ status: 'fulfilled', value: user })
  })

  it('returns a sanitized HTTP failure rather than a success redirect when deletion fails', async () => {
    boundary.deleteSession.mockRejectedValue(new Error('Synthetic private deletion failure'))

    const response = await postLogout()

    expect(response.status).toBe(503)
    expect(response.headers.get('location')).toBeNull()
    expect(await response.json()).toEqual({ error: 'Authentication is temporarily unavailable.' })
    expect(await getCurrentUser()).toEqual(user)
  })

  it('preserves successful POST redirect and database-session revocation', async () => {
    const response = await postLogout()

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('http://localhost:3000/')
    expect(await getCurrentUser()).toBeNull()
  })
})
