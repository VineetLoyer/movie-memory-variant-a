import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { OnboardingView } from '@/components/views'
import { saveMovie, signOutToHome } from '../actions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// FR-02, FR-05, FR-12: Allow onboarding only for a signed-in user without a movie.
export default async function OnboardingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/')
  if (user.favoriteMovie !== null) redirect('/dashboard')
  return <OnboardingView saveAction={saveMovie} logoutAction={signOutToHome} />
}
