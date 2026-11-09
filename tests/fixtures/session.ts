// FR-11, FR-12, NFR-08: Create owned database sessions for access and revocation tests.
import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

// TEST ONLY. The caller must obtain this client from openTestDatabase first.
// Retain the exact user ID for cleanup even if nested fixture creation rejects.
export async function seedSession(
  database: PrismaClient,
  profile: Readonly<{ id: string; favoriteMovie: string | null }>,
) {
  const sessionToken = randomUUID()
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  const user = await database.user.create({
    data: {
      ...profile,
      name: 'Fixture profile',
      email: `${profile.id}@example.invalid`,
      accounts: {
        create: {
          type: 'oauth', provider: 'google', providerAccountId: randomUUID(),
        },
      },
      sessions: { create: { sessionToken, expires } },
    },
  })
  return {
    user,
    sessionToken,
    expires,
    // Auth.js selects this non-secure cookie for the approved local HTTP origin.
    cookieName: 'authjs.session-token' as const,
  }
}
