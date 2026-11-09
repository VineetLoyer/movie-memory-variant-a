'use client'

import { useState } from 'react'
import Link from 'next/link'
import styles from './architecture.module.css'

const functions = [
  ['readSession()', 'src/auth.ts', 'Reads the database-backed Auth.js session. withAuthErrors preserves adapter failures that Auth.js otherwise logs and swallows.'],
  ['getCurrentUser()', 'src/lib/identity.ts', 'Rejects absent or expired identity, then rereads only the current user profile and favorite movie from PostgreSQL.'],
  ['validateMovieTitle(input)', 'src/lib/movie-input.ts', 'Trims free text and enforces the shared 1–200 UTF-16 code-unit limits. Returns the normalized title or null.'],
  ['saveFavoriteMovie(input)', 'src/lib/identity.ts', 'Resolves ownership from the session. updateMany matches id AND favoriteMovie:null, giving racing onboarding saves exactly one winner.'],
  ['saveMovie(previous, form)', 'src/app/actions.ts', 'Rejects non-string FormData; delegates validation and persistence; redirects only after successful save or an already-completed onboarding.'],
  ['getFactForCurrentUser()', 'src/lib/facts.ts', 'Composes the real identity, Prisma store and OpenAI provider. Accepts no browser-supplied user or movie selector.'],
  ['createFactService(dependencies)', 'src/lib/fact-engine/service.ts', 'Owns authorization, cache age, coordinated generation, persistence-before-display and matching fallback. Dependencies make failure paths testable.'],
  ['isFresh(snapshot)', 'src/lib/fact-engine/service.ts', 'Compares databaseNow with persisted createdAt. Fresh means age >= 0 and age < 60,000 ms. Future timestamps are not considered fresh.'],
  ['factFlights', 'src/lib/fact-engine/flights.ts', 'Map<string, Promise<FactResult>> keyed by JSON.stringify([userId, movieTitle]). Stores the complete persistence promise, not just the provider call.'],
  ['createFactStore(database)', 'src/lib/fact-engine/store.ts', 'Parameterized SQL scopes every read/write to user and exact movie. UTC normalization and database-generated timestamps avoid application-clock cache skew.'],
  ['generateWithinDeadline(provider, title)', 'src/lib/fact-engine/generation.ts', 'Races the provider against a 10-second deadline. Aborts on expiry, consumes late errors, rejects invalid output and emits only safe reason codes.'],
  ['generateMovieFact(title, signal)', 'src/lib/fact-engine/provider.ts', 'Sends JSON title data with a system instruction. No tools, zero retries, 10-second SDK timeout and a 160-token output budget.'],
  ['signOutToHome()', 'src/app/actions.ts', 'Revokes through Auth.js before redirecting. Known revocation failure returns a retryable inline error; unexpected failures and framework redirects still propagate.'],
] as const

const decisions = [
  ['Webpack production build', 'Use the supported bundled Next.js compiler after reproducible Turbopack source-map panics in this environment.', 'Development still uses Turbopack. This is a build-tool workaround, not a change to application behavior.'],
  ['Database sessions', 'Revocation can invalidate the stored session immediately.', 'Authentication requires PostgreSQL availability. An outage is an error, not a false logged-out state.'],
  ['Server Components + Server Actions', 'Keep private reads, ownership checks and mutations on the server; use local client state for forms.', 'No Variant B API layer or optimistic movie editing is needed for this assessment.'],
  ['User + exact saved title', 'Avoid sharing private facts across users, even when they love the same movie.', 'Titles remain free text. No spelling correction or catalog identity is claimed.'],
  ['Database clock + UTC interpretation', 'Use one clock for cache age and persistence; deterministic latest-row order is createdAt DESC, id DESC.', 'Current timestamp-without-zone storage needs explicit UTC handling. A future timestamptz migration could simplify this, but no risky migration was added for this polish pass.'],
  ['Process-local promise map', 'Coalesce refresh bursts without holding a database transaction during a network call.', 'Works in one Node process. Multiple replicas need a shared generation lease; this is not distributed locking.'],
  ['No retry inside a request', 'Bound latency and avoid retry-driven charges; preserve an existing fact on provider failure.', 'A later stale refresh can try again. There is no persistent failure backoff or production spending limiter.'],
  ['Persist before display', 'A displayed generated fact is already available for subsequent requests.', 'If persistence fails, return unavailable rather than displaying an unpersisted result.'],
] as const

