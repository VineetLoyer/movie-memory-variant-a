// FR-04, FR-12, NFR-02: Reject missing sessions and cross-user input in real service calls.
import { expect, it, vi } from 'vitest'
import { database, fixture, requestFor, requests, transport, wireFact } from '../context'

vi.mock('next/headers', async () => {
  const { requests } = await import('../context')
  return {
    headers: async () => new Headers({
      host: 'localhost:3000',
      cookie: `authjs.session-token=${requests.getStore()?.sessionToken ?? ''}`,
    }),
    cookies: async () => ({ set: vi.fn() }),
  }
})
vi.mock('../../../src/lib/db', async () => ({
  prisma: (await import('../context')).applicationDatabase,
}))

import { saveMovie } from '../../../src/app/actions'
import { getFactForCurrentUser } from '../../../src/lib/facts'

it.each(['absent', 'expired'] as const)('guards direct actions/facts for an %s session', async (state) => {
  const actor = await fixture('security-' + state, null)
  if (state === 'expired') {
    await database.session.update({
      where: { sessionToken: actor.sessionToken }, data: { expires: new Date(0) },
    })
  }
  const request = requestFor(state === 'absent' ? '' : actor.sessionToken)
  const form = new FormData()
  form.set('movie', 'Forbidden')
  form.set('userId', actor.user.id)

  expect(await requests.run(request, () => saveMovie(null, form))).toMatchObject({
    kind: 'error', code: 'UNAUTHENTICATED',
  })
  expect(await requests.run(request, getFactForCurrentUser)).toMatchObject({
    kind: 'error', code: 'UNAUTHENTICATED',
  })
  expect(await database.user.findUnique({ where: { id: actor.user.id } }))
    .toMatchObject({ favoriteMovie: null })
  expect(await database.movieFact.count({ where: { userId: actor.user.id } })).toBe(0)
  expect(transport).not.toHaveBeenCalled()
})

it('ignores forged FormData ownership and fact selectors at actual server-action boundaries', async () => {
  const actor = await fixture('security-actor', null)
  const other = await fixture('security-other', null)
  const form = new FormData()
  form.set('movie', '  Actor movie  ')
  form.set('userId', other.user.id)
  form.set('movieTitle', 'Victim movie')
  const request = requestFor(actor.sessionToken)

  await expect(requests.run(request, () => saveMovie(null, form))).rejects.toMatchObject({
    digest: 'NEXT_REDIRECT;replace;/dashboard;307;',
  })
  transport.mockResolvedValue(wireFact('Actor-only fact'))
  const result: unknown = await requests.run(request, () =>
    Reflect.apply(getFactForCurrentUser, undefined, [other.user.id, 'Victim movie']))

  expect(result).toMatchObject({ kind: 'fact', text: 'Actor-only fact', stale: false })
  expect(await database.movieFact.findMany({
    where: { userId: { in: [actor.user.id, other.user.id] } },
    select: { userId: true, movieTitle: true, text: true },
  })).toEqual([{ userId: actor.user.id, movieTitle: 'Actor movie', text: 'Actor-only fact' }])
  expect(await database.user.findUnique({ where: { id: other.user.id } }))
    .toMatchObject({ favoriteMovie: null })
})
