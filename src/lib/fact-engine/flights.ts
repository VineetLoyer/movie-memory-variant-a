import 'server-only'

import type { FactResult } from '../contracts'

// FR-09, NFR-05: Share pending results within this Node.js process only.
export const factFlights = new Map<string, Promise<FactResult>>()
