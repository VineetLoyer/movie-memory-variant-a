import type { DefaultSession } from 'next-auth'

// FR-06, FR-12, NFR-08: Give session consumers the stable application user ID.
declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & { readonly id: string }
  }
}
