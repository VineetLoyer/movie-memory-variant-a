# Screenshot guide

Use screenshots to show the user journey and design choices. Use tests and
record counts to show cache, concurrency, and authorization guarantees.
This guide supports FR-01 through FR-12, NFR-07, and NFR-08.

## Included README images

The README includes four supplied screenshots with captions near the introduction.
Their image bytes are preserved as supplied.

| Image | Shown content | Caption |
| --- | --- | --- |
| `docs/images/landing-desktop.png` | Signed-out `/`, including Google sign-in and the cinema artwork. | Public landing with Google sign-in. |
| `docs/images/onboarding-desktop.png` | First-time onboarding with an empty favorite-movie form. | A new user chooses a favorite movie. |
| `docs/images/dashboard-desktop.png` | Dashboard with the saved title, fact, profile initials, redacted email, and logout. | The dashboard shows the user's saved movie, profile, and movie fact. |
| `docs/images/landing-mobile.png` | Narrow-screen landing with Google sign-in and stacked artwork. | The landing page adapts to a mobile screen. |

Useful next captures are a server-validation error on onboarding and a mobile
dashboard. The included onboarding image does not show a validation error, and
the mobile image shows the public landing rather than the dashboard.

Prefer a dedicated test account and a genuine saved fact. If a capture uses a
controlled response, label it as test data in the caption. Do not describe a
fixture as live AI output. A screenshot shows displayed content; persistence is
established by database and browser tests.

## Images for other documents

| Document | Suggested image | What it explains |
| --- | --- | --- |
| `docs/design-decisions.md` | Crop the **System** section of development `/architecture`. Save as `docs/images/architecture-system.png`. | Server, identity, PostgreSQL, provider, and trust boundaries. |
| `docs/design-decisions.md` | Capture **Request flow** and **Functions** separately. Use `architecture-request-flow.png` and `architecture-functions.png`. | Cache/recheck/generation/persistence order and the functions that implement it. |
| `docs/docs-plan.md` | Optional exported ER diagram from the existing Mermaid block. Use `data-model.png`. | Users, accounts, sessions, and owner-scoped fact history. Keep the Mermaid source as the editable version. |
| `docs/acceptance-scenarios.md` | Capture stale fallback and unavailable as separate images: `fact-stale-fallback.png` and `fact-unavailable.png`. | A saved fact remains useful after provider failure; an account without one sees an honest unavailable state. |
| `docs/prototype.md` | A cropped test summary with the 12 browser results and owned-row cleanup. Use `verification-summary.png`. | Recorded automated evidence, explicitly labeled as controlled sessions/provider responses. |
| `docs/design-decisions.md` | A desktop/4K comparison of the same page: `dashboard-4k.png` alongside the desktop image. | Typography and content width scale together. State the CSS viewport size. |

The architecture route is development-only. Use `npm run dev` and open
`http://localhost:3000/architecture`; it is intentionally unavailable under
normal production serving.

## Capture and publication notes

- Store reviewed images under `docs/images/`. Use the filenames above or update
  the references to match your chosen names.
- Hide account email, personal details, bookmarks, and unrelated browser tabs.
  Do not capture API keys, database connection strings, OAuth secrets, cookies,
  callback query parameters, or private test traces.
- Wait for fonts, images, and entry animation to finish. Keep the app's error or
  fallback text visible when that state is the subject of the image.
- Use PNG or WebP. Keep desktop captures around 1440px wide for readable GitHub
  previews. Keep a separate 3840px capture for the 4K comparison.
- A matching fact in two tabs does not prove one provider call. Use the browser
  burst test's provider count and persisted-row assertion for that claim.
- Add image links only after the files exist. The current documentation does not
  embed missing image placeholders.

For example, after adding the dashboard image, insert this in the root README:

```markdown
![Dashboard with a saved favorite movie, Google profile, and movie fact](docs/images/dashboard-desktop.png)
```

From a file inside `docs/`, the relative image path starts with `images/` instead.
