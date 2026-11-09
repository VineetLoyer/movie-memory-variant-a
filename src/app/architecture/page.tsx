import { notFound } from 'next/navigation'
import { ArchitectureExplorer } from './explorer'

export const dynamic = 'force-dynamic'

/** NFR-08: Local design artifact; production uses the not-found boundary. */
export default function ArchitecturePage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <ArchitectureExplorer />
}
