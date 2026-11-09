import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'
import NextAuth, { AuthError } from 'next-auth'
import type { NextAuthResult } from 'next-auth'
import Google from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/db'
import { AuthenticationUnavailableError } from '@/lib/auth-errors'

class AuthenticationConfigurationError extends Error {
  constructor() {
    super('Configure AUTH_URL with the canonical application origin.')
    this.name = 'AuthenticationConfigurationError'
  }
}

// FR-11, NFR-06: Auth.js can swallow adapter failures during session reads and logout.
// Keep the failure signal local to each operation.
const authOperations = new AsyncLocalStorage<{ failed: boolean }>()

// FR-01, NFR-02: Use real Google OAuth and a validated application origin.
const nextAuth = NextAuth(() => {
  const configuredOrigin = process.env['AUTH_URL']
  if (!configuredOrigin) throw new AuthenticationConfigurationError()
  let origin: URL
  try {
    origin = new URL(configuredOrigin)
  } catch (error) {
    if (error instanceof TypeError) throw new AuthenticationConfigurationError()
    throw error
  }
  if (origin.username || origin.password || origin.search || origin.hash ||
      origin.pathname !== '/' ||
      (origin.protocol !== 'https:' &&
        !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)))) {
    throw new AuthenticationConfigurationError()
  }

  return {
    adapter: PrismaAdapter(prisma),
    providers: [Google],
    session: { strategy: 'database' },
    // AUTH_URL pins request URLs in the installed NextAuth integration.
    trustHost: true,
    pages: { signIn: '/', error: '/', signOut: '/' },
    callbacks: {
      // FR-06, NFR-02: Return profile fields and the stable ID, not account tokens.
      session({ session, user }) {
        return {
          expires: session.expires,
          user: {
            id: user.id,
            name: user.name ?? null,
            email: user.email ?? null,
            image: user.image ?? null,
          },
        }
      },
      // FR-02, NFR-02: Keep redirects on the application origin.
      redirect({ url }) {
        return new URL(url === '/' || url === origin.origin + '/' ? '/' : '/dashboard', origin).href
      },
    },
    logger: {
      error(error) {
        const operation = authOperations.getStore()
        if (operation) operation.failed = true
        // Never emit adapter causes, provider bodies, profile data or credentials.
        console.error('[auth] Authentication operation failed.', {
          code: error instanceof AuthError ? error.type : 'AuthenticationError',
        })
      },
    },
  }
})

// FR-11, FR-12: Preserve storage failures instead of reporting successful logout or no session.
async function withAuthErrors<T>(operation: () => Promise<T>): Promise<T> {
  const state = { failed: false }
  return authOperations.run(state, async () => {
    let result: T
    try {
      result = await operation()
    } catch (error) {
      // A failed revocation must replace Auth.js's normal success redirect.
      if (state.failed) throw new AuthenticationUnavailableError()
      throw error
    }
    if (state.failed) throw new AuthenticationUnavailableError()
    return result
  })
}

export const { auth, signIn } = nextAuth
export const signOut: NextAuthResult['signOut'] = (options) =>
  withAuthErrors(() => nextAuth.signOut(options))

export const handlers: NextAuthResult['handlers'] = {
  GET: nextAuth.handlers.GET,
  async POST(request) {
    if (request.nextUrl.pathname !== '/api/auth/signout') return nextAuth.handlers.POST(request)
    try {
      return await withAuthErrors(() => nextAuth.handlers.POST(request))
    } catch (error) {
      if (error instanceof AuthenticationUnavailableError) {
        return Response.json({ error: error.message }, { status: 503 })
      }
      throw error
    }
  },
}

/** FR-12: Preserve failures hidden by Auth.js session reads. */
export async function readSession() {
  return withAuthErrors(() => auth())
}
