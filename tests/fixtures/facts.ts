// NFR-08: Test-only fact-service double; normal startup uses the real service.
// TEST ONLY: no provider call or production fact implementation.
import { vi } from 'vitest'
import type { FactResult } from '../../src/lib/contracts'

export const getFactForCurrentUser = vi.fn<() => Promise<FactResult>>()
