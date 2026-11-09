// FR-01, FR-02, FR-06, FR-12: Check page guards and server-supplied private content.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { getCurrentUser } from '../fixtures/identity'
import { getFactForCurrentUser } from '../fixtures/facts'
import type { UserView } from '../../src/lib/contracts'
import HomePage from '../../src/app/page'
import OnboardingPage from '../../src/app/onboarding/page'
import DashboardPage from '../../src/app/dashboard/page'

class Redirected extends Error {
  constructor(readonly destination: string) { super('Framework redirect') }
}
vi.mock('next/navigation', () => ({
  redirect: (destination: string): never => { throw new Redirected(destination) },
}))

const viewer: UserView = {
  id: 'ui-viewer', name: 'Mira Chen', email: 'mira@example.test',
  image: null, favoriteMovie: 'In the Mood for Love',
}
beforeEach(() => {
  getCurrentUser.mockResolvedValue(viewer)
  getFactForCurrentUser.mockResolvedValue({
    kind: 'fact', text: 'A controlled fixture fact.', createdAt: '2026-11-08T12:00:00Z', stale: false,
  })
})
afterEach(cleanup)

describe('server page boundaries', () => {
  it.each([
    ['dashboard', DashboardPage],
    ['onboarding', OnboardingPage],
  ] as const)('redirects direct %s access when the session is absent or expired', async (_name, Page) => {
    getCurrentUser.mockResolvedValue(null)
    await expect(Page()).rejects.toMatchObject({ destination: '/' })
    expect(getFactForCurrentUser).not.toHaveBeenCalled()
  })

  it('sends an incomplete user from the dashboard to onboarding before fact access', async () => {
    getCurrentUser.mockResolvedValue({ ...viewer, favoriteMovie: null })
    await expect(DashboardPage()).rejects.toMatchObject({ destination: '/onboarding' })
    expect(getFactForCurrentUser).not.toHaveBeenCalled()
  })

  it('sends an already onboarded user away from onboarding', async () => {
    await expect(OnboardingPage()).rejects.toMatchObject({ destination: '/dashboard' })
  })

  it('renders the first-time form when the persisted movie is missing', async () => {
    getCurrentUser.mockResolvedValue({ ...viewer, favoriteMovie: null })
    render(await OnboardingPage())
    expect(screen.getByRole('textbox', { name: 'Favorite movie' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save my movie' })).toBeTruthy()
  })

  it('renders the saved movie, personal profile, and labeled AI fact for a returning user', async () => {
    render(await DashboardPage())
    expect(screen.getByRole('heading', { name: viewer.favoriteMovie ?? '' })).toBeTruthy()
    expect(screen.getByText('Mira Chen')).toBeTruthy()
    expect(screen.getByText('mira@example.test')).toBeTruthy()
    expect(screen.getByText('A controlled fixture fact.')).toBeTruthy()
    expect(screen.getByText(/AI-generated.*unverified/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
  })

  it.each([
    ['UNAUTHENTICATED', '/'],
    ['ONBOARDING_REQUIRED', '/onboarding'],
  ] as const)('honors independent fact-service authorization %s', async (code, destination) => {
    getFactForCurrentUser.mockResolvedValue({ kind: 'error', code, message: 'Safe fixture message' })
    await expect(DashboardPage()).rejects.toMatchObject({ destination })
  })

  it.each([DashboardPage, OnboardingPage])('propagates identity infrastructure failure to the error boundary', async Page => {
    const unavailable = new Error('Controlled database outage')
    getCurrentUser.mockRejectedValue(unavailable)
    await expect(Page()).rejects.toBe(unavailable)
  })

  it('shows the Google CTA and a safe retry after canceled login', async () => {
    getCurrentUser.mockResolvedValue(null)
    render(await HomePage({ searchParams: Promise.resolve({ error: '<script>untrusted</script>' }) }))
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toMatch(/try again/i)
    expect(screen.queryByText('<script>untrusted</script>')).toBeNull()
  })

  it.each([
    [null, '/onboarding'],
    ['Arrival', '/dashboard'],
  ] as const)('routes authenticated landing visits using persisted onboarding state %s', async (favoriteMovie, destination) => {
    getCurrentUser.mockResolvedValue({ ...viewer, favoriteMovie })
    await expect(HomePage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({ destination })
  })
})
