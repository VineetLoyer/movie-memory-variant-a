// FR-01, FR-03, FR-11, NFR-06: Check action redirects and safe retry results.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthError } from 'next-auth'
import { signIn, signOut } from '../fixtures/auth'
import { saveFavoriteMovie } from '../fixtures/identity'
import { saveMovie, signInWithGoogle, signOutToHome } from '../../src/app/actions'
import { AuthenticationUnavailableError } from '../../src/lib/auth-errors'

class Redirected extends Error {
  constructor(readonly destination: string) { super('Framework redirect') }
}
vi.mock('next/navigation', () => ({
  redirect: (destination: string): never => { throw new Redirected(destination) },
}))
beforeEach(() => { saveFavoriteMovie.mockResolvedValue({ kind: 'saved' }) })

describe('onboarding FormData boundary', () => {
  it.each(['missing', 'file'] as const)('rejects %s movie input before calling the string service', async kind => {
    const form = new FormData()
    if (kind === 'file') form.set('movie', new File(['title'], 'movie.txt'))
    const result = await saveMovie(null, form)
    expect(result).toMatchObject({ kind: 'error', code: 'INVALID_MOVIE' })
    expect(saveFavoriteMovie).not.toHaveBeenCalled()
  })

  it('passes the movie string while ignoring a forged owner selector', async () => {
    const form = new FormData()
    form.set('movie', '  Arrival  ')
    form.set('userId', 'somebody-else')
    await expect(saveMovie(null, form)).rejects.toMatchObject({ destination: '/dashboard' })
    expect(saveFavoriteMovie.mock.calls).toEqual([['  Arrival  ']])
  })

  it('redirects a repeated submission without granting an overwrite', async () => {
    saveFavoriteMovie.mockResolvedValue({ kind: 'error', code: 'ALREADY_ONBOARDED', message: 'Already saved' })
    const form = new FormData()
    form.set('movie', 'A different title')
    await expect(saveMovie(null, form)).rejects.toMatchObject({ destination: '/dashboard' })
  })

  it.each(['INVALID_MOVIE', 'UNAUTHENTICATED', 'UNAVAILABLE'] as const)('returns typed %s failures for inline recovery', async code => {
    saveFavoriteMovie.mockResolvedValue({ kind: 'error', code, message: 'Safe fixture message' })
    const form = new FormData()
    form.set('movie', 'Arrival')
    expect(await saveMovie(null, form)).toMatchObject({ kind: 'error', code })
  })
})

describe('Google and sign-out adapters', () => {
  it('preserves the Google helper redirect to dashboard', async () => {
    const redirect = new Redirected('/dashboard')
    vi.mocked(signIn).mockRejectedValue(redirect)
    await expect(signInWithGoogle()).rejects.toBe(redirect)
    expect(signIn).toHaveBeenCalledWith('google', { redirectTo: '/dashboard' })
  })

  it('turns an Auth.js failure into a friendly retry without exposing the provider error', async () => {
    vi.mocked(signIn).mockRejectedValue(new AuthError('Controlled private fixture detail'))
    expect(await signInWithGoogle()).toEqual({ kind: 'error' })
  })

  it('preserves the logout helper redirect to the landing page', async () => {
    const redirect = new Redirected('/')
    vi.mocked(signOut).mockRejectedValue(redirect)
    await expect(signOutToHome()).rejects.toBe(redirect)
    expect(signOut).toHaveBeenCalledWith({ redirectTo: '/' })
  })

  it('does not misclassify an unknown infrastructure rejection as a successful logout', async () => {
    const failure = new Error('Controlled infrastructure error')
    vi.mocked(signOut).mockRejectedValue(failure)
    await expect(signOutToHome()).rejects.toBe(failure)
  })

  it('returns a retryable inline failure when session revocation is unavailable', async () => {
    vi.mocked(signOut).mockRejectedValue(new AuthenticationUnavailableError())
    expect(await signOutToHome()).toEqual({ kind: 'error' })
  })
})
