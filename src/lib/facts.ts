import 'server-only'

import { getCurrentUser } from '@/lib/identity'
import { prisma } from '@/lib/db'
import type { FactResult } from '@/lib/contracts'
import { generateMovieFact } from './fact-engine/provider'
import { createFactService } from './fact-engine/service'
import { createFactStore } from './fact-engine/store'

const getFact = createFactService({
  getCurrentUser,
  store: createFactStore(prisma),
  provider: generateMovieFact,
})

// FR-07, FR-12, NFR-02: Use session ownership; accept no browser selectors.
export async function getFactForCurrentUser(): Promise<FactResult> {
  return getFact()
}
