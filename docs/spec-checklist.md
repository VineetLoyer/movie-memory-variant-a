# Implementation and release checklist

Use this checklist to build, test, review, and publish Movie Memory.

Check a box only after the stated check is complete. Record approval separately from test results.

## Review before each commit and push

- [ ] Show the current and proposed files side by side.
- [ ] List each added, changed, and removed file.
- [ ] Link the files to requirement IDs in `docs-plan.md`.
- [ ] Show the test results for the proposed files.
- [ ] State whether the batch contains a complete application or only part of it.
- [ ] Show the exact commit message and author.
- [ ] Get approval for the commit and push.
- [ ] Stage only the approved files.
- [ ] Scan the staged files for secrets and private data.
- [ ] Check that the staged content matches the approved content.
- [ ] Commit the approved batch.
- [ ] Push the approved commit.
- [ ] Verify the commit on GitHub and record its ID.

Get new approval if the proposed content or commit message changes.

## Planned batches

Each batch has its own review and test gate. Some early batches contain only part of the application.

| Batch | Files or feature | Checks before approval | Proposed commit message | Status |
| --- | --- | --- | --- | --- |
| 1 | Assessment, requirements plan, and checklist | Confirm the assessment is unchanged. Check requirement IDs, diagrams, plain language, portable paths, and absence of secrets. | `docs: define assessment requirements and Variant A implementation plan` | Published as `e0d165c`. |
| 2 | Dependency, build, lint, type, and test configuration | Check the lockfile and runtime versions. Review the environment template and ignore rules. | `chore: establish pinned application and verification configuration` | Published as `12b5a25`. |
| 3 | Data model, migration, database access, shared types, and title validation | Validate the Prisma schema. Test constraints and migration setup against a separate database. | `feat: define persistent identity and movie fact model` | Published as `d7f54d1`. |
| 4 | Google sign-in, sessions, private onboarding, and related tests | Test routing, title checks, user ownership, competing saves, session expiry, and failed logout. | `feat: implement Google sessions and private onboarding` | Published as `e1c5171`. |
| 5 | Fact cache, pending task map, OpenAI call, and failure recovery | Test cache timing, overlapping requests, separate users, timeout, invalid output, save failure, and fallback. | `feat: implement scoped fact caching and failure recovery` | Prepared for review. Approval pending. |
| 6 | Pages, components, styles, licensed assets, and local design page | Run type checks, lint, and a build. Check keyboard use, application states, and phone-to-4K layouts. | `feat: assemble the responsive Movie Memory experience` | Pending. |
| 7 | Complete application tests and publication checks | Run production-browser tests. Check user isolation, secrets, fixture cleanup, and setup from a clean copy. | `test: verify complete assessment journeys and publication safety` | Pending. |
| 8 | Final README, AI-usage note, and design explanations | Check setup commands, links, limits, and test evidence. Review the public repository details. | `docs: complete setup architecture and AI usage handoff` | Prepare last. |

Adjust batch contents before review if a file needs supporting code or tests. Explain the change before requesting approval.

Do not describe an early configuration or service batch as a complete application. Run the full application checks after assembly.

Prepare the README and AI-usage note in Batch 8.

## Batch 3 code references

Requirement IDs in comments refer to `docs-plan.md`. Comments explain each block's role without repeating the full requirement.

