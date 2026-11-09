// NFR-02, NFR-09: Create only uniquely owned fixtures on the verified test database.
import { randomUUID } from 'node:crypto'
import { openTestDatabase } from '../fixtures/database'

// This guard opens only the authorized test DB before any production import.
// The module mock supplies this real client, never a simulated adapter.
export const prisma = await openTestDatabase()
export const namespace = `task6_7_${randomUUID()}_`

export async function createIdentity(label: string) {
  const user = await prisma.user.create({
    data: { id: namespace + label, name: null, email: null, image: null },
  })
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      sessionToken: randomUUID(),
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  })
  return { user, session }
}
