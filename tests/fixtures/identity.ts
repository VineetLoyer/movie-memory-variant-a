// NFR-08: Isolated tests must set identity outcomes explicitly.
import { vi } from 'vitest'
import type { SaveMovieResult, UserView } from '../../src/lib/contracts'

export const getCurrentUser = vi.fn<() => Promise<UserView | null>>()
export const saveFavoriteMovie = vi.fn<(input: string) => Promise<SaveMovieResult>>()
