# Movie Memory: design decisions and implementation guide

This document explains the current implementation: why each choice was made, how it works, and what it does not guarantee. Scope is the required base plus Variant A in [assessment.md](assessment.md). The design prioritizes correctness, readable content, and a personal movie-night setting.

## 1. Why Variant A?

We chose the backend extension because the central challenge is keeping private, persisted facts correct across refreshes, failures and competing requests. A typed API layer, inline movie editing and optimistic updates belong to Variant B and would add unrelated states. The current application saves the favorite once during onboarding.

Implementation: Server Components in `src/app/page.tsx`, `onboarding/page.tsx` and `dashboard/page.tsx`; Server Actions in `src/app/actions.ts`; identity in `src/lib/identity.ts`; fact orchestration in `src/lib/fact-engine/service.ts`.

## 2. Why this visual direction?

A personal movie app benefits from a familiar cinema setting and a clear content hierarchy. Warm ivory, deep olive, and pale yellow keep the page calm. The interface focuses on the saved film, its fact, and the user profile. The ticket motif gives a single favorite a distinct visual identity.

The favorite movie is the dashboard's focal point. A cinema-ticket motif makes a saved title feel like a keepsake. The landing photograph establishes a movie-night setting; it is decorative cinema imagery, not a poster or still for a user's movie. The onboarding artwork says “that one film” without inventing a saved title.

Implementation: `LandingView`, `OnboardingView`, `DashboardView` and `FactContent` in `src/components/views.tsx`; consistent header/footer in `shell.tsx`; tokens and layouts in `src/app/globals.css`. Source and license notes are in `public/images/README.md` and `public/fonts/OFL.txt`.

### Why local fonts and responsive units?

DM Sans provides readable body text and a contemporary display voice. Fonts and the cinema photograph are served locally, so rendering does not depend on a third-party font request. The italic word accents use a system serif, while ordinary UI remains sans serif.

Large displays need both readable text and a useful content width. Design dimensions use `rem`, and the root font scales from 16px to a bounded viewport-relative size above 1600px. Text, artwork and spacing now grow together. At 3840 CSS pixels, the observed root font was 38.4px and the shell 3456px wide. Mobile collapses to a single column with wrapping for long saved titles.

### How are states and accessibility handled?

Forms retain their value after validation failure and expose pending text, disabled submission, associated error text and `aria-invalid`. Keyboard users have a skip link and visible focus. Reduced-motion settings disable decorative entry movement. Facts are labeled AI-generated and unverified. Stale facts carry a clear fallback notice; absence of a genuine saved fact shows unavailable, not invented content. `Avatar` handles missing or failed photos with initials and suppresses referrer transmission to the photo host. A missing name becomes “Movie lover.”

## 3. Why database sessions instead of a self-contained token?

A stored session gives logout a concrete revocation target. `src/auth.ts` configures Auth.js, the Prisma adapter and Google. Its session callback exposes the stable application user ID and nullable public profile fields, not account tokens. `AUTH_URL` pins the canonical origin and redirects stay on that origin.

`readSession()` wraps the installed Auth.js operation. Auth.js can log and swallow adapter failures; `withAuthErrors()` uses `AsyncLocalStorage` to retain that failure signal within the operation that caused it. This prevents a database outage from being misreported as ordinary logout and keeps concurrent operations isolated.

`getCurrentUser()` checks session validity and rereads only the current user's persisted profile/movie. We prefer a real database read to trusting profile or movie state submitted by the browser. Protected pages redirect absent identity to `/`; a valid user without a movie goes to `/onboarding`.

Tradeoff: authentication depends on database availability. An outage should show recovery, not silently change the user's identity state.

## 4. How do we save exactly once and enforce ownership?

`validateMovieTitle()` in `src/lib/movie-input.ts` trims input and enforces shared 1–200 UTF-16 code-unit limits. UTF-16 is explicit: some emoji occupy two units. Free text is accepted; this is not a movie-catalog lookup.

`saveMovie()` validates the FormData type, then calls `saveFavoriteMovie()`. The service resolves identity from the session and performs an atomic `updateMany` with both `id: user.id` and `favoriteMovie: null`. If two tabs submit different titles concurrently, one wins and the other receives the already-onboarded outcome. It cannot overwrite the winner. A browser-supplied `userId` is ignored. Persistence failure returns an understandable error; success redirects only after the write.

