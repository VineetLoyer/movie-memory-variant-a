'use server'

import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'
import { signIn, signOut } from '@/auth'
import { saveFavoriteMovie } from '@/lib/identity'
import type { SaveMovieResult } from '@/lib/contracts'
import type { AuthActionState } from '@/components/auth-form'
import { AuthenticationUnavailableError } from '@/lib/auth-errors'

// FR-01, FR-02: Start Google sign-in and preserve the framework redirect.
export async function signInWithGoogle(): Promise<AuthActionState> {
  try {
    return await signIn('google', { redirectTo: '/dashboard' })
  } catch (error) {
    if (error instanceof AuthError) return { kind: 'error' }
    throw error
  }
}

// FR-11, NFR-06: Redirect only after revocation; return a safe retry state on failure.
export async function signOutToHome(): Promise<AuthActionState> {
  try {
    return await signOut({ redirectTo: '/' })
  } catch (error) {
    if (error instanceof AuthenticationUnavailableError) return { kind: 'error' }
    throw error
  }
}

// FR-03, FR-05: Reject non-text form values and redirect only after a saved result.
export async function saveMovie(
  _previous: SaveMovieResult | null,
  form: FormData,
): Promise<SaveMovieResult> {
  const movie = form.get('movie')
  if (typeof movie !== 'string') {
    return { kind: 'error', code: 'INVALID_MOVIE', message: 'Enter a movie title between 1 and 200 characters.' }
  }
  const result = await saveFavoriteMovie(movie)
  switch (result.kind) {
    case 'saved':
      redirect('/dashboard')
    case 'error':
      switch (result.code) {
        case 'ALREADY_ONBOARDED':
          redirect('/dashboard')
        case 'UNAUTHENTICATED':
        case 'INVALID_MOVIE':
        case 'UNAVAILABLE':
          return result
        default:
          return assertNever(result.code)
      }
    default:
      return assertNever(result)
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unexpected action result: ${String(value)}`)
}
