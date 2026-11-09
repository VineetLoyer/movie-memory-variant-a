// NFR-08: Compiler-only checks for public result types and selector-free interfaces.
import type { NextAuthResult, Session } from 'next-auth'
import type { FactResult, SaveMovieResult, UserView } from '@/lib/contracts'
import { getCurrentUser, saveFavoriteMovie } from '@/lib/identity'
import { getFactForCurrentUser } from '@/lib/facts'
import { auth, handlers, signIn, signOut } from '@/auth'

// Compiler-only consumer assignments; this file is never executed by Vitest.
export const identityReader: () => Promise<UserView | null> = getCurrentUser
export const movieWriter: (input: string) => Promise<SaveMovieResult> = saveFavoriteMovie
export const factReader: () => Promise<FactResult> = getFactForCurrentUser
export const authReader: () => Promise<Session | null> = auth
export const authExports: Pick<NextAuthResult, 'auth' | 'handlers' | 'signIn' | 'signOut'> = {
  auth, handlers, signIn, signOut,
}
export const nullableUser: UserView = {
  id: 'contract-user', name: null, email: null, image: null, favoriteMovie: null,
}
export const saved: SaveMovieResult = { kind: 'saved' }
export const saveErrors: SaveMovieResult[] = [
  { kind: 'error', code: 'UNAUTHENTICATED', message: 'Sign in.' },
  { kind: 'error', code: 'INVALID_MOVIE', message: 'Enter a movie.' },
  { kind: 'error', code: 'ALREADY_ONBOARDED', message: 'Already saved.' },
  { kind: 'error', code: 'UNAVAILABLE', message: 'Try again.' },
]
export const fact: FactResult = {
  kind: 'fact', text: 'A fact.', createdAt: '2026-01-01T00:00:00.000Z', stale: false,
}
export const factErrors: FactResult[] = [
  { kind: 'error', code: 'UNAUTHENTICATED', message: 'Sign in.' },
  { kind: 'error', code: 'ONBOARDING_REQUIRED', message: 'Save a movie.' },
  { kind: 'error', code: 'UNAVAILABLE', message: 'Try again.' },
]

// @ts-expect-error -- INVALID_MOVIE belongs only to movie saves.
export const invalidFactCode: FactResult = { kind: 'error', code: 'INVALID_MOVIE', message: 'No.' }
// @ts-expect-error -- Persisted fact successes require their creation timestamp.
export const missingTimestamp: FactResult = { kind: 'fact', text: 'A fact.', stale: false }
// @ts-expect-error -- ONBOARDING_REQUIRED belongs only to fact reads.
export const invalidSaveCode: SaveMovieResult = { kind: 'error', code: 'ONBOARDING_REQUIRED', message: 'No.' }
// @ts-expect-error -- Nullable profile fields remain required keys.
export const missingProfile: UserView = { id: 'contract-user' }
// @ts-expect-error -- The public movie mutation does not accept an owner ID.
export const ownerSelectingSave = () => saveFavoriteMovie('owner', 'movie')
// @ts-expect-error -- The public fact read does not accept an owner ID.
export const ownerSelectingRead = () => getFactForCurrentUser('owner')
