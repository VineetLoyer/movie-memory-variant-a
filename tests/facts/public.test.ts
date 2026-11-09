// FR-07, FR-12, NFR-02: Check public service wiring without browser ownership selectors.
import { expect, it, vi } from 'vitest'
import { getCurrentUser } from '../fixtures/identity'
import type { FactStore, FactProvider } from '../../src/lib/fact-engine/types'

const controlled = vi.hoisted(() => ({
  store: {
    readLatest: vi.fn<FactStore['readLatest']>(),
    insert: vi.fn<FactStore['insert']>(),
  },
  provider: vi.fn<FactProvider>(),
}))
// No production singleton or live provider can load in this isolated wiring test.
vi.mock('@/lib/db', () => ({ prisma: {} }))
vi.mock('../../src/lib/fact-engine/store', () => ({ createFactStore: () => controlled.store }))
vi.mock('../../src/lib/fact-engine/provider', () => ({ generateMovieFact: controlled.provider }))

import { getFactForCurrentUser } from '../../src/lib/facts'

it('wires the no-input public service to the trusted identity scope and persisted cache', async () => {
  getCurrentUser.mockResolvedValue({
    id: 'trusted', favoriteMovie: 'Saved title', name: null, email: null, image: null,
  })
  const createdAt = new Date('2026-11-08T12:00:00Z')
  controlled.store.readLatest.mockResolvedValue({
    databaseNow: createdAt, latest: { id: 'row', text: 'Trusted persisted fact', createdAt },
  })
  expect(await getFactForCurrentUser()).toEqual({
    kind: 'fact', text: 'Trusted persisted fact', createdAt: '2026-11-08T12:00:00.000Z', stale: false,
  })
  expect(controlled.store.readLatest).toHaveBeenCalledWith({ userId: 'trusted', movieTitle: 'Saved title' })
  expect(controlled.provider).not.toHaveBeenCalled()
  expect(controlled.store.insert).not.toHaveBeenCalled()
})
