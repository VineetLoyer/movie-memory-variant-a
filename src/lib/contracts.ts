// FR-06, NFR-02: Describe page data without account credentials.
export type UserView = {
  id: string
  name: string | null
  email: string | null
  image: string | null
  favoriteMovie: string | null
}

// FR-03, FR-05, NFR-06: Separate saved results from validation and service failures.
export type SaveMovieResult =
  | { kind: 'saved' }
  | {
      kind: 'error'
      code: 'UNAUTHENTICATED' | 'INVALID_MOVIE' | 'ALREADY_ONBOARDED' | 'UNAVAILABLE'
      message: string
    }

// FR-08, FR-10, NFR-06: Describe saved facts, stale fallback, and unavailable results.
export type FactResult =
  | { kind: 'fact'; text: string; createdAt: string; stale: boolean }
  | {
      kind: 'error'
      code: 'UNAUTHENTICATED' | 'ONBOARDING_REQUIRED' | 'UNAVAILABLE'
      message: string
    }
