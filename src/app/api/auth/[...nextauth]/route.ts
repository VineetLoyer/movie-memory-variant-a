// FR-01, FR-11: Expose the guarded Auth.js handlers for sign-in and logout.
import { handlers } from '@/auth'

export const { GET, POST } = handlers
export const runtime = 'nodejs'