A transaction around an earlier read followed by an unconditional update would require more concurrency reasoning. The conditional update directly expresses the invariant we need.

## 5. Why this data model?

`prisma/schema.prisma` contains Auth.js's `User`, `Account`, `Session` and `VerificationToken` models plus `MovieFact`. `User.favoriteMovie` is nullable: null means first-time onboarding is incomplete. A separate movie catalog is unnecessary for one saved free-text favorite per user.

Each `MovieFact` stores its owning user ID, the exact movie title, text and creation timestamp. Keeping the title on each fact makes its cache scope explicit. Foreign keys enforce ownership; child records cascade on user deletion. Account identity, session tokens and verification tokens have the uniqueness constraints expected by Auth.js. The fact index begins with user and movie, followed by timestamp and ID, matching the latest-fact query.

The schema uses timestamps without a time zone. `createFactStore()` normalizes transaction timezone to UTC and explicitly interprets stored timestamps as UTC instants. Inserts use the database default timestamp. A reviewed future migration to `timestamptz` could simplify this; it must interpret existing values as UTC to preserve their meaning.

## 6. How does the 60-second cache work?

`getFactForCurrentUser()` in `src/lib/facts.ts` composes real identity, `createFactStore(prisma)` and `generateMovieFact`. The public function accepts no user/movie selectors.

`createFactService()` first resolves the authenticated user and their saved title, then calls `store.readLatest(scope)`. `isFresh(snapshot)` compares the saved timestamp with the database statement timestamp:

```text
fresh = latest exists AND 0 <= databaseNow - createdAt < 60,000 milliseconds
```

At 59,999ms the fact is fresh. At exactly 60,000ms it is stale. Future timestamps are not fresh. Latest reads order by `createdAt DESC, id DESC` for deterministic ties. The application clock cannot artificially extend the cache window.

The cache belongs to the authenticated user plus exact saved title. A newer record from another user or another movie cannot serve as a fallback.

## 7. How do competing refreshes share one generation?

`factFlights` in `src/lib/fact-engine/flights.ts` is a map of complete result promises keyed by `JSON.stringify([userId, movieTitle])`. JSON tuple encoding avoids delimiter collisions.

On stale/absent cache:

1. Reuse the existing promise if present.
2. Otherwise create deferred work and register its promise synchronously before yielding.
3. Recheck PostgreSQL inside that work, because another completed request may have saved a fresh fact since the initial read.
4. Generate, persist and return one result for all overlapping waiters.
5. In `finally`, remove the map entry only if it still points to this promise.

The promise includes persistence, so a waiting browser cannot finish before the fact is saved. No database transaction is held open across the network call.

This approach is explicitly accepted by Variant A. Its guarantee is one running Node.js process, not multiple replicas. To scale, atomically claim a shared PostgreSQL generation lease for the scope, let only its owner generate, and give the lease an expiry for crash recovery. A permanent idempotency record or distributed lease was not necessary for this single-process take-home.

Browser C is not pushed an update when A and B finish. It reads the new fact when refreshed. Polling/live subscriptions are outside the assessment.

## 8. Why these OpenAI and failure boundaries?

`generateMovieFact()` sends a system instruction and JSON-encoded movie title. No tool definitions, database connection, user profile, session token or secret is included in the prompt. The SDK uses zero retries, a ten-second timeout and a 160-token completion bound. Filtered, truncated or tool-call completions return invalid output rather than partial facts.

`generateWithinDeadline()` independently races generation against a ten-second deadline, aborts the losing request and consumes late errors. Late results cannot persist themselves; only the service controls storage. Invalid/blank output, timeout or rejection becomes generation failure, with sanitized reason-code diagnostics.

On provider failure the service rereads the latest matching persisted fact. If present it returns that fact and labels it stale as appropriate. If absent it returns unavailable. If the database operation itself fails, it returns unavailable instead of displaying unpersisted model text. The UI never claims that a fallback was newly generated.

A prompt can still influence wording: JSON encoding and system instructions do not prove model obedience. The stronger safety boundary is that output is text, never SQL or JavaScript. SQL queries are parameterized and React renders strings as text. The model has no execution capability in this application.

## 9. How is failed logout different from successful logout?