| File or block | Requirement IDs | What the block supplies |
| --- | --- | --- |
| Prisma datasource | NFR-01, NFR-02 | PostgreSQL configuration through environment variables. |
| User and favorite movie | FR-02, FR-04, FR-05, FR-06 | Profile storage and the null value used before onboarding. The save service enforces the one-save rule. |
| Account and Session | FR-01, FR-11, FR-12, NFR-02 | Stored identity and session records. Auth services enforce access, expiry, and logout. |
| VerificationToken | NFR-01 | The authentication adapter's token model. |
| MovieFact and its index | FR-07, FR-08, NFR-04 | Owner, title, text, database timestamp, and latest-fact lookup index. The fact service enforces cache age. |
| Initial migration | FR-04, FR-07, NFR-04, NFR-09 | SQL for the model and timestamp default. Generated migration metadata remains unchanged. |
| `src/lib/db.ts` | NFR-01, NFR-02 | Server-only access through a shared Prisma client. |
| `src/lib/contracts.ts` | FR-03, FR-05, FR-06, FR-08, FR-10, NFR-02, NFR-06 | Result types for page data, movie saves, and fact states. Types describe results; services must enforce the rules. |
| `src/lib/movie-input.ts` | FR-03 | Shared free-text title validation and input limits. |
| Model tests | FR-01, FR-04, FR-06, FR-07, NFR-02, NFR-04, NFR-08 | Database constraints, optional fields, timestamp defaults, and owner-specific deletion. |
| Test database helper | NFR-02, NFR-09 | Connection and role checks before tests can write. |
| Title validation tests | FR-03, NFR-08 | Trimming, exact length boundaries, emoji input units, and unchanged valid text. |

The schema alone does not enforce private reads, first-time-only saves, or a 60-second cache. Later service batches implement those checks.

## Batch 4 code references

| File or block | Requirement IDs | Responsibility |
| --- | --- | --- |
| Auth.js configuration and callback route | FR-01, FR-02, NFR-01, NFR-02 | Configure Google, stored sessions, safe profile fields, and local redirects. Page guards arrive in Batch 6. |
| Session read and auth error boundary | FR-11, FR-12, NFR-02, NFR-06 | Keep adapter failures distinct from a signed-out result. Separate concurrent operation state. |
| Identity service | FR-03, FR-04, FR-05, FR-06, FR-12, NFR-02 | Validate the session, select private records, and save the movie once for its owner. |
| Server Actions | FR-01, FR-02, FR-03, FR-05, FR-11, NFR-06 | Start sign-in, validate form data, redirect after success, and return retryable failures. |
| Auth error and session types | FR-06, FR-11, FR-12, NFR-02, NFR-08 | Define the safe error and stable session user ID. |
| Auth form | FR-01, FR-11, NFR-06, NFR-07 | Show pending and retry states for sign-in and logout. Full pages and styles arrive in Batch 6. |
| Auth unit and action tests | FR-01, FR-02, FR-03, FR-05, FR-11, FR-12, NFR-08 | Check redirects, ownership rules, rejected input, and failure results with controlled dependencies. |
| Auth database tests and helper | FR-04, FR-05, FR-11, FR-12, NFR-02, NFR-09 | Check real stored sessions, competing saves, expiry, deletion, and failed revocation on the test database. |
| Test fixtures and type-check scope | NFR-02, NFR-08, NFR-09 | Keep test dependencies explicit and separate from normal application startup. |

Real Google sign-in needs a running application and owner credentials. Controlled auth tests do not replace that check.

## Batch 5 code references

| File or block | Requirement IDs | Responsibility |
| --- | --- | --- |
| Public fact function | FR-07, FR-12, NFR-02 | Resolve the user and saved movie without accepting browser-supplied owner selectors. |
| Fact types and test contracts | FR-07, FR-08, FR-10, NFR-08 | Define stored facts, database-clock snapshots, provider output, and public results. |
| Freshness check | FR-08, NFR-04 | Treat ages below 60,000 milliseconds as fresh. Use database time. |
| Pending task map and service | FR-09, NFR-05 | Share the full generation and save result in one server process. Remove the task after completion. |
| Fact store | FR-04, FR-07, FR-08, NFR-02, NFR-04 | Use parameterized, owner-specific reads and writes. Save database timestamps and interpret them as UTC. |
| OpenAI provider | FR-07, NFR-02, NFR-03 | Send title data without execution tools. Bound retries, timeout, and output. Reject incomplete responses. |
| Generation deadline | FR-10, NFR-03 | Abort timed-out work and prevent late results from reaching persistence. |
| Fallback result | FR-10, NFR-06 | Return the matching saved fact after provider failure, or an unavailable result. |
| Fact unit and transport tests | FR-07, FR-08, FR-09, FR-10, NFR-02, NFR-08 | Check boundaries, independent scopes, invalid output, retries, and late responses with controlled providers. |
| Fact database tests | FR-04, FR-07, FR-08, FR-09, FR-10, NFR-04, NFR-09 | Check actual storage, timestamps, ownership, burst saves, and fallback on the test database. |

