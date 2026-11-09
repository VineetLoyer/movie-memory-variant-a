// FR-03, FR-04, FR-05: Check title validation and session-owned saves.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({
  session: vi.fn(), findUser: vi.fn(), update: vi.fn(),
}))
vi.mock('../../src/auth', () => ({ readSession: boundary.session }))
vi.mock('../../src/lib/db', () => ({
  prisma: { user: { findUnique: boundary.findUser, updateMany: boundary.update } },
}))

import * as identity from '../../src/lib/identity'

beforeEach(() => {
  boundary.session.mockReset().mockResolvedValue({
    user: { id: 'trusted-owner' }, expires: new Date(Date.now() + 60_000).toISOString(),
  })
  boundary.findUser.mockReset().mockResolvedValue({
    id: 'trusted-owner', name: null, email: null, image: null, favoriteMovie: null,
  })
  boundary.update.mockReset().mockResolvedValue({ count: 1 })
})

describe('atomic onboarding service', () => {
  it.each([' A ', 'x'.repeat(200), '\u{1f3ac}'.repeat(100)])(
    'accepts trimmed input at a valid UTF-16 boundary', async (input) => {
      expect(await identity.saveFavoriteMovie(input)).toEqual({ kind: 'saved' })
    },
  )

  it.each(['', '   ', 'x'.repeat(201), '\u{1f3ac}'.repeat(101)])(
    'rejects empty or oversized input without writing', async (input) => {
      expect(await identity.saveFavoriteMovie(input)).toEqual({
        kind: 'error', code: 'INVALID_MOVIE', message: 'Enter a movie title between 1 and 200 characters.',
      })
      expect(boundary.update).not.toHaveBeenCalled()
    },
  )

  it.each(['absent', 'expired', 'deleted-user'] as const)(
    'rejects a %s identity before writing', async (state) => {
      switch (state) {
        case 'absent':
          boundary.session.mockResolvedValue(null)
          break
        case 'expired':
          boundary.session.mockResolvedValue({ user: { id: 'trusted-owner' }, expires: new Date(0).toISOString() })
          break
        case 'deleted-user':
          boundary.findUser.mockResolvedValue(null)
          break
        default: {
          const unreachable: never = state
          throw new Error(`Unexpected state: ${unreachable}`)
        }
      }

      expect(await identity.saveFavoriteMovie('Arrival')).toEqual({
        kind: 'error', code: 'UNAUTHENTICATED', message: 'Sign in to save your favorite movie.',
      })
      expect(boundary.update).not.toHaveBeenCalled()
    },
  )

  it('reports a lost conditional update without overwriting the saved movie', async () => {
    boundary.update.mockResolvedValue({ count: 0 })

    expect(await identity.saveFavoriteMovie('Arrival')).toEqual({
      kind: 'error', code: 'ALREADY_ONBOARDED', message: 'Your favorite movie is already saved.',
    })
  })

  it.each(['session', 'profile', 'write'] as const)(
    'sanitizes a %s infrastructure failure as unavailable', async (stage) => {
      const outage = new Error('Synthetic private database detail')
      switch (stage) {
        case 'session': boundary.session.mockRejectedValue(outage); break
        case 'profile': boundary.findUser.mockRejectedValue(outage); break
        case 'write': boundary.update.mockRejectedValue(outage); break
        default: {
          const unreachable: never = stage
          throw new Error(`Unexpected stage: ${unreachable}`)
        }
      }

      expect(await identity.saveFavoriteMovie('Arrival')).toEqual({
        kind: 'error', code: 'UNAVAILABLE', message: 'We could not save your movie. Please try again.',
      })
    },
  )

  it('propagates a framework redirect rather than converting it into a service error', async () => {
    const { redirect } = await import('next/navigation')
    boundary.session.mockImplementation(() => redirect('/'))

    await expect(identity.saveFavoriteMovie('Arrival')).rejects.toMatchObject({
      digest: 'NEXT_REDIRECT;replace;/;307;',
    })
  })
})
