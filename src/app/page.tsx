import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { LandingView } from '@/components/views'
import { signInWithGoogle } from './actions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// FR-01, FR-02: Choose the landing or private page from the stored user state.
export default async function HomePage({
  searchParams,
}: {
  readonly searchParams: Promise<Readonly<Record<string, string | readonly string[] | undefined>>>
}) {
  const user = await getCurrentUser()
  if (user) redirect(user.favoriteMovie === null ? '/onboarding' : '/dashboard')
  const params = await searchParams
  return <LandingView loginAction={signInWithGoogle} loginFailed={params['error'] !== undefined} />
}
