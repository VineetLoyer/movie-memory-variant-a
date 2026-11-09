import 'server-only'

import { unstable_rethrow } from 'next/navigation'
import { readSession } from '@/auth'
import { prisma } from '@/lib/db'
import type { SaveMovieResult, UserView } from '@/lib/contracts'
import { validateMovieTitle } from '@/lib/movie-input'

// FR-06, FR-12, NFR-02: Read the persisted profile only for a valid session.
export async function getCurrentUser(): Promise<UserView | null> {
  const session = await readSession()
  if (!session?.user?.id || Date.parse(session.expires) <= Date.now() ||
      !Number.isFinite(Date.parse(session.expires))) return null

  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, image: true, favoriteMovie: true },
  })
}

// FR-03, FR-04, FR-05: Validate input and save once for the session owner.
export async function saveFavoriteMovie(input: string): Promise<SaveMovieResult> {
  try {
    const user = await getCurrentUser()
    if (!user) return {
      kind: 'error', code: 'UNAUTHENTICATED', message: 'Sign in to save your favorite movie.',
    }

    const title = validateMovieTitle(input)
    if (title === null) return {
      kind: 'error', code: 'INVALID_MOVIE', message: 'Enter a movie title between 1 and 200 characters.',
    }

    // FR-05: A conditional update gives competing onboarding saves one winner.
    const result = await prisma.user.updateMany({
      where: { id: user.id, favoriteMovie: null },
      data: { favoriteMovie: title },
    })
    if (result.count === 0) return {
      kind: 'error', code: 'ALREADY_ONBOARDED', message: 'Your favorite movie is already saved.',
    }
    return { kind: 'saved' }
  } catch (error) {
    unstable_rethrow(error)
    // Service boundary: private storage details never enter action results.
    return {
      kind: 'error', code: 'UNAVAILABLE', message: 'We could not save your movie. Please try again.',
    }
  }
}
