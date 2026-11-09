// FR-10, FR-12, NFR-06: Check unavailable, stale-fact, and identity failure behavior.
import { test, expect, authenticate, control, fixture } from './fixtures'

test('no cookie direct access expired session and canceled-login retry remain safe', async ({ page, context }) => {
  for (const path of ['/dashboard', '/onboarding']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
  }
  const expired = await fixture('Arrival', { expired: true })
  await authenticate(context, expired)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/?error=AccessDenied')
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'Sign-in was canceled or could not be completed. Please try again.',
  )
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled()
})

test('timeout with no cache recovers and upstream error returns stale matching fact', async ({ page, context }) => {
  const session = await fixture('Past Lives')
  await authenticate(context, session)
  await control('/plan', { mode: 'timeout', text: 'Not returned' })
  const started = performance.now()
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Past Lives', exact: true })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText("A fact isn't available right now. Please try visiting again later.")
  // The app must settle before the fixture closes its remote response at 20s.
  expect(performance.now() - started).toBeGreaterThanOrEqual(9_000)
  expect(performance.now() - started).toBeLessThan(15_000)
  expect(await control('/state', { id: session.id })).toMatchObject({ facts: [] })
  await expect.poll(async () => control('/stats')).toMatchObject({ calls: 1, pending: 0 })
  await control('/plan', { mode: 'success', text: 'A recovered persisted fact.' })
  await page.reload()
  await expect(page.getByText('A recovered persisted fact.')).toBeVisible()
  await control('/age', { id: session.id })
  await control('/plan', { mode: 'error', text: 'Not returned' })
  await page.reload()
  await expect(page.getByText('A recovered persisted fact.')).toBeVisible()
  await expect(page.getByRole('status')).toHaveText("A new fact couldn't be retrieved. Here's your last saved fact.")
  expect(await control('/stats')).toMatchObject({ calls: 1 })
  expect(await control('/state', { id: session.id })).toMatchObject({ facts: [{ text: 'A recovered persisted fact.' }] })
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeEnabled()
})

test('identity store failure renders recovery instead of false logout', async ({ page, context }) => {
  const session = await fixture('Tokyo Story')
  await authenticate(context, session)
  await control('/identity-fault', { id: session.id, enabled: true })
  try {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: "We couldn't load this page." })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toHaveCount(0)
    expect(await control('/state', { id: session.id })).toMatchObject({ sessions: 1, facts: [] })
  } finally {
    await control('/identity-fault', { id: session.id, enabled: false })
  }
  await control('/plan', { mode: 'success', text: 'The identity service recovered.' })
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('The identity service recovered.')).toBeVisible()
})
