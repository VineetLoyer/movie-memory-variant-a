import type { ReactNode } from 'react'
import Link from 'next/link'

// NFR-07: Share navigation and a keyboard skip link across product pages.
export function Shell({
  children,
  actions,
}: {
  readonly children: ReactNode
  readonly actions?: ReactNode
}) {
  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <Link className="wordmark" href="/" prefetch={false}><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>Movie Memory<span className="brand-dot" aria-hidden="true">.</span></Link>
        <div className="header-right"><span className="header-note">Good films. A place to keep them.</span>{actions}</div>
      </header>
      <main id="main">{children}</main>
      <footer className="site-footer"><span>Made for the films that stay with you.</span><span className="footer-signature">Your own little corner of cinema <span aria-hidden="true">✦</span></span></footer>
    </div>
  )
}
