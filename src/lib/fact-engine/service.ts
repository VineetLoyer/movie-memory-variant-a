import 'server-only'

import type { FactResult, UserView } from '../contracts'
import type { FactProvider, FactSnapshot, FactStore, StoredFact } from './types'
import { factFlights } from './flights'
import { generateWithinDeadline } from './generation'

export type FactDependencies = Readonly<{
  getCurrentUser: () => Promise<UserView | null>
  store: FactStore
  provider: FactProvider
}>

const unavailable: FactResult = {
  kind: 'error', code: 'UNAVAILABLE',
  message: 'We could not load a movie fact. Please try again.',
}

// FR-08, NFR-04: Compare database time; exactly 60 seconds is stale.
export function isFresh(snapshot: FactSnapshot): boolean {
  if (!snapshot.latest) return false
  const age = snapshot.databaseNow.getTime() - snapshot.latest.createdAt.getTime()
  return age >= 0 && age < 60_000
}

function factResult(fact: StoredFact, stale = false): FactResult {
  return { kind: 'fact', text: fact.text, createdAt: fact.createdAt.toISOString(), stale }
}

// FR-07 through FR-10: Coordinate cache, generation, persistence, and fallback.
export function createFactService(dependencies: FactDependencies): () => Promise<FactResult> {
  return async () => {
    // This is the safe public service boundary: never expose database/provider errors.
    try {
      const user = await dependencies.getCurrentUser()
      if (!user) return {
        kind: 'error', code: 'UNAUTHENTICATED', message: 'Please sign in to see a movie fact.',
      }
      if (user.favoriteMovie === null) return {
        kind: 'error', code: 'ONBOARDING_REQUIRED', message: 'Save your favorite movie first.',
      }
      // FR-12, NFR-02: Derive the scope from the signed-in user's saved record.
      const scope = { userId: user.id, movieTitle: user.favoriteMovie }
      const snapshot = await dependencies.store.readLatest(scope)
      if (snapshot.latest && isFresh(snapshot)) return factResult(snapshot.latest)
      const key = JSON.stringify([scope.userId, scope.movieTitle])
      const existing = factFlights.get(key)
      if (existing) return existing
      // FR-09, NFR-05: Register before yielding so overlapping requests share one task.
      const flight: Promise<FactResult> = Promise.resolve().then(async (): Promise<FactResult> => {
        try {
          const rechecked = await dependencies.store.readLatest(scope)
          if (rechecked.latest && isFresh(rechecked)) return factResult(rechecked.latest)
          const output = await generateWithinDeadline(dependencies.provider, scope.movieTitle)
          // FR-10: Reuse only a matching saved fact after generation failure.
          if (output === null) {
            const fallback = await dependencies.store.readLatest(scope)
            return fallback.latest ? factResult(fallback.latest, !isFresh(fallback)) : unavailable
          }
          // FR-07: Save successfully before returning provider text.
          const persisted = await dependencies.store.insert(scope, output)
          return factResult(persisted)
        } catch { // no-excuse-ok: catch -- shared result sanitizes infrastructure failures for all waiters.
          return unavailable
        } finally {
          if (factFlights.get(key) === flight) factFlights.delete(key)
        }
      })
      factFlights.set(key, flight)
      return flight
    } catch { // no-excuse-ok: catch -- public boundary sanitizes all infrastructure failures.
      return unavailable
    }
  }
}
