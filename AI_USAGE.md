# AI usage

- I used Codex to refine the product architecture, compare implementation
  tradeoffs, and connect the assessment requirements to module responsibilities.
  This included database sessions, ownership checks, cache boundaries, and
  coordination between overlapping requests.
- I used Codex to explore design prototypes and develop the interface through
  feedback on typography, layout, application states, and phone-to-4K behavior.
  Netflix, IMDb, and Ramp informed the visual direction.
- I used Codex extensively to write and run unit, database, integration,
  security, and production-browser tests. The tests cover exact cache timing,
  concurrent requests, authorization, persistence, invalid output, timeouts,
  stale fallback, and failed session revocation.
- I used Codex to investigate failures, challenge assumptions, and review
  sensitive boundaries such as session ownership, provider access, and secret
  exposure. I checked the results against the assessment and the recorded tests.
- I manually checked the real Google sign-in, onboarding, logout, protected
  routing, and returning-user flows. I approved live OpenAI checks separately
  from deterministic tests, which use controlled provider responses.
- I used Codex to prepare requirement mappings, architecture explanations,
  reproducible setup instructions, and reviewable implementation batches. I
  reviewed the proposed changes and approved each public commit and push.
