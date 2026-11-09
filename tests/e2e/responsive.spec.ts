// FR-06, NFR-07: Check long content, missing profile fields, keyboard use, and reduced motion.
import { test, expect, authenticate, control, fixture } from './fixtures'

test('long content missing profile reduced motion and keyboard keep usable layout', async ({ page, context }) => {
  const movie = 'A'.repeat(200)
  const session = await fixture(movie, { missing: true })
  await authenticate(context, session)
  await control('/plan', { mode: 'success', text: 'Cinema'.repeat(120) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: movie, exact: true })).toBeVisible()
  await expect(page.locator('.fact-text')).toHaveText('Cinema'.repeat(120))
  await expect(page.locator('img')).toHaveCount(0)
  expect(await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }))).toEqual({ overflow: false, reduced: true })
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  expect(await page.getByRole('link', { name: 'Skip to content' }).evaluate(
    node => getComputedStyle(node).outlineStyle,
  )).toBe('solid')
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toBeInViewport()
})
