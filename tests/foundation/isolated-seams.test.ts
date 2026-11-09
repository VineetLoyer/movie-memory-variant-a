import { expect, test, vi } from 'vitest'
import { getCurrentUser, saveFavoriteMovie } from '@/lib/identity'
import { getFactForCurrentUser } from '@/lib/facts'
import { auth, handlers, signIn, signOut } from '@/auth'

// NFR-08: Isolated tests must resolve controlled doubles, not live service dependencies.
test('isolated project resolves configurable A/B and installed Auth.js helper seams', () => {
  for (const seam of [getCurrentUser, saveFavoriteMovie, getFactForCurrentUser, auth,
    handlers.GET, handlers.POST, signIn, signOut]) {
    expect(vi.isMockFunction(seam)).toBe(true)
  }
})
