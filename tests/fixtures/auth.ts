// NFR-08: Test-only doubles preserve the installed Auth.js overloads, including redirects.
import { vi } from 'vitest'
import type { NextAuthResult } from 'next-auth'

// Supplying the overload intersection as vi.fn's generic collapses it to the
// last call signature. Contextual export types preserve the installed API.
export const auth: NextAuthResult['auth'] = vi.fn()
export const signIn: NextAuthResult['signIn'] = vi.fn()
export const signOut: NextAuthResult['signOut'] = vi.fn()
export const handlers = {
  GET: vi.fn<NextAuthResult['handlers']['GET']>(),
  POST: vi.fn<NextAuthResult['handlers']['POST']>(),
} satisfies NextAuthResult['handlers']