// NFR-08: Explain the design with a local simulation that makes no API calls.
export function ArchitectureExplorer() {
  const [age, setAge] = useState(60_000)
  const [hasFact, setHasFact] = useState(true)
  const [providerFails, setProviderFails] = useState(false)
  const [concurrent, setConcurrent] = useState(3)
  const fresh = hasFact && age < 60_000
  const calls = fresh ? 0 : 1
  const result = fresh ? 'Return the persisted fresh fact' : providerFails
    ? hasFact ? 'Return the matching stale fact + fallback notice' : 'Return a friendly unavailable result'
    : 'Persist one new fact, then return it to all waiters'

  return (
    <div className={styles['page']}>
      <header className={styles['header']}>
        <Link href="/dashboard" prefetch={false}>Movie Memory <span>/ engineering notebook</span>
        </Link>
        <span className={styles['badge']}>LOCAL DESIGN ARTIFACT</span>
      </header>
      <main>
        <section className={styles['hero']}>
          <p className={styles['eyebrow']}>BASE IMPLEMENTATION + VARIANT A</p>
          <h1>A small app.<br />
            <em>Deliberate decisions.</em>
          </h1>
          <p>The system behind your favorite film: how identity becomes ownership, how a fact becomes a memory, and how concurrent requests share the work.</p>
          <nav className={styles['nav']} aria-label="Architecture sections">
            {['System', 'Request flow', 'State explorer', 'Data model', 'Functions', 'Decisions', 'Evidence'].map((label, index) => <a key={label} href={`#section-${index}`}>{String(index + 1).padStart(2, '0')} {label}</a>)}
          </nav>
        </section>

        <section id="section-0" className={styles['section']}>
          <p className={styles['eyebrow']}>01 / HIGH-LEVEL DESIGN</p>
          <h2>One application. Clear trust boundaries.</h2>
          <div className={styles['topology']} aria-label="System architecture">
            <article>
              <small>UNTRUSTED CLIENT</small>
              <h3>Browser</h3>
              <p>Landing, onboarding, dashboard.<br />Form input and session cookie.</p>
              <code>React + Tailwind</code>
            </article>
            <span className={styles['arrow']} aria-hidden="true">→</span>
            <article>
              <small>TRUSTED SERVER</small>
              <h3>Next.js</h3>
              <p>Session validation, ownership,<br />Server Actions and fact service.</p>
              <code>Auth.js · Prisma · TypeScript</code>
            </article>
            <span className={styles['arrow']} aria-hidden="true">→</span>
            <article>
              <small>BOUNDED EXTERNAL CALL</small>
              <h3>OpenAI</h3>
              <p>Only when cache is stale/absent.<br />Receives title data; returns text.</p>
              <code>No tools · no database access</code>
            </article>
          </div>
          <div className={styles['dependencies']}>
            <article>
              <h3>Google OAuth</h3>
              <p>Google → Auth.js callback → linked account and database session. No mock authentication in the application.</p>
            </article>
            <article>
              <h3>PostgreSQL</h3>
              <p>Prisma adapter stores users/accounts/sessions. Fact store reads and writes only the authenticated user + movie scope.</p>
            </article>
          </div>
          <p className={styles['caption']}>The browser never receives the database URL, Google secret or OpenAI key. OpenAI is not given a SQL tool, shell, user profile or session token.</p>
        </section>

        <section id="section-1" className={styles['section']}>
          <p className={styles['eyebrow']}>02 / LOW-LEVEL REQUEST DESIGN</p>
          <h2>From a refresh to a persisted fact.</h2>
          <ol className={styles['sequence']}>
            {[
              ['Authenticate', 'DashboardPage → getCurrentUser → readSession. No session redirects home; no movie redirects to onboarding.'],
              ['Read the scoped cache', 'getFactForCurrentUser → createFactService → store.readLatest({userId, movieTitle}). Use the saved title, never a client selector.'],
              ['Apply the exact boundary', 'isFresh: 0 ≤ database age < 60,000 ms. A fresh record returns immediately with no provider call.'],
              ['Join or register the flight', 'Read factFlights with the JSON tuple key. Await an existing promise, or register a deferred promise synchronously before yielding.'],
              ['Recheck, then generate', 'Recheck PostgreSQL after registration. If still stale, generateWithinDeadline → generateMovieFact. No transaction stays open during OpenAI.'],
              ['Commit the outcome', 'Success → store.insert → display saved result. Provider failure → reread latest matching fact → stale notice or unavailable.'],
              ['Release coordination', 'finally removes only this promise from the map. All joined callers get the same completed result.'],
            ].map(([title, text]) => <li key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>)}
          </ol>
          <details className={styles['detail']}>
            <summary>Authentication and logout sequence</summary>
            <p>Google sign-in uses signInWithGoogle → signIn(&apos;google&apos;). The database adapter links identity and creates the session. HomePage selects onboarding or dashboard. signOutToHome → signOut → adapter.deleteSession must succeed before the success redirect. AsyncLocalStorage isolates errors across concurrent auth operations. If revocation fails, the form says the session may remain active and offers retry.</p>
          </details>
        </section>

        <section id="section-2" className={styles['section']}>
          <p className={styles['eyebrow']}>03 / INTERACTIVE STATE EXPLORER</p>
          <h2>Change the conditions. Follow the decision.</h2>
          <p className={styles['caption']}>Illustrative simulation for an authenticated, onboarded user in one process. It does not call OpenAI, query the database, or modify your account. Requests overlap while the same generation is pending.</p>
          <div className={styles['simulator']}>
            <div className={styles['controls']}>
              <label>Persisted fact age <strong>{age.toLocaleString('en-US')} ms</strong>
                <input type="range" min="0" max="120000" step="1" value={age} onChange={event => setAge(Number(event.target.value))} />
              </label>
              <div className={styles['presets']}>
                <button onClick={() => setAge(59_999)}>59,999 ms</button>
                <button onClick={() => setAge(60_000)}>60,000 ms</button>
              </div>
              <label>Overlapping requests <strong>{concurrent}</strong>
                <input type="range" min="1" max="10" value={concurrent} onChange={event => setConcurrent(Number(event.target.value))} />
              </label>
              <label className={styles['checkbox']}>
                <input type="checkbox" checked={hasFact} onChange={event => setHasFact(event.target.checked)} /> Matching saved fact exists</label>
              <label className={styles['checkbox']}>
                <input type="checkbox" checked={providerFails} onChange={event => setProviderFails(event.target.checked)} /> Provider fails or times out</label>
            </div>
            <div className={styles['outcome']} aria-live="polite">
              <span className={styles['eyebrow']}>EXPECTED DECISION</span>
              <h3>{result}</h3>
              <div className={styles['metrics']}>
                <div>
                  <strong>{calls}</strong>
                  <span>provider attempts</span>
                </div>
                <div>
                  <strong>{!fresh && !providerFails ? 1 : 0}</strong>
                  <span>new fact rows</span>
                </div>
                <div>
                  <strong>{!fresh ? concurrent - 1 : 0}</strong>
                  <span>joined waiters</span>
                </div>
              </div>
              <p>{fresh ? 'The provider failure setting is irrelevant: the fresh cache returns before generation.' : 'A later request after this flight settles can try again. Sharing pending work is not a permanent idempotency record.'}</p>
            </div>
          </div>
        </section>

        <section id="section-3" className={styles['section']}>
          <p className={styles['eyebrow']}>04 / DATA MODEL & INVARIANTS</p>
          <h2>Identity owns the memory.</h2>
          <div className={styles['models']}>{[
            ['User', 'id · name? · email? · image? · favoriteMovie?', 'One user has many Accounts, Sessions and MovieFacts. favoriteMovie:null means onboarding is incomplete.'],
            ['Account', 'userId → User.id · provider · providerAccountId', 'Unique(provider, providerAccountId). Google identity links to a stable application user.'],
            ['Session', 'userId → User.id · sessionToken UNIQUE · expires', 'Database-backed revocation. An expired or deleted token cannot authorize reads or writes.'],
            ['MovieFact', 'userId → User.id · movieTitle · text · createdAt', 'Index(userId, movieTitle, createdAt, id) supports scoped latest reads. DB timestamp default; user deletion cascades.'],
          ].map(([name, fields, reason]) => <article key={name}>
            <h3>{name}</h3>
            <code>{fields}</code>
            <p>{reason}</p>
          </article>)}</div>
          <p className={styles['caption']}>Source: prisma/schema.prisma. Auth.js also uses VerificationToken with unique token and identifier/token constraints. UTC interpretation matches the current storage representation. No schema migration or user-data cleanup was performed for this artifact.</p>
        </section>

        <section id="section-4" className={styles['section']}>
          <p className={styles['eyebrow']}>05 / FUNCTION MAP</p>
          <h2>The implementation, by responsibility.</h2>
          <div className={styles['functionList']}>{functions.map(([name, file, description]) => <details key={name} className={styles['detail']}>
            <summary>
              <code>{name}</code>
              <span>{file}</span>
            </summary>
            <p>{description}</p>
          </details>)}</div>
        </section>

        <section id="section-5" className={styles['section']}>
          <p className={styles['eyebrow']}>06 / CHOICES & TRADEOFFS</p>
          <h2>Why this shape, and where it stops.</h2>
          <div className={styles['tableWrap']}>
            <table>
              <thead>
                <tr>
                  <th>Choice</th>
                  <th>Benefit</th>
                  <th>Tradeoff</th>
                </tr>
              </thead>
              <tbody>{decisions.map(([choice, benefit, tradeoff]) => <tr key={choice}>
                <th>{choice}</th>
                <td>{benefit}</td>
                <td>{tradeoff}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className={styles['callout']}>
            <h3>Prompt injection is a text-quality risk, not an execution capability.</h3>
            <p>The title is encoded as JSON inside a user message. The system prompt instructs the model to treat it as data. This reduces instruction confusion but does not guarantee obedience. The stronger boundary is architectural: no execution tools, no credentials in the prompt, parameterized SQL and React text rendering. Returned SQL-looking text is never executed.</p>
          </div>
        </section>

        <section id="section-6" className={styles['section']}>
          <p className={styles['eyebrow']}>07 / EVIDENCE & HONEST LIMITS</p>
          <h2>What was checked.</h2>
          <div className={styles['dependencies']}>
            <article>
              <h3>Real application evidence</h3>
              <p>The user completed Google OAuth, first-time onboarding, logout, protected-route denial and returning-user restoration. A recorded live stale-cache test observed one OpenAI request and one new fact row for two concurrent tabs, then no new call on fresh reload.</p>
            </article>
            <article>
              <h3>Deterministic failure evidence</h3>
              <p>Cache boundary, 50-caller bursts, malformed output, timeout races, stale/no-cache fallback, forged ownership, SQL faults and revocation failure have focused tests. Mock provider tests do not establish live Google or OpenAI availability.</p>
            </article>
          </div>
          <div className={styles['callout']}>
            <h3>Local test allowance ≠ production rate limiting</h3>
            <p>The local manual-testing launcher uses an approved paid-request counter and forwards genuine provider responses. It can exhaust and trigger fallback. It is not shipped application logic, distributed coordination or a production spending control. Google photo delivery passed a Chrome check with no-referrer policy; initials remain available when delivery fails.</p>
          </div>
          <p className={styles['caption']}>Test sources: tests/facts/{'{cache,flights,fallback,timeout,provider}'}.test.ts · tests/auth/session.db.test.ts · tests/auth/onboarding.db.test.ts · tests/integration/security/authorization.test.ts. All 12 production-browser scenarios passed in the final compliance run. Detailed explanations: docs/design-decisions.md. README and AI-usage notes are prepared locally; GitHub publication remains owner-controlled.</p>
        </section>
      </main>
      <footer className={styles['footer']}>Movie Memory / Variant A engineering notebook <span>Local explanation. No private account data.</span>
      </footer>
    </div>
  )
}
