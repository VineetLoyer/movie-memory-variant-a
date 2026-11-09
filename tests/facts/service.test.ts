// FR-07 through FR-10, FR-12: Check trusted identity, saved scope, and returned outcomes.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCurrentUser } from '../fixtures/identity'
import { createFactService } from '../../src/lib/fact-engine/service'
import type { FactStore } from '../../src/lib/fact-engine/types'
import type { UserView } from '../../src/lib/contracts'

const user: UserView = {
  id: 'owner', favoriteMovie: 'Arrival', name: null, email: null, image: null,
}
const now = new Date('2026-11-08T12:00:00.000Z')
const persisted = { id: 'persisted', text: 'Stored text', createdAt: now }

function setup() {
  const store = {
    readLatest: vi.fn<FactStore['readLatest']>().mockResolvedValue({ databaseNow: now, latest: null }),
    insert: vi.fn<FactStore['insert']>().mockResolvedValue(persisted),
  }
  const provider = vi.fn().mockResolvedValue('  Generated text  ')
  const service = createFactService({ getCurrentUser, store, provider })
  return { store, provider, service }
}

beforeEach(() => {
  vi.resetAllMocks()
  getCurrentUser.mockResolvedValue(user)
})

describe('trusted fact boundary', () => {
  it.each([
    [null, 'UNAUTHENTICATED'],
    [{ ...user, favoriteMovie: null }, 'ONBOARDING_REQUIRED'],
  ])('rejects missing identity/movie before accessing facts: %s', async (identity, code) => {
    getCurrentUser.mockResolvedValue(identity)
    const { service, store, provider } = setup()
    expect(await service()).toMatchObject({ kind: 'error', code })
    expect(store.readLatest).not.toHaveBeenCalled()
    expect(store.insert).not.toHaveBeenCalled()
    expect(provider).not.toHaveBeenCalled()
  })

  it('converts identity infrastructure failure without accessing facts', async () => {
    getCurrentUser.mockRejectedValue(new Error('private identity failure'))
    const { service, store, provider } = setup()
    expect(await service()).toMatchObject({ kind: 'error', code: 'UNAVAILABLE' })
    expect(store.readLatest).not.toHaveBeenCalled()
    expect(provider).not.toHaveBeenCalled()
  })

  it('rereads identity on each request and scopes storage to saved owner/movie', async () => {
    const { service, store } = setup()
    await service()
    getCurrentUser.mockResolvedValue({ ...user, id: 'another', favoriteMovie: 'Alien' })
    await service()
    expect(store.insert.mock.calls).toEqual([
      [{ userId: 'owner', movieTitle: 'Arrival' }, 'Generated text'],
      [{ userId: 'another', movieTitle: 'Alien' }, 'Generated text'],
    ])
  })

  it('returns the database persisted record rather than provider text or application clock', async () => {
    const { service } = setup()
    vi.spyOn(Date, 'now').mockReturnValue(0)
    try {
      expect(await service()).toEqual({
        kind: 'fact', text: 'Stored text', createdAt: '2026-11-08T12:00:00.000Z', stale: false,
      })
    } finally {
      vi.restoreAllMocks()
    }
  })

  it.each(['read', 'insert'] as const)('returns safe unavailable on %s failure', async (point) => {
    const { service, store, provider } = setup()
    store[point === 'read' ? 'readLatest' : 'insert'].mockRejectedValue(new Error('private DB error'))
    expect(await service()).toEqual({
      kind: 'error', code: 'UNAVAILABLE', message: 'We could not load a movie fact. Please try again.',
    })
    if (point === 'read') expect(provider).not.toHaveBeenCalled()
  })
})
