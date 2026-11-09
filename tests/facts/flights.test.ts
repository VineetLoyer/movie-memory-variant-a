// FR-09, NFR-05: Check shared pending work and independent request scopes.
import { expect, it } from 'vitest'
import type { FactResult } from '../../src/lib/contracts'
import { factFlights } from '../../src/lib/fact-engine/flights'
import { harness, stored } from './helpers'
import type { StoredFact } from '../../src/lib/fact-engine/types'

it('shares one complete persisted result for 50 callers and waits for pending insert', async () => {
  const { service, provider, store } = harness()
  const generated = Promise.withResolvers<unknown>()
  const providerStarted = Promise.withResolvers<void>()
  const insertStarted = Promise.withResolvers<void>()
  const insert = Promise.withResolvers<StoredFact>()
  provider.mockImplementation(() => {
    providerStarted.resolve()
    return generated.promise
  })
  store.insert.mockImplementation(() => {
    insertStarted.resolve()
    return insert.promise
  })
  let settled = 0
  const calls = Array.from({ length: 50 }, () => service().then((result) => {
    settled += 1
    return result
  }))
  await providerStarted.promise
  expect(provider).toHaveBeenCalledTimes(1)
  generated.resolve('Generated')
  await insertStarted.promise
  expect(settled).toBe(0)
  expect(store.insert).toHaveBeenCalledTimes(1)
  insert.resolve(stored)
  const results = await Promise.all(calls)
  expect(results).toEqual(Array.from({ length: 50 }, () => ({
    kind: 'fact', text: 'Persisted fact', createdAt: databaseNowIso, stale: false,
  })))
})

const databaseNowIso = '2026-11-08T12:00:00.000Z'

it('runs distinct owner/title tuple keys independently including delimiter collisions', async () => {
  const first = harness()
  const second = harness()
  first.identity.mockResolvedValue({ ...first.user, id: 'a:b', favoriteMovie: 'c' })
  second.identity.mockResolvedValue({ ...second.user, id: 'a', favoriteMovie: 'b:c' })
  const held = Promise.withResolvers<unknown>()
  const started = Promise.withResolvers<void>()
  first.provider.mockImplementation(() => {
    started.resolve()
    return held.promise
  })
  const pending = first.service()
  await started.promise
  expect(await second.service()).toMatchObject({ kind: 'fact' })
  expect(second.provider).toHaveBeenCalledTimes(1)
  held.resolve('First')
  await pending
})

it.each(['success', 'provider rejection', 'insert rejection', 'recheck rejection'] as const)(
  'cleans up after %s so the next request retries immediately', async (outcome) => {
    const { service, store, provider } = harness()
    switch (outcome) {
      case 'success': break
      case 'provider rejection': provider.mockRejectedValueOnce(new Error('controlled provider')); break
      case 'insert rejection': store.insert.mockRejectedValueOnce(new Error('controlled insert')); break
      case 'recheck rejection':
        store.readLatest.mockResolvedValueOnce({ databaseNow: stored.createdAt, latest: null })
          .mockResolvedValueOnce({ databaseNow: stored.createdAt, latest: null })
          .mockRejectedValueOnce(new Error('controlled recheck'))
        break
      default: {
        const exhaustive: never = outcome
        throw exhaustive
      }
    }
    const results = await Promise.all([service(), service()])
    expect(results[0]).toEqual(results[1])
    expect(results[0]?.kind).toBe(outcome === 'success' ? 'fact' : 'error')
    const previous = provider.mock.calls.length
    expect(await service()).toMatchObject({ kind: 'fact' })
    expect(provider).toHaveBeenCalledTimes(previous + 1)
  },
)

it('does not delete a replacement entry while the old promise finishes', async () => {
  const { service, user, provider } = harness()
  const started = Promise.withResolvers<void>()
  const generated = Promise.withResolvers<unknown>()
  provider.mockImplementation(() => {
    started.resolve()
    return generated.promise
  })
  const pending = service()
  await started.promise
  const key = JSON.stringify([user.id, user.favoriteMovie])
  const replacement = Promise.withResolvers<FactResult>()
  factFlights.set(key, replacement.promise)
  generated.resolve('Old fact')
  await pending
  const next = service()
  replacement.resolve({ kind: 'error', code: 'UNAVAILABLE', message: 'Replacement owns result' })
  expect(await next).toEqual({ kind: 'error', code: 'UNAVAILABLE', message: 'Replacement owns result' })
  expect(provider).toHaveBeenCalledTimes(1)
  factFlights.delete(key)
})
