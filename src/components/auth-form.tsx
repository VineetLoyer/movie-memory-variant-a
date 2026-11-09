'use client'

import { useActionState } from 'react'

export type AuthActionState = { readonly kind: 'error' } | null
export type AuthAction = (previous: AuthActionState, form: FormData) => Promise<AuthActionState>

// FR-01, FR-11, NFR-06: Keep sign-in and logout failures visible and retryable.
export function AuthForm({
  action,
  mode,
}: {
  readonly action: AuthAction
  readonly mode: 'login' | 'logout'
}) {
  const [state, formAction, pending] = useActionState(action, null)
  let labels: { readonly idle: string; readonly busy: string; readonly className: string }
  switch (mode) {
    case 'login':
      labels = { idle: 'Sign in with Google', busy: 'Connecting to Google...', className: 'button' }
      break
    case 'logout':
      labels = { idle: 'Sign out', busy: 'Signing out...', className: 'button quiet' }
      break
    default:
      throw new TypeError(`Unexpected authentication mode: ${String(mode satisfies never)}`)
  }
  return (
    <form action={formAction}>
      <button className={labels.className} disabled={pending}>
        {mode === 'login' && <span className="google-mark" aria-hidden="true">G</span>}
        <span className="button-label">
          <span className={pending ? 'label-hidden' : undefined} aria-hidden={pending}>{labels.idle}</span>
          <span className={pending ? undefined : 'label-hidden'} aria-hidden={!pending}>{labels.busy}</span>
        </span>
        {mode === 'login' && <span className="button-arrow" aria-hidden="true">↗</span>}
      </button>
      {state && <p className="error-message" role="alert">{mode === 'logout'
        ? 'We could not sign you out. Your session may still be active. Please try again.'
        : 'Sign-in could not be completed. Please try again.'}</p>}
    </form>
  )
}
