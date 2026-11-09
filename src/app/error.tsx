'use client'

import { Shell } from '@/components/shell'

// NFR-06: Offer recovery without displaying private error details.
export default function ErrorPage({ retry }: { readonly error: unknown; readonly retry: () => void }) {
  return (
    <Shell>
      <section className="recovery">
        <h1>We couldn&apos;t load this page.</h1>
        <p>Your connection or our service may be temporarily unavailable. Try again to continue.</p>
        <button className="button" onClick={retry}>Try again</button>
      </section>
    </Shell>
  )
}
