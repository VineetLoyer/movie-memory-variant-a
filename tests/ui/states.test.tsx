// NFR-06, NFR-07: Check usable form, fallback, profile, loading, and recovery states.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MovieForm } from '../../src/components/movie-form'
import type { MovieAction } from '../../src/components/movie-form'
import { AuthForm } from '../../src/components/auth-form'
import { DashboardView } from '../../src/components/views'
import { Avatar } from '../../src/components/avatar'
import ErrorPage from '../../src/app/error'
import Loading from '../../src/app/loading'
import type { SaveMovieResult } from '../../src/lib/contracts'

afterEach(cleanup)
const user = {
  id: 'state-viewer', name: null, email: null, image: null, favoriteMovie: 'Arrival',
}
const fact = {
  kind: 'fact', text: 'Controlled fixture fact.', createdAt: '2026-11-08T12:00:00Z', stale: false,
} as const

describe('onboarding interaction states', () => {
  it('keeps the title and associates a server validation error before a successful retry', async () => {
    const action = vi.fn<MovieAction>()
      .mockResolvedValueOnce({ kind: 'error', code: 'INVALID_MOVIE', message: 'Safe error' })
      .mockResolvedValueOnce({ kind: 'saved' })
    render(<MovieForm action={action} />)
    const input = screen.getByRole('textbox', { name: 'Favorite movie' })
    fireEvent.change(input, { target: { value: '  Arrival  ' } })
    const form = input.closest('form')
    if (!form) throw new TypeError('Expected movie form')
    await act(async () => { fireEvent.submit(form) })
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe('movie-help movie-error')
    expect(screen.getByRole('alert').id).toBe('movie-error')
    expect(input.getAttribute('value')).toBe('  Arrival  ')
    await act(async () => { fireEvent.submit(form) })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(action.mock.calls[1]?.[1].get('movie')).toBe('  Arrival  ')
  })

  it('disables duplicate submission while saving and recovers after service failure', async () => {
    let settle: (value: SaveMovieResult) => void = () => { throw new TypeError('Deferred not initialized') }
    const pending = new Promise<SaveMovieResult>(resolve => { settle = resolve })
    render(<MovieForm action={() => pending} />)
    const input = screen.getByRole('textbox', { name: 'Favorite movie' })
    fireEvent.change(input, { target: { value: 'Arrival' } })
    const form = input.closest('form')
    if (!form) throw new TypeError('Expected movie form')
    await act(async () => { fireEvent.submit(form) })
    expect(screen.getByRole('button', { name: 'Saving your movie...' }).hasAttribute('disabled')).toBe(true)
    await act(async () => { settle({ kind: 'error', code: 'UNAVAILABLE', message: 'Safe error' }) })
    expect(screen.getByRole('button', { name: 'Save my movie' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('alert').textContent).toMatch(/try again/i)
  })

  it('offers sign-in recovery when the session expires during submission', async () => {
    render(<MovieForm action={async () => ({ kind: 'error', code: 'UNAUTHENTICATED', message: 'Safe error' })} />)
    const input = screen.getByRole('textbox', { name: 'Favorite movie' })
    fireEvent.change(input, { target: { value: 'Arrival' } })
    const form = input.closest('form')
    if (!form) throw new TypeError('Expected movie form')
    await act(async () => { fireEvent.submit(form) })
    expect(screen.getByRole('link', { name: 'Sign in again' }).getAttribute('href')).toBe('/')
  })
})

describe('personal dashboard states', () => {
  it('shows usable profile fallbacks when Google omits name, email and photo', () => {
    render(<DashboardView user={user} fact={fact} logoutAction={async () => null} />)
    expect(screen.getByText('Movie lover')).toBeTruthy()
    expect(screen.getByText('Email not available')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('replaces a failed Google image with initials instead of a broken image', () => {
    render(<Avatar name="Mira Chen" image="https://example.test/missing.jpg" />)
    fireEvent.error(screen.getByRole('img', { name: 'Your profile photo' }))
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('M')).toBeTruthy()
  })

  it('labels stale fallback without presenting it as a new fact', () => {
    render(<DashboardView user={user} fact={{ ...fact, stale: true }} logoutAction={async () => null} />)
    expect(screen.getByRole('status').textContent).toMatch(/last saved fact/i)
    expect(screen.getByText(fact.text)).toBeTruthy()
  })

  it('shows a safe no-fact recovery state without rendering service internals', () => {
    render(<DashboardView user={user} fact={{ kind: 'error', code: 'UNAVAILABLE', message: 'private fixture detail' }} logoutAction={async () => null} />)
    expect(screen.getByRole('status').textContent).toMatch(/later/i)
    expect(screen.queryByText('private fixture detail')).toBeNull()
  })

  it('renders saved external movie data as text rather than executing markup', () => {
    const title = '<img src=x onerror=alert(1)>'
    render(<DashboardView user={{ ...user, favoriteMovie: title }} fact={fact} logoutAction={async () => null} />)
    const heading = screen.getByRole('heading', { name: title })
    expect(heading.querySelector('img')).toBeNull()
  })
})

describe('loading and recovery controls', () => {
  it('keeps failed logout retryable and warns that the session may remain active', async () => {
    render(<AuthForm action={async () => ({ kind: 'error' })} mode="logout" />)
    const button = screen.getByRole('button', { name: 'Sign out' })
    const form = button.closest('form')
    if (!form) throw new TypeError('Expected logout form')
    await act(async () => { fireEvent.submit(form) })
    expect(button.hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('alert').textContent).toMatch(/session may still be active/i)
  })
  it('announces loading without claiming that a fact has been generated', () => {
    render(<Loading />)
    expect(screen.getByRole('status').textContent).toMatch(/loading/i)
    expect(screen.queryByText(fact.text)).toBeNull()
  })

  it('retries the safe error boundary through its visible keyboard-accessible button', () => {
    const retry = vi.fn()
    render(<ErrorPage error={new Error('private fixture detail')} retry={retry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
    expect(screen.queryByText('private fixture detail')).toBeNull()
  })

  it('makes the Google control usable again after an expected login failure', async () => {
    render(<AuthForm action={async () => ({ kind: 'error' })} mode="login" />)
    const button = screen.getByRole('button', { name: 'Sign in with Google' })
    const form = button.closest('form')
    if (!form) throw new TypeError('Expected login form')
    await act(async () => { fireEvent.submit(form) })
    expect(button.hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('alert').textContent).toMatch(/try again/i)
  })
})
