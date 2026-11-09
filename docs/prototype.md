# Implementation and verification status

The application implements the base assessment and Variant A. The source and
test responsibilities are mapped in [docs-plan.md](docs-plan.md) and
[spec-checklist.md](spec-checklist.md).

## Behavior

| Requirement | Implementation |
| --- | --- |
| FR-01, FR-02 | Real Google OAuth and server-side routing from the stored user state. |
| FR-03, FR-04, FR-05 | Trimmed 1–200-unit title, session-derived ownership, and one conditional onboarding save. |
| FR-06 | Stored movie, Google profile, initials fallback, fact section, and logout control. |
| FR-07, FR-08 | Persisted facts and a database-clock cache below 60,000ms for the exact user and movie. |
| FR-09 | A shared generation-and-save promise for overlapping same-scope requests in one process. |
| FR-10 | Provider timeout/error uses the matching saved fact, or unavailable without one. Failed storage does not display unsaved output. |
| FR-11, FR-12 | Stored-session deletion, retryable revocation failure, protected routes, and owner-scoped queries. |

## Publication verification

The application checks were completed for source published in
[commit 2451fa6](https://github.com/VineetLoyer/movie-memory-variant-a/commit/2451fa6fd32819ea4112c38c168a1c21be3a416a).

- A separate local copy completed pinned dependency installation, Prisma client
  generation, and a production build with its own dependencies.
- The documented migration deployment and status commands passed in a new owned
  test schema. All five application tables were created. The schema was removed
  after the check; application data was not changed.
- All 30 integration/security tests passed against the guarded test database.
- All 12 production-browser scenarios passed across desktop and mobile projects.
  The held two-tab stale case checked one provider request and one new fact row.
- Integration and browser test type checks, targeted lint, and the secret scan
  passed. Cleanup reported zero owned users, sessions, accounts, and facts.
- Phone, desktop, and 4K layout checks also passed during UI assembly. Source,
  style, and asset comparisons preserved the approved application behavior.

The initial independent install was blocked by disk space. A later install and
build succeeded. This verifies a clean dependency installation on the same
machine, not setup on another operating system or a second machine.

## Live checks reported separately

During development, the owner confirmed real Google sign-in, first-time movie
save, logout to `/`, protected access denial, and returning-user restoration.
Approved live OpenAI checks also verified generation after expiry and subsequent
cache reuse. A live stale two-tab check recorded one provider request and one
persisted fact.

Publication browser tests used seeded real database sessions and controlled
provider responses. They did not repeat Google OAuth or live OpenAI generation.
External credentials and provider availability must be checked for a new setup.
No private runtime logs, account details, cookies, or provider credentials are
included as public evidence.

## Limits

- The pending task map is local to one Node.js process. Separate processes can
  generate concurrently; multiple replicas need a shared guard with crash recovery.
- Titles are free text. The application does not resolve directors, correct
  spelling, or verify a movie against a catalog. Generated facts can be inaccurate.
- Facts and profile data come from the current user's records. Legacy records
  marked `[CONTROLLED PREVIEW DATA]` are excluded from normal fact reads.
- There is no persistent retry backoff, spending cap, or automatic update between
  browser tabs. A later expired request can retry. Refresh reads the latest record.
- Google photo delivery is external. Missing or failed photos show initials.
- The architecture explorer is development-only. A production not-found boundary
  may have HTTP 200 if streaming already began; it does not reveal private data.
- The repository has not been deployed. External account setup and a fresh-machine
  walkthrough remain manual checks.

See [setup.md](setup.md) for clone-to-run instructions,
[acceptance-scenarios.md](acceptance-scenarios.md) for repeatable checks, and
[design-decisions.md](design-decisions.md) for the reasoning behind the choices.
