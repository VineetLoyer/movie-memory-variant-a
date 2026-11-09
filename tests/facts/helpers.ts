// NFR-08: Controlled dependencies for deterministic fact-service tests.
import { randomUUID } from 'node:crypto'
import { vi } from 'vitest'
import type { UserView } from '../../src/lib/contracts'
import type { FactProvider, FactSnapshot, FactStore } from '../../src/lib/fact-engine/types'
import { createFactService } from '../../src/lib/fact-engine/service'

export const databaseNow = new Date('2026-11-08T12:00:00.000Z')
export const stored = { id: 'persisted', text: 'Persisted fact', createdAt: databaseNow }
export const empty: FactSnapshot = { databaseNow, latest: null }

export function harness() {
  const user: UserView = {
    id: randomUUID(), favoriteMovie: 'Arrival', name: null, email: null, image: null,
  }
  const identity = vi.fn<() => Promise<UserView | null>>().mockResolvedValue(user)
  const store = {
    readLatest: vi.fn<FactStore['readLatest']>().mockResolvedValue(empty),
    insert: vi.fn<FactStore['insert']>().mockResolvedValue(stored),
  }
  const provider = vi.fn<FactProvider>().mockResolvedValue(' Generated fact ')
  const service = createFactService({ getCurrentUser: identity, store, provider })
  return { user, identity, store, provider, service }
}
