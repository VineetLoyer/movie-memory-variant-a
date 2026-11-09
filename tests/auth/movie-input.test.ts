import { describe, expect, it } from 'vitest'
import { validateMovieTitle } from '../../src/lib/movie-input'

// FR-03, NFR-08: Test title trimming, input limits, and unchanged valid text.
describe('favorite movie input requirements', () => {
  it.each([
    [' A ', 'A'],
    ['  Arrival  ', 'Arrival'],
    ['A'.repeat(200), 'A'.repeat(200)],
    ['🎬'.repeat(100), '🎬'.repeat(100)],
    ['Jobs by a director', 'Jobs by a director'],
    ['<img src=x onerror=alert(1)>', '<img src=x onerror=alert(1)>'],
  ])('accepts and trims a valid free-text title', (input, expected) => {
    expect(validateMovieTitle(input)).toBe(expected)
  })

  it.each(['', '   ', '\n\t', 'A'.repeat(201), '🎬'.repeat(101)])(
    'rejects empty or oversized titles',
    input => expect(validateMovieTitle(input)).toBeNull(),
  )
})
