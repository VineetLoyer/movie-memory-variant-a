// FR-12, NFR-02, NFR-08: Check private access and publication boundaries.
import { expect, it } from 'vitest'
import { actionBody, actionId, database, fixture, httpOrigin } from './http-context'

async function csrf() {
  const response = await fetch(httpOrigin() + '/api/auth/csrf')
  const body: unknown = await response.json()
  if (typeof body !== 'object' || body === null || !('csrfToken' in body) ||
      typeof body.csrfToken !== 'string') throw new TypeError('Missing real framework CSRF token')
  return {
    token: body.csrfToken,
    cookie: response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; '),
  }
}

it.each([
  { state: 'absent', path: '/dashboard' }, { state: 'absent', path: '/onboarding' },
  { state: 'expired', path: '/dashboard' }, { state: 'expired', path: '/onboarding' },
])('redirects $state sessions from the actual HTTP $path', async ({ state, path }) => {
  const actor = await fixture(state + path)
  await database.session.update({
    where: { sessionToken: actor.sessionToken }, data: { expires: new Date(0) },
  })

  const response = await fetch(httpOrigin() + path, {
    redirect: 'manual',
    headers: state === 'expired' ? { cookie: `authjs.session-token=${actor.sessionToken}` } : {},
  })

  const html = await response.text()
  // The root loading boundary starts streaming before asynchronous auth settles.
  // Next16 emits its documented client redirect marker instead of changing HTTP status.
  expect(response.status).toBe(200)
  expect(html).toMatch(/<meta[^>]*id="__next-page-redirect"[^>]*content="1;url=\/"[^>]*>/)
  expect(html).not.toContain('Fixture profile')
})

it('rejects a hostile Origin at the real Next action boundary before mutation', async () => {
  const actor = await fixture('hostile-origin')
  const form = new FormData()
  form.set('movie', 'Forbidden cross-origin movie')
  const response = await fetch(httpOrigin() + '/onboarding', {
    method: 'POST', redirect: 'manual', body: await actionBody(form),
    headers: {
      origin: 'https://hostile.invalid', 'Next-Action': await actionId('saveMovie'),
      cookie: `authjs.session-token=${actor.sessionToken}`,
    },
  })

  expect(response.status).toBe(500)
  expect(await database.user.findUnique({ where: { id: actor.user.id } }))
    .toMatchObject({ favoriteMovie: null })
  await response.text()
})

it('accepts the same-origin action protocol and ignores a forged owner field', async () => {
  const actor = await fixture('same-origin')
  const other = await fixture('same-origin-other')
  // Next may render the redirect destination as part of its action response.
  await database.$executeRaw`
    INSERT INTO "MovieFact" (id, "userId", "movieTitle", text, "createdAt")
    VALUES (${actor.user.id}, ${actor.user.id}, 'Actor movie', 'Cached actor fact', statement_timestamp() AT TIME ZONE 'UTC')
  `
  const form = new FormData()
  form.set('movie', 'Actor movie')
  form.set('userId', other.user.id)
  const response = await fetch(httpOrigin() + '/onboarding', {
    method: 'POST', redirect: 'manual', body: await actionBody(form),
    headers: {
      origin: httpOrigin(), 'Next-Action': await actionId('saveMovie'),
      cookie: `authjs.session-token=${actor.sessionToken}`,
    },
  })

  // Fetch actions navigate through the redirect header; MPA forms use HTTP303.
  expect(response.status).toBe(200)
  expect(response.headers.get('x-action-redirect')).toContain('/dashboard')
  expect(await database.user.findUnique({ where: { id: actor.user.id } }))
    .toMatchObject({ favoriteMovie: 'Actor movie' })
  expect(await database.user.findUnique({ where: { id: other.user.id } }))
    .toMatchObject({ favoriteMovie: null })
  await response.text()
})

it.each(['missing', 'mismatched'] as const)('rejects signout with %s CSRF proof without deleting a session', async (mode) => {
  const actor = await fixture('csrf-' + mode)
  const proof = await csrf()
  const response = await fetch(httpOrigin() + '/api/auth/signout', {
    method: 'POST', redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded', origin: 'https://hostile.invalid',
      cookie: `authjs.session-token=${actor.sessionToken}; ${proof.cookie}`,
    },
    body: new URLSearchParams(mode === 'missing' ? {} : { csrfToken: proof.token + 'wrong' }),
  })

  expect(response.status).toBe(503)
  expect(await database.session.count({ where: { sessionToken: actor.sessionToken } })).toBe(1)
  await response.text()
})

it('cannot sign out through GET', async () => {
  const actor = await fixture('signout-get')
  const response = await fetch(httpOrigin() + '/api/auth/signout', {
    redirect: 'manual', headers: { cookie: `authjs.session-token=${actor.sessionToken}` },
  })
  expect(await database.session.count({ where: { sessionToken: actor.sessionToken } })).toBe(1)
  await response.text()
})

it('valid CSRF signout revokes only the cookie owner and cannot redirect to an external origin', async () => {
  const actor = await fixture('signout-actor')
  const other = await fixture('signout-other')
  const proof = await csrf()
  const response = await fetch(httpOrigin() + '/api/auth/signout', {
    method: 'POST', redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded', origin: httpOrigin(),
      cookie: `authjs.session-token=${actor.sessionToken}; ${proof.cookie}`,
    },
    body: new URLSearchParams({
      csrfToken: proof.token, sessionToken: other.sessionToken, callbackUrl: 'https://hostile.invalid/',
    }),
  })

  expect(response.status).toBe(302)
  expect(new URL(response.headers.get('location') ?? '', httpOrigin()).origin).toBe(httpOrigin())
  expect(await database.session.count({ where: { sessionToken: actor.sessionToken } })).toBe(0)
  expect(await database.session.count({ where: { sessionToken: other.sessionToken } })).toBe(1)
  await response.text()
})

it('renders only the authenticated owner fact despite hostile query selectors', async () => {
  const actor = await fixture('dashboard-actor', 'Arrival')
  const other = await fixture('dashboard-other', 'Moon')
  await database.$executeRaw`
    INSERT INTO "MovieFact" (id, "userId", "movieTitle", text, "createdAt")
    VALUES (${actor.user.id}, ${actor.user.id}, 'Arrival', 'Visible actor fact', statement_timestamp() AT TIME ZONE 'UTC'),
           (${other.user.id}, ${other.user.id}, 'Moon', 'Private victim fact', statement_timestamp() AT TIME ZONE 'UTC')
  `
  const response = await fetch(httpOrigin() + '/dashboard?userId=' + other.user.id + '&movieTitle=Moon', {
    headers: { cookie: `authjs.session-token=${actor.sessionToken}` },
  })
  const html = await response.text()
  expect(response.status).toBe(200)
  expect(html).toContain('Visible actor fact')
  expect(html).not.toContain('Private victim fact')
})
