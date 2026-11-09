import { Shell } from '@/components/shell'

// NFR-06: Announce loading without claiming generation has completed.
export default function Loading() {
  return (
    <Shell>
      <section className="recovery" role="status" aria-live="polite" aria-busy="true">
        <h1>Loading your page...</h1>
        <p>Your movie memory will be here shortly.</p>
      </section>
    </Shell>
  )
}
