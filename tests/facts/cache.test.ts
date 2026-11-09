// FR-08, NFR-04: Check exact cache boundaries against database time.
import { expect, it, vi } from 'vitest'
import { databaseNow, empty, harness, stored } from './helpers'
import type { FactSnapshot } from '../../src/lib/fact-engine/types'

it.each([
  [-1, false], [0, true], [59_000, true], [59_999, true], [60_000, false], [60_001, false],
])('uses the DB age %i ms with fresh=%s despite application clock skew', async (age, fresh) => {
  const { service, store, provider } = harness()
  store.readLatest.mockResolvedValue({
    databaseNow, latest: { ...stored, text: 'Cached', createdAt: new Date(databaseNow.getTime() - age) },
  })
  vi.spyOn(Date, 'now').mockReturnValue(0)
  try {
    expect(await service()).toMatchObject({ kind: 'fact', text: fresh ? 'Cached' : 'Persisted fact' })
    expect(provider).toHaveBeenCalledTimes(fresh ? 0 : 1)
  } finally {
    vi.restoreAllMocks()
  }
})

it('rechecks the coordinated DB cache before generating', async () => {
  const { service, store, provider } = harness()
  store.readLatest.mockResolvedValueOnce(empty)
    .mockResolvedValue({ databaseNow, latest: stored })
  expect(await service()).toMatchObject({ kind: 'fact', text: 'Persisted fact' })
  expect(provider).not.toHaveBeenCalled()
})

it('rechecks a delayed initial stale reader after another flight has persisted', async () => {
  const { service, store, provider } = harness()
  const delayedRead = Promise.withResolvers<FactSnapshot>()
  store.readLatest.mockImplementationOnce(() => delayedRead.promise)
  store.insert.mockImplementation(async () => {
    store.readLatest.mockResolvedValue({ databaseNow, latest: stored })
    return stored
  })
  const delayed = service()
  await service()
  delayedRead.resolve(empty)
  expect(await delayed).toMatchObject({ kind: 'fact', text: 'Persisted fact' })
  expect(provider).toHaveBeenCalledTimes(1)
  expect(store.insert).toHaveBeenCalledTimes(1)
})
