import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/identity'
import { getFactForCurrentUser } from '@/lib/facts'
import { DashboardView } from '@/components/views'
import { signOutToHome } from '../actions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// FR-06, FR-07, FR-12: Read the signed-in user and use the real fact service.
export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/')
  if (user.favoriteMovie === null) redirect('/onboarding')
  const fact = await getFactForCurrentUser()
  switch (fact.kind) {
    case 'fact':
      return <DashboardView user={{ ...user, favoriteMovie: user.favoriteMovie }} fact={fact} logoutAction={signOutToHome} />
    case 'error':
      switch (fact.code) {
        case 'UNAUTHENTICATED':
          redirect('/')
        case 'ONBOARDING_REQUIRED':
          redirect('/onboarding')
        case 'UNAVAILABLE':
          return <DashboardView user={{ ...user, favoriteMovie: user.favoriteMovie }} fact={{ ...fact, code: 'UNAVAILABLE' }} logoutAction={signOutToHome} />
        default:
          return assertNever(fact.code)
      }
    default:
      return assertNever(fact)
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unexpected dashboard result: ${String(value)}`)
}
