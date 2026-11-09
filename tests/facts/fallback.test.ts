// FR-10, NFR-06: Check matching fallback and unavailable results after failure.
import { expect, it } from 'vitest'
import { databaseNow, empty, harness, stored } from './helpers'

it.each([undefined, null, {}, '', ' \n\t ', 42, false])(
  'rejects malformed provider output %s before persistence', async (output) => {
    const { service, provider, store } = harness()
    provider.mockResolvedValue(output)
    expect(await service()).toEqual({
      kind: 'error', code: 'UNAVAILABLE', message: 'We could not load a movie fact. Please try again.',
    })
    expect(store.insert).not.toHaveBeenCalled()
    expect(store.readLatest).toHaveBeenCalledTimes(3)
  },
)

it.each([[0, false], [60_000, true], [-1, true]])(
  'shares the newly arrived fallback using its own DB clock (age %i)', async (age, stale) => {
    const { service, store, provider } = harness()
    store.readLatest.mockResolvedValue({
      databaseNow, latest: { ...stored, text: 'Old', createdAt: new Date(databaseNow.getTime() - 90_000) },
    })
    const failed = Promise.withResolvers<unknown>()
    const started = Promise.withResolvers<void>()
    provider.mockImplementation(() => {
      started.resolve()
      return failed.promise
    })
    const calls = Array.from({ length: 50 }, () => service())
    await started.promise
    const fallbackNow = new Date(databaseNow.getTime() + 120_000)
    const arrivedAt = new Date(fallbackNow.getTime() - age)
    store.readLatest.mockResolvedValue({
      databaseNow: fallbackNow,
      latest: { id: 'arrived', text: 'New matching fallback', createdAt: arrivedAt },
    })
    failed.reject(new Error('controlled provider failure'))
    expect(await Promise.all(calls)).toEqual(Array.from({ length: 50 }, () => ({
      kind: 'fact', text: 'New matching fallback', createdAt: arrivedAt.toISOString(), stale,
    })))
    expect(provider).toHaveBeenCalledTimes(1)
    expect(store.insert).not.toHaveBeenCalled()
    expect(store.readLatest).toHaveBeenCalledTimes(52)
  },
)

it.each(['initial', 'recheck', 'insert', 'fallback'] as const)(
  'returns unavailable without masking a database %s failure as provider fallback', async (point) => {
    const { service, store, provider } = harness()
    switch (point) {
      case 'initial': store.readLatest.mockRejectedValueOnce(new Error('controlled DB')); break
      case 'recheck':
        store.readLatest.mockResolvedValueOnce(empty).mockRejectedValueOnce(new Error('controlled DB'))
        break
      case 'insert':
        store.insert.mockRejectedValueOnce(new Error('controlled DB'))
        store.readLatest.mockResolvedValueOnce(empty).mockResolvedValueOnce(empty)
          .mockResolvedValue({ databaseNow, latest: stored })
        break
      case 'fallback':
        provider.mockRejectedValueOnce(new Error('controlled provider'))
        store.readLatest.mockResolvedValueOnce(empty).mockResolvedValueOnce(empty)
          .mockRejectedValueOnce(new Error('controlled DB'))
        break
      default: {
        const exhaustive: never = point
        throw exhaustive
      }
    }
    expect(await service()).toEqual({
      kind: 'error', code: 'UNAVAILABLE', message: 'We could not load a movie fact. Please try again.',
    })
    if (point === 'initial' || point === 'recheck') expect(provider).not.toHaveBeenCalled()
    expect(store.readLatest).toHaveBeenCalledTimes(point === 'initial' ? 1 : point === 'fallback' ? 3 : 2)
  },
)

it('shares a provider error with no cache and allows immediate retry', async () => {
  const { service, provider, store } = harness()
  provider.mockRejectedValueOnce(new Error('controlled provider'))
  const results = await Promise.all(Array.from({ length: 50 }, () => service()))
  expect(results).toEqual(Array.from({ length: 50 }, () => ({
    kind: 'error', code: 'UNAVAILABLE', message: 'We could not load a movie fact. Please try again.',
  })))
  expect(provider).toHaveBeenCalledTimes(1)
  expect(store.insert).not.toHaveBeenCalled()
  expect(await service()).toMatchObject({ kind: 'fact' })
  expect(provider).toHaveBeenCalledTimes(2)
})