Controlled provider tests make no paid calls. Full browser rendering remains in Batch 6 and final browser checks in Batch 7.

## Requirement checks

| Requirement IDs | Planned files | Required checks |
| --- | --- | --- |
| FR-01, FR-02, FR-12 | `src/auth.ts` and page routes | Check Google sign-in separately from test sessions. Test signed-out, expired-session, and returning-user routes. |
| FR-03, FR-04, FR-05 | `movie-input.ts`, `identity.ts`, `actions.ts`, and the User model | Test spaces, length limits, invalid form data, competing saves, wrong user IDs, and failed writes. |
| FR-06 | Views, avatar, and forms | Check the saved profile and movie. Test missing fields, failed photos, logout, long titles, and keyboard use. |
| FR-07, FR-08 | Provider, service, and store | Check that a valid fact is saved before display. Test the exact cache boundary and zero provider calls for fresh facts. |
| FR-09 | Pending task map and service | Test one shared task for overlapping requests. Test separate users and movies. Check task removal after success and failure. |
| FR-10 | Generation, service, and views | Test timeout, invalid output, late responses, matching stale fallback, and unavailable results without a saved fact. |
| FR-11 | Auth, actions, and logout form | Verify session deletion before success. Test a deletion failure and a usable retry control. |
| NFR-01, NFR-04 | Package files, schema, and store | Check runtime versions, migrations, database time, UTC handling, and the order of records with equal timestamps. |
| NFR-02, NFR-03, NFR-10 | Auth, provider, store, scanner, and ignore rules | Check secret isolation, parameterized queries, provider limits, absence of model execution tools, and approved publication content. |
| NFR-05, NFR-08 | Design documents and tests | State the one-process limit. Explain the module roles and test results without overstating the evidence. |
| NFR-06, NFR-07 | UI, styles, and browser tests | Check pending and error states, labels, focus, reduced motion, wrapping, and responsive layouts. |
| NFR-09 | Final README, environment template, and migration | Follow the setup steps from a clean copy. State external account and credential requirements. |

## Checks after cloning

- [ ] The required runtime versions are documented.
- [ ] `npm ci` installs the locked dependencies.
- [ ] `.env.example` lists the required values without private credentials.
- [ ] Google origin and callback settings are documented.
- [ ] The Prisma client can be generated.
- [ ] The checked-in migration creates the required database tables.
- [ ] Setup does not require private files or tools from another checkout.
- [ ] The application starts with the documented command.
- [ ] Google sign-in reaches onboarding for a new user.
- [ ] Saving a valid title opens the correct dashboard.
- [ ] A returning user sees the saved movie.
- [ ] Fact generation, cache reuse, and failure recovery match the requirements.
- [ ] Logout blocks later access to private pages.
- [ ] The documented tests use a separate test database.

OpenAI can return different wording on each live generation. Compare the application behavior and saved records, not fixed live response text.

## Final acceptance

- [ ] Every functional requirement has passing evidence.
- [ ] Every non-functional requirement has passing evidence or a stated, accepted limit.
- [ ] The application matches the approved design and user flows.
- [ ] The interface displays real user data and saved facts.
- [ ] Source and asset changes match the approved comparisons.
- [ ] Test fixtures remain separate from application data.
- [ ] All owned test records are removed after testing.
- [ ] Controlled test responses are identified as test data.
- [ ] Live Google and OpenAI checks are reported separately from controlled tests.
- [ ] Paid checks use only the approved allowance.
- [ ] The public tree contains no credentials, real sessions, or private test reports.
- [ ] The final README and AI-usage note are approved.
- [ ] Every public commit has approval and a verified push result.
- [ ] The owner receives the repository URL, final commit ID, and remaining limits.
