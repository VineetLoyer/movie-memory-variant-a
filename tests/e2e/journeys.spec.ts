// FR-04, FR-05, FR-08, FR-09, FR-11: Check persisted onboarding, cached facts, overlapping tabs, and logout.
import { test, expect, authenticate, control, fixture } from './fixtures'

test('first-time keyboard validation save persistence return and logout', async ({ page, context }) => {
  const session = await fixture(null)
  await authenticate(context, session)
  await control('/plan', { mode: 'success', text: 'Arrival uses circular language to connect its story.' })
  await page.goto('/')
  await expect(page).toHaveURL(/\/onboarding$/)
  const input = page.getByLabel('Favorite movie', { exact: true })
  await input.fill('   ')
  await input.press('Enter')
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Enter a movie title between 1 and 200 characters.')
  await expect(input).toHaveValue('   ')
  await input.fill('  Arrival  ')
  await input.press('Enter')
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Arrival', exact: true })).toBeVisible()
  await expect(page.getByText('Arrival uses circular language to connect its story.')).toBeVisible()
  expect(await control('/state', { id: session.id })).toEqual({
    user: { favoriteMovie: 'Arrival' }, facts: [{ text: 'Arrival uses circular language to connect its story.' }], sessions: 1,
  })
  await page.reload()
  await expect(page.getByText('Arrival uses circular language to connect its story.')).toBeVisible()
  expect(await control('/stats')).toMatchObject({ calls: 1, pending: 0 })
  await page.goto('/onboarding')
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  expect(await control('/state', { id: session.id })).toMatchObject({ sessions: 0 })
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/$/)
})

test('two tabs stale burst shares one provider request and one persisted new fact', async ({ page, context }) => {
  const session = await fixture('The Conversation')
  await authenticate(context, session)
  await control('/plan', { mode: 'success', text: 'A first persisted fact.' })
  let persistedBeforeDisplay = false
  await page.route('**/dashboard', async route => {
    // Hold the real application's completed HTTP response, never a canned body.
    const response = await route.fetch()
    expect(await control('/state', { id: session.id })).toMatchObject({
      facts: [{ text: 'A first persisted fact.' }],
    })
    persistedBeforeDisplay = true
    await route.fulfill({ response })
  })
  await page.goto('/dashboard')
  expect(persistedBeforeDisplay).toBe(true)
  await page.unroute('**/dashboard')
  await expect(page.getByText('A first persisted fact.')).toBeVisible()
  await control('/age', { id: session.id })
  await control('/plan', { mode: 'hold', text: 'A single shared replacement fact.' })
  const second = await context.newPage()
  try {
    const firstReady = page.reload()
    const secondReady = second.goto('/dashboard')
    await expect.poll(async () => control('/stats')).toMatchObject({ calls: 1, pending: 1 })
    await expect(page.getByRole('heading', { name: 'Loading your page...' })).toBeVisible()
    expect(await control('/state', { id: session.id })).toMatchObject({ facts: [{ text: 'A first persisted fact.' }] })
    await control('/release')
    await Promise.all([firstReady, secondReady])
    await expect(page.getByText('A single shared replacement fact.')).toBeVisible()
    await expect(second.getByText('A single shared replacement fact.')).toBeVisible()
    const state = await control('/state', { id: session.id })
    expect(state).toMatchObject({ facts: expect.arrayContaining([{ text: 'A single shared replacement fact.' }]) })
    expect('facts' in state && state.facts).toHaveLength(2)
    expect(await control('/stats')).toMatchObject({ calls: 1, pending: 0 })
    await page.reload()
    await second.reload()
    expect(await control('/stats')).toMatchObject({ calls: 1 })
  } finally { await second.close() }
})
