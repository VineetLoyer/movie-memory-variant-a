// FR-03: Trim free-text titles and enforce shared UTF-16 length limits.
export const MOVIE_MIN_LENGTH = 1
export const MOVIE_MAX_LENGTH = 200

export function validateMovieTitle(input: string): string | null {
  const title = input.trim()
  return title.length >= MOVIE_MIN_LENGTH && title.length <= MOVIE_MAX_LENGTH
    ? title
    : null
}
