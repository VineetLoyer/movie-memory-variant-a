# Acceptance scenarios

These checks cover the base assessment and Variant A in
[assessment.md](assessment.md). Use dedicated test accounts for new-user cases.
Onboarding saves once; do not delete or change an existing user's records to
repeat it.

## Manual browser checks

| Requirement | Scenario and action | Expected result |
| --- | --- | --- |
| FR-01, FR-12 | Open `/` in a private window. | Google sign-in is visible. No private profile, movie, or fact appears. |
| FR-01 | Start Google sign-in, then cancel or deny consent. | No authenticated dashboard. Sign-in can be retried. Google may keep cancellation on its own page. |
| FR-02 | Sign in with an account that has not saved a movie. | Open `/onboarding`. No favorite is fabricated. |
| FR-03 | Submit spaces on onboarding. | Server validation rejects the title and keeps the input. No movie is saved. An empty field may be blocked first by browser validation. |
| FR-03, FR-04 | Submit `  Arrival  `. | PostgreSQL stores `Arrival` for the signed-in user. The dashboard shows that title. |
| FR-05 | Open onboarding in two tabs before saving. Submit different titles. | One save wins. The second cannot overwrite it. Both open the dashboard with the winning title. |
| FR-02, FR-06 | Sign out and sign in with the same account. | Open the dashboard with the stored movie and Google profile. Onboarding is not repeated. |
| FR-08 | Reload within 60 seconds of a successful fact save. | The saved fact is reused without another provider request or insert. |
| FR-07, FR-08 | Enable generation, wait more than 60 seconds after persistence, then reload. | Attempt generation. Save valid output before display. Wording can repeat, so compare request and row counts. |
| FR-09 | After expiry, refresh two tabs for the same account at nearly the same time. | Within one server process, share pending work. Successful generation makes one provider request and one new row. Use the controlled browser test to prove counts. |
| FR-10 | With a saved fact, set `OPENAI_GENERATION_DISABLED=true`, restart, wait for expiry, and reload. | Show the matching saved fact with a fallback notice. Do not label it newly generated. |
| FR-10 | With generation disabled, use an onboarded account with no saved fact. | Show an unavailable message. Profile, movie, and logout remain usable. |
| FR-11, FR-12 | Sign out, then directly visit `/dashboard` and `/onboarding`. | Open `/`. The deleted session cannot restore private access. |
| FR-12 | Use separate browser profiles for two accounts with different favorites. | Each sees only its own profile, movie, and facts. Tabs in one profile share cookies and are not two independent users. |
| FR-06, NFR-06 | Block the profile image request in browser tools. | Show initials rather than a broken-image icon. Missing name uses the display fallback. |
| NFR-07 | Use Tab and Enter at 390px, 1440px, and 3840px widths. Enable reduced motion. | Visible focus, usable forms, readable scaling, and no horizontal page overflow. |
| NFR-02, NFR-07 | For a dedicated account, save `<img src=x onerror=alert(1)>` as the title. | Display literal text. Do not execute script or create an injected image. Free-text acceptance is not catalog validation. |

Restore the intended generation flag and restart after a disabled-provider check.
Live generation can incur charges under the configured OpenAI account.

## Deterministic edge and failure checks

Prepare the separate database as described in [setup.md](setup.md). These tests
use controlled responses and make no paid calls:

```sh
npm run test:unit -- tests/facts/cache.test.ts tests/facts/flights.test.ts tests/facts/fallback.test.ts tests/facts/timeout.test.ts
npm run test:unit -- tests/auth/onboarding.test.ts tests/auth/logout.test.ts
npm run test:db -- tests/auth/session.db.test.ts tests/auth/onboarding.db.test.ts
npm run test:integration -- tests/integration/failure.test.ts
npm run test:security -- tests/integration/security/authorization.test.ts
```

| Requirement | Edge case | Expected result |
| --- | --- | --- |
| FR-03 | Titles of 1, 200, and 201 UTF-16 code units; a non-string form value. | Accept 1 and 200 after trimming. Reject 201 and non-string values on the server. Some emoji use two units. |
| FR-08, NFR-04 | Ages of 59,999ms and 60,000ms; a future timestamp. | Only 59,999ms is fresh. Browser timing is too imprecise to prove this boundary. |
| FR-09 | Held generation with overlapping requests; different users or movies. | Share the same-scope task only. Other scopes remain independent. Clear the task after success or failure. |
| FR-10, NFR-03 | Timeout, rejection, blank text, malformed result, filtered or truncated output. | Return a matching saved fact or unavailable. Do not save invalid or late output. |
| FR-07, FR-10 | Database insertion fails after valid generation. | Return unavailable. Do not show unpersisted model output as a saved fact. |
| FR-04, FR-05 | Database save fails during onboarding. | Show a retryable error. Do not redirect as if the save succeeded. |
| FR-11 | Session deletion fails. | Do not report successful logout. Show a retryable error that the session may remain active. |
| FR-12 | Missing, expired, or deleted session; forged `userId` in form data. | Deny private access. Browser input cannot select another owner. |
| FR-08, FR-10, FR-12 | A newer fact exists for another user or movie. | Do not use it as cache or fallback for the current scope. |
| NFR-02 | A title asks the model to delete the database or ignore its instructions. | Treat the title as data. The model receives no execution tools. Output stays text; SQL uses parameters. This does not prove that all model wording resists injection. |

Blocking OpenAI in browser tools does not simulate provider failure because the
request starts on the server. Do not stop a shared database or change shared
credentials for a failure demonstration.

## Production browser checks

Follow [tests/e2e/README.md](../tests/e2e/README.md). The scenarios exercise the
production build and real PostgreSQL through seeded sessions and a loopback
provider controller. They check persistence, a held two-tab stale burst, timeout,
fallback, expired sessions, identity failure, logout, and responsive states.

These tests do not perform Google OAuth or contact live OpenAI. Their results and
the separately reported live checks are listed in [prototype.md](prototype.md).
The concurrency guarantee covers one server process.
