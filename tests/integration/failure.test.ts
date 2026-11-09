// FR-10, FR-12, NFR-06: Check unavailable, stale-fact, and identity failure behavior.
import { expect, it, vi } from 'vitest'
import {
  database, databaseNow, fixture, requestFor, requests, transport, wireFact,
} from './context'

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

import { getFactForCurrentUser } from '../../src/lib/facts'

it.each([true, false])('scopes failed-provider fallback with matching stale cache=%s', async (hasCache) => {
  const actor = await fixture('fallback-' + hasCache)
  const other = await fixture('fallback-other-' + hasCache)
  const now = await databaseNow()
  await database.movieFact.createMany({ data: [
    { userId: other.user.id, movieTitle: 'Arrival', text: 'Other owner private fact', createdAt: now },
    { userId: actor.user.id, movieTitle: 'Other movie', text: 'Wrong movie fact', createdAt: now },
    ...(hasCache ? [{
      userId: actor.user.id, movieTitle: 'Arrival', text: 'Matching stale fact',
      createdAt: new Date(now.getTime() - 120_000),
    }] : []),
  ] })
  transport.mockResolvedValue(Response.json(
    { error: { message: 'Controlled private provider failure' } }, { status: 503 },
  ))

  const result = await requests.run(requestFor(actor.sessionToken), getFactForCurrentUser)

  if (hasCache) {
    expect(result).toMatchObject({ kind: 'fact', text: 'Matching stale fact', stale: true })
  } else {
    expect(result).toEqual({
      kind: 'error', code: 'UNAVAILABLE', message: 'We could not load a movie fact. Please try again.',
    })
  }
  expect(transport).toHaveBeenCalledTimes(1)
  expect(await database.movieFact.count({
    where: { userId: { in: [actor.user.id, other.user.id] } },
  })).toBe(hasCache ? 3 : 2)
})

it.each(['read', 'fallback'] as const)('sanitizes an actual PostgreSQL %s failure without publishing a fact', async (fault) => {
  const actor = await fixture('sql-' + fault)
  const request = { ...requestFor(actor.sessionToken), fault }
  transport.mockResolvedValue(Response.json(
    { error: { message: 'Controlled private provider failure' } }, { status: 503 },
  ))

  const result = await requests.run(request, getFactForCurrentUser)

  expect(request.databaseRejected).toBe(true)
  expect(result).toEqual({
    kind: 'error', code: 'UNAVAILABLE', message: 'We could not load a movie fact. Please try again.',
  })
  expect(transport).toHaveBeenCalledTimes(fault === 'read' ? 0 : 1)
  expect(await database.movieFact.count({ where: { userId: actor.user.id } })).toBe(0)
  expect(await database.user.count({ where: { id: actor.user.id } })).toBe(1)
})

it('returns unavailable when the real FK rejects persistence after the owner disappears during SDK work', async () => {
  const actor = await fixture('insert-failure')
  transport.mockImplementation(async () => {
    await database.user.delete({ where: { id: actor.user.id } })
    return wireFact('Unpersisted provider text must not escape')
  })

  const result = await requests.run(requestFor(actor.sessionToken), getFactForCurrentUser)

  expect(result).toEqual({
    kind: 'error', code: 'UNAVAILABLE', message: 'We could not load a movie fact. Please try again.',
  })
  expect(transport).toHaveBeenCalledTimes(1)
  expect(await database.user.count({ where: { id: actor.user.id } })).toBe(0)
  expect(await database.movieFact.count({ where: { userId: actor.user.id } })).toBe(0)
})