`signOutToHome()` delegates to the guarded Auth.js `signOut`. Successful database deletion retains the framework's redirect home. A known `AuthenticationUnavailableError` becomes an inline retryable failure. The form explicitly warns that the session may remain active. Unknown errors and framework redirects still propagate, rather than being caught as success.

This behavior is covered both at the UI/action seam and against actual PostgreSQL revocation failures. It avoids a reassuring but false “signed out” state.

## 10. Why keep test fixtures separate?

Repeatable failure checks need controlled inputs. Normal application startup uses
real Google OAuth and the OpenAI provider. Tests select their provider and identity
fault preloads through Node --import in an owned child process. Production source
does not import them. Seeded database sessions test session enforcement, not the
Google consent flow.

The provider preload forwards SDK requests to a loopback controller and strips
authorization. The identity preload injects a real SQL failure for one owned
session. Tests use the guarded database and clean only their unique fixture rows.
Legacy preview records marked [CONTROLLED PREVIEW DATA] are excluded from normal
fact reads, so they cannot appear as genuine generated facts.

The secret scanner checks tracked working files, index contents, untracked
nonignored files, and compiled client assets. It reports file names rather than
secret values. Missing required scan inputs fail the check.

See [verification status](prototype.md) for controlled and live evidence. They
answer different questions and are reported separately.

## 11. How do we verify and present the decisions?

The tests distinguish exact clock boundaries, same-scope bursts, independent scopes, malformed output, late-response races, database faults, expired sessions, forged ownership and failed revocation. UI tests exercise errors and pending states. Browser scenarios cover the actual application and isolated test database; controlled responses are explicitly identified as fixtures. Live calls and manual Google journeys are separate evidence.

`/architecture` is a development-only interactive notebook with system relationships, request flow, data model, function signatures and a no-network state simulator. Production invokes Next.js's not-found boundary; with the root loading boundary, the HTTP status can already be 200 because rendering is streamed. This artifact contains no private account data.

Production builds use supported Webpack after reproducible Turbopack source-map panics. This changes the compiler path, not application behavior. We keep development on Turbopack and document the workaround rather than claim the internal compiler failure was an application bug.

## 12. What remains deliberately outside the guarantee?

A fresh environment still needs provisioned PostgreSQL and correct Google/OpenAI credentials. Google image delivery is external and must degrade gracefully. Facts may be inaccurate or about an ambiguous title. No distributed locking, catalog lookup, auto-correction, model-backed title normalization, production cost control or automatic cross-tab update is claimed.

Each public commit and push requires owner approval. Deployment is outside this handoff. A walkthrough should explain the tradeoffs using the functions above.

## Requirement and source map

| Choice | Requirement IDs | Main source |
| --- | --- | --- |
| Google and revocable sessions | FR-01, FR-02, FR-11, FR-12, NFR-02 | [auth.ts](../src/auth.ts), [actions.ts](../src/app/actions.ts) |
| Session ownership and one-save onboarding | FR-03, FR-04, FR-05 | [identity.ts](../src/lib/identity.ts), [movie-input.ts](../src/lib/movie-input.ts) |
| Relational identity and fact history | FR-04, FR-07, NFR-04 | [schema.prisma](../prisma/schema.prisma), [store.ts](../src/lib/fact-engine/store.ts) |
| Cache window, shared work, and fallback | FR-08, FR-09, FR-10, NFR-05 | [service.ts](../src/lib/fact-engine/service.ts), [flights.ts](../src/lib/fact-engine/flights.ts) |
| Bounded text generation | FR-07, FR-10, NFR-02, NFR-03 | [provider.ts](../src/lib/fact-engine/provider.ts), [generation.ts](../src/lib/fact-engine/generation.ts) |
| Personal visual design and useful states | FR-06, NFR-06, NFR-07 | [views.tsx](../src/components/views.tsx), [globals.css](../src/app/globals.css), [avatar.tsx](../src/components/avatar.tsx) |
| Independent verification and explainable design | NFR-08, NFR-09, NFR-10 | [test guide](../tests/fixtures/README.md), [setup](setup.md), [architecture explorer](../src/app/architecture/explorer.tsx) |

For visual evidence of the system, function map, responsive scale, and failure
states, follow [the screenshot guide](screenshots.md). Keep screenshots next to
the decision they illustrate; retain diagrams and tests as the source of detail.
