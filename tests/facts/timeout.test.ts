// FR-10, NFR-03: Check deadlines and late-response persistence safety.
import { afterEach, beforeEach, expect, it } from 'vitest'
import { vi } from 'vitest'
import { harness } from './helpers'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it.each(['resolve', 'reject'] as const)(
  'settles at 10000ms and protects replacement B from late old A %s', async (lateOutcome) => {
    const { service, store, provider } = harness()
    const old = Promise.withResolvers<unknown>()
    const replacement = Promise.withResolvers<unknown>()
    const startedA = Promise.withResolvers<AbortSignal>()
    const startedB = Promise.withResolvers<void>()
    provider.mockImplementationOnce((_title, signal) => {
      startedA.resolve(signal)
      return old.promise
    }).mockImplementationOnce(() => {
      startedB.resolve()
      return replacement.promise
    })
    let settled = false
    const callA = service().then((value) => {
      settled = true
      return value
    })
    const signal = await startedA.promise
    await vi.advanceTimersByTimeAsync(9_999)
    expect(settled).toBe(false)
    expect(signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await callA).toMatchObject({ kind: 'error', code: 'UNAVAILABLE' })
    expect(signal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    const callB = service()
    await startedB.promise
    switch (lateOutcome) {
      case 'resolve': old.resolve('Late old A must never persist'); break
      case 'reject': old.reject(new Error('Late controlled rejection')); break
      default: {
        const exhaustive: never = lateOutcome
        throw exhaustive
      }
    }
    await vi.advanceTimersByTimeAsync(0)
    expect(store.insert).not.toHaveBeenCalled()
    const callC = service()
    await vi.advanceTimersByTimeAsync(0)
    expect(provider).toHaveBeenCalledTimes(2)
    replacement.resolve('Replacement B')
    expect(await Promise.all([callB, callC])).toEqual([
      { kind: 'fact', text: 'Persisted fact', createdAt: '2026-11-08T12:00:00.000Z', stale: false },
      { kind: 'fact', text: 'Persisted fact', createdAt: '2026-11-08T12:00:00.000Z', stale: false },
    ])
    expect(store.insert).toHaveBeenCalledTimes(1)
    expect(store.insert.mock.calls[0]?.[1]).toBe('Replacement B')
    expect(vi.getTimerCount()).toBe(0)
  },
)

it('does not persist an abort callback result that races the deadline', async () => {
  const { service, provider, store } = harness()
  const started = Promise.withResolvers<void>()
  provider.mockImplementation((_title, signal) => new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve('Abort callback text'), { once: true })
    started.resolve()
  }))
  const call = service()
  await started.promise
  await vi.advanceTimersByTimeAsync(10_000)
  expect(await call).toMatchObject({ kind: 'error', code: 'UNAVAILABLE' })
  expect(store.insert).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})
