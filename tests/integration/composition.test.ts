// FR-07, FR-08, NFR-08: Check real service composition with a controlled provider.
import { expect, it, vi } from 'vitest'
import {
  database, databaseNow, fixture, requestFor, requests, transport, wireFact,
} from './context'

// Keep these bindings in the importing test so Vitest hoists them before the
// production imports. Static re-exports in a helper evaluate too early.
vi.mock('next/headers', async () => {
  const { requests } = await import('./context')
  return {
    headers: async () => new Headers({
      host: 'localhost:3000',
      cookie: `authjs.session-token=${requests.getStore()?.sessionToken ?? ''}`,
    }),
    cookies: async () => ({ set: vi.fn() }),
  }
})
vi.mock('../../src/lib/db', async () => ({
  prisma: (await import('./context')).applicationDatabase,
}))

import { getCurrentUser, saveFavoriteMovie } from '../../src/lib/identity'
import { getFactForCurrentUser } from '../../src/lib/facts'

it('persists a fact for the actual racing onboarding winner without changing another user', async () => {
  const actor = await fixture('race', null)
  const other = await fixture('race-other', null)
  await database.user.update({ where: { id: actor.user.id }, data: { name: 'Persisted profile' } })
  const request = requestFor(actor.sessionToken)
  expect(await requests.run(request, getCurrentUser)).toMatchObject({
    id: actor.user.id, name: 'Persisted profile', favoriteMovie: null,
  })
  const results = await requests.run(request, () => Promise.all([
    saveFavoriteMovie(' Arrival '), saveFavoriteMovie(' Moon '),
  ]))
  expect(results.filter((result) => result.kind === 'saved')).toEqual([{ kind: 'saved' }])
  expect(results.filter((result) => result.kind === 'error')).toEqual([{
    kind: 'error', code: 'ALREADY_ONBOARDED', message: 'Your favorite movie is already saved.',
  }])
  const title = results[0]?.kind === 'saved' ? 'Arrival' : 'Moon'
  const identity = await requests.run(request, getCurrentUser)
  expect(identity).toMatchObject({ id: actor.user.id, name: 'Persisted profile', favoriteMovie: title })
  transport.mockResolvedValue(wireFact('  Persisted onboarding fact  '))

  // Extra JS arguments cannot select another owner or replace the saved title.
  const fact: unknown = await requests.run(request, () =>
    Reflect.apply(getFactForCurrentUser, undefined, [other.user.id, 'Forged title']))

  expect(fact).toMatchObject({ kind: 'fact', text: 'Persisted onboarding fact', stale: false })
  expect(await database.movieFact.findMany({
    where: { userId: { in: [actor.user.id, other.user.id] } },
    select: { userId: true, movieTitle: true, text: true },
  })).toEqual([{ userId: actor.user.id, movieTitle: title, text: 'Persisted onboarding fact' }])
  expect(await database.user.findUnique({ where: { id: other.user.id } }))
    .toMatchObject({ favoriteMovie: null })
})

it('shares one SDK request and one persisted fact across real authenticated simultaneous callers', async () => {
  const actor = await fixture('burst')
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<Response>()
  transport.mockImplementation(() => {
    entered.resolve()
    return release.promise
  })
  const calls = Array.from({ length: 50 }, () =>
    requests.run(requestFor(actor.sessionToken), getFactForCurrentUser))
  await entered.promise
  expect(await database.movieFact.count({ where: { userId: actor.user.id } })).toBe(0)
  release.resolve(wireFact('  One actual SDK result  '))

  const results = await Promise.all(calls)

  expect(transport).toHaveBeenCalledTimes(1)
  const rows = await database.movieFact.findMany({ where: { userId: actor.user.id } })
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ userId: actor.user.id, movieTitle: 'Arrival', text: 'One actual SDK result' })
  expect(results).toEqual(Array.from({ length: 50 }, () => ({
    kind: 'fact', text: 'One actual SDK result', createdAt: rows[0]?.createdAt.toISOString(), stale: false,
  })))
  expect(await requests.run(requestFor(actor.sessionToken), getFactForCurrentUser)).toEqual(results[0])
  expect(transport).toHaveBeenCalledTimes(1)
})

it('keeps concurrent sessions scoped to their saved movie and deterministic newest tied row', async () => {
  const first = await fixture('scope-a')
  const second = await fixture('scope-b', 'Moon')
  const createdAt = await databaseNow()
  await database.movieFact.createMany({ data: [
    { id: first.user.id + '_a', userId: first.user.id, movieTitle: 'Arrival', text: 'Losing tie', createdAt },
    { id: first.user.id + '_z', userId: first.user.id, movieTitle: 'Arrival', text: 'A own winner', createdAt },
    { userId: first.user.id, movieTitle: 'Moon', text: 'A wrong movie', createdAt },
    { userId: second.user.id, movieTitle: 'Arrival', text: 'B wrong movie', createdAt },
    { userId: second.user.id, movieTitle: 'Moon', text: 'B own winner', createdAt },
  ] })

  const results = await Promise.all([
    requests.run(requestFor(first.sessionToken), getFactForCurrentUser),
    requests.run(requestFor(second.sessionToken), getFactForCurrentUser),
  ])

  expect(results).toEqual([
    { kind: 'fact', text: 'A own winner', createdAt: createdAt.toISOString(), stale: false },
    { kind: 'fact', text: 'B own winner', createdAt: createdAt.toISOString(), stale: false },
  ])
  expect(transport).not.toHaveBeenCalled()
  expect(await database.movieFact.count({ where: { userId: { in: [first.user.id, second.user.id] } } })).toBe(5)
})

it.each([
  { label: 'fresh', age: 0, skew: 86_400_000, expected: 'DB cached', requests: 0 },
  { label: 'expired', age: 120_000, skew: -86_400_000, expected: 'DB regenerated', requests: 1 },
])('uses DB age for $label facts despite application clock skew', async (example) => {
  const actor = await fixture('clock-' + example.label)
  const now = await databaseNow()
  await database.movieFact.create({
    data: {
      userId: actor.user.id, movieTitle: 'Arrival', text: 'DB cached',
      createdAt: new Date(now.getTime() - example.age),
    },
  })
  transport.mockResolvedValue(wireFact('DB regenerated'))
  vi.spyOn(Date, 'now').mockReturnValue(now.getTime() + example.skew)

  const result = await requests.run(requestFor(actor.sessionToken), getFactForCurrentUser)

  expect(result).toMatchObject({ kind: 'fact', text: example.expected, stale: false })
  expect(transport).toHaveBeenCalledTimes(example.requests)
  expect(await database.movieFact.count({ where: { userId: actor.user.id } })).toBe(1 + example.requests)
})
