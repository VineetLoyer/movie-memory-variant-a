// FR-01, FR-11, NFR-06: Failed auth operations must remain visible and retryable.
import { afterEach, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AuthForm } from '../../src/components/auth-form'

afterEach(cleanup)

it.each([
  { mode: 'login' as const, label: 'Sign in with Google', message: /sign-in could not be completed/i },
  { mode: 'logout' as const, label: 'Sign out', message: /session may still be active/i },
])('keeps $mode retryable after a known failure', async ({ mode, label, message }) => {
  render(<AuthForm action={async () => ({ kind: 'error' })} mode={mode} />)
  const button = screen.getByRole('button', { name: label })
  const form = button.closest('form')
  if (!form) throw new TypeError('Expected auth form')
  await act(async () => { fireEvent.submit(form) })
  expect(button.hasAttribute('disabled')).toBe(false)
  expect(screen.getByRole('alert').textContent).toMatch(message)
})
