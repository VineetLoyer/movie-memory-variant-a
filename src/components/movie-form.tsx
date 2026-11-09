'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import type { SaveMovieResult } from '@/lib/contracts'
import { MOVIE_MAX_LENGTH } from '@/lib/movie-input'

export type MovieAction = (previous: SaveMovieResult | null, form: FormData) => Promise<SaveMovieResult>

// FR-03, NFR-06, NFR-07: Preserve input and expose pending and validation states.
export function MovieForm({ action }: { readonly action: MovieAction }) {
  const [state, formAction, pending] = useActionState(action, null)
  const [movie, setMovie] = useState('')
  let error: Extract<SaveMovieResult, { kind: 'error' }> | null
  switch (state?.kind) {
    case 'error':
      error = state
      break
    case 'saved':
    case undefined:
      error = null
      break
    default:
      return assertNever(state)
  }
  return (
    <form action={formAction} className="movie-form">
      <label className="field-label" htmlFor="movie">Favorite movie</label>
      <p id="movie-help" className="help">Use the movie title, between 1 and 200 characters.</p>
      <input id="movie" name="movie" type="text" maxLength={MOVIE_MAX_LENGTH} required value={movie}
        onChange={event => setMovie(event.target.value)}
        autoComplete="off" placeholder="For example, Arrival"
        aria-invalid={error?.code === 'INVALID_MOVIE'}
        aria-describedby={error ? 'movie-help movie-error' : 'movie-help'} />
      {error && <p id="movie-error" className="error-message" role="alert">{movieError(error.code)}</p>}
      <button className="button" disabled={pending}>
        <span className="button-label">
          <span className={pending ? 'label-hidden' : undefined} aria-hidden={pending}>Save my movie</span>
          <span className={pending ? undefined : 'label-hidden'} aria-hidden={!pending}>Saving your movie...</span>
        </span>
      </button>
    </form>
  )
}

function movieError(code: Extract<SaveMovieResult, { kind: 'error' }>['code']) {
  switch (code) {
    case 'INVALID_MOVIE':
      return 'Enter a movie title between 1 and 200 characters.'
    case 'UNAUTHENTICATED':
      return <>Your session has ended. <Link href="/" prefetch={false}>Sign in again</Link> to save your movie.</>
    case 'UNAVAILABLE':
      return 'Your movie could not be saved. Please try again.'
    case 'ALREADY_ONBOARDED':
      return <>Your movie is already saved. <Link href="/dashboard" prefetch={false}>Go to your dashboard</Link>.</>
    default:
      return assertNever(code)
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unexpected movie error: ${String(value)}`)
}
