# Movie Memory

A personal home for a favorite film. Sign in with Google, save a movie, and read
a saved AI-generated fact about it.

**Variant A: backend caching and correctness.** This variant focuses on private
data, the exact cache window, overlapping requests, and failure recovery.

## Screenshots

### Public landing

The signed-out page introduces Movie Memory and offers Google sign-in.

![Public landing with Google sign-in and cinema artwork](docs/images/landing-desktop.png)

### First-time onboarding

New users save their favorite movie before opening the dashboard.

![First-time onboarding with the favorite-movie form](docs/images/onboarding-desktop.png)

### Personalized dashboard

The dashboard displays the saved title, movie fact, profile, initials fallback,
and logout control. Facts are labeled AI-generated and unverified.

![Dashboard showing Shawshank Redemption, a movie fact, and the user profile](docs/images/dashboard-desktop.png)

### Mobile landing

The landing page adapts to a narrow screen with a single-column layout.

![Mobile landing with Google sign-in and stacked cinema artwork](docs/images/landing-mobile.png)

## Run locally

Requirements: Node **24.22.2**, npm **11.19.1**, PostgreSQL, a Google OAuth web
client, and an OpenAI API key for live generation. Dependencies are pinned.

Install [Node 24.22.2](https://nodejs.org/download/release/v24.22.2/) for your
operating system and [PostgreSQL](https://www.postgresql.org/download/) with its
command-line tools. Check the runtime before installing the project:

```sh
node --version
npm --version
```

If npm differs from the pinned version, run `npm install --global npm@11.19.1`
in your chosen Node installation. Then clone and install:

```sh
git clone https://github.com/VineetLoyer/movie-memory-variant-a.git
cd movie-memory-variant-a
npm ci
```

Copy `.env.example` to `.env` and enter your own values. In PowerShell:

```powershell
Copy-Item .env.example .env
```

Do not overwrite an existing configured file. Follow
[database and account setup](docs/setup.md) to create the databases, configure
Google, and generate an authentication secret.

| Variable | Use |
| --- | --- |
| `DATABASE_URL` | PostgreSQL application connection. |
| `SHADOW_DATABASE_URL` | Separate database for authoring development migrations. Required by the schema; unused by deployment migrations. |
| `AUTH_URL` | Canonical origin: `http://localhost:3000` for local use. |
| `AUTH_SECRET` | Random authentication secret. |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google OAuth web-client credentials. |
| `OPENAI_API_KEY` | Server-side OpenAI credential for live generation. |
| `OPENAI_MODEL` | Model name; defaults to `gpt-4o-mini`. |
| `OPENAI_GENERATION_DISABLED` | Optional. `true` prevents provider calls and exercises saved-fact fallback. Normal operation uses `false` or omits it. |
| `TEST_DATABASE_URL` | Separate guarded test database. Not needed to browse the app. |

### Get the database URL

For a local database, follow [the SQL setup steps](docs/setup.md#application-database)
to create the role, application database, and separate shadow database. Build the
connection string from the values you selected:

```dotenv
DATABASE_URL="postgresql://movie_memory_app:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5432/movie_memory?schema=public"
SHADOW_DATABASE_URL="postgresql://movie_memory_app:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5432/movie_memory_shadow?schema=public"
```

| URL part | Where it comes from |
| --- | --- |
| `movie_memory_app` | PostgreSQL login role created during setup. |
| Password | Password assigned to that role. Percent-encode special characters; for example, `@` becomes `%40`. |
| `127.0.0.1:5432` | Database host and port, not the website address. |
| `movie_memory` | Application database name. |
| `schema=public` | Prisma's selected PostgreSQL schema. |

For hosted PostgreSQL, copy the connection URI from the provider's connection
settings and retain its required TLS parameters. Use a separate database for
the shadow URL. Keep the guarded test database separate as described in
[test setup](docs/setup.md#separate-test-database).

### Set up Google sign-in

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or
   select a project for Movie Memory.
2. Open **Google Auth Platform**. Complete **Branding** with the app name and
   support/contact email.
3. Choose the audience. For personal accounts, use **External** and add your
   account under **Audience → Test users** while testing.
4. Open **Clients**, select **Create client**, and choose **Web application**.
5. Add `http://localhost:3000` as an authorized JavaScript origin and
   `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI.
6. Save the client. Copy its client ID and client secret into `AUTH_GOOGLE_ID`
   and `AUTH_GOOGLE_SECRET` in your private `.env`.
7. Set `AUTH_URL="http://localhost:3000"` and generate `AUTH_SECRET` below.

See [Google's consent setup](https://developers.google.com/workspace/guides/configure-oauth-consent)
and [OpenID Connect credential guide](https://developers.google.com/identity/openid-connect/openid-connect).
The callback must match exactly, including hostname, port, and path.

### Get an OpenAI API key

1. Sign in to [OpenAI Platform](https://platform.openai.com/) and select the
   project you will use for this application.
2. Open [API keys](https://platform.openai.com/api-keys) and create a project key
   for local development. Copy it into `OPENAI_API_KEY` in your private `.env`.
3. Check [API billing](https://platform.openai.com/account/billing/overview) and
   ensure that the project can make model requests.
4. Keep `OPENAI_MODEL="gpt-4o-mini"` unless you deliberately choose a compatible
   model. Set `OPENAI_GENERATION_DISABLED="false"` for real generation.

See the [official OpenAI quickstart](https://developers.openai.com/api/docs/quickstart)
and [API-key guidance](https://developers.openai.com/api/docs/guides/api-keys).
The app reads the key on the server; do not put it in a `NEXT_PUBLIC_` variable.

### Generate the authentication secret

Run this locally and paste the output into `AUTH_SECRET`:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

`AUTH_SECRET` is generated by you. It is different from Google's client secret
and the OpenAI API key.

### Apply the migration and start

After configuring the application database:

```sh
npx prisma generate
npx prisma migrate deploy
npm run dev -- --hostname localhost --port 3000
```

Open [localhost:3000](http://localhost:3000). A new user saves a title during
onboarding. A returning user sees the saved movie and Google profile.
`migrate deploy` applies the checked-in migration without resetting data.

For a production build, stop the dev server before using the same port:

```sh
npm run build
npm start -- --hostname localhost --port 3000
```

An expired or absent fact starts a provider attempt when generation is enabled.
This can incur OpenAI charges. Setting `OPENAI_GENERATION_DISABLED=true` keeps
cache and fallback behavior active without a paid call. It does not fabricate
facts. Restart the server after changing private settings.

## Architecture

Next.js App Router pages read private data on the server. Server Actions handle
sign-in, onboarding, and logout. Client Components handle form state and image
fallback. PostgreSQL stores users, sessions, movies, and facts through Prisma.
The UI uses React, TypeScript, Tailwind, shared CSS, and local assets.

```mermaid
flowchart LR
    Browser --> Pages[Next.js pages and Server Actions]
    Google[Google OAuth] --> Auth[Auth.js database sessions]
    Pages --> Auth
    Auth --> DB[(PostgreSQL through Prisma)]
    Pages --> Identity[Current user and movie save]
    Identity --> DB
    Pages --> Facts[Scoped fact service]
    Facts --> DB
    Facts -->|stale or absent| OpenAI[OpenAI text response]
```

**Identity and ownership.** `src/auth.ts` configures Google and database sessions.
`readSession` retains adapter failure signals so a database outage is not treated
as ordinary signed-out state. `getCurrentUser` rereads the persisted profile by
session user ID. Browser-supplied user IDs do not select private records.

**Onboarding.** `validateMovieTitle` trims the title and accepts 1–200 UTF-16 code
units. `saveFavoriteMovie` updates only the session owner whose movie is still
null. Two submissions cannot replace each other's winning save. Success redirects
only after persistence. The assessment requires first-time onboarding; editing
and optimistic updates from Variant B are outside scope.

**Data model.** `User.favoriteMovie` is null before onboarding. `Account` links
Google identity, `Session` supports revocation, and `VerificationToken` supports
the auth adapter. `MovieFact` stores owner, exact title, text, and database time.
Its `(userId, movieTitle, createdAt, id)` index supports latest-fact reads.
Foreign keys cascade when a user is deleted.

**Cache and overlapping requests.** The fact service checks the latest persisted
fact for the current user and exact saved title. Database age in `[0, 60,000)`
milliseconds is fresh. Exactly 60 seconds is stale; future timestamps are not
fresh. A shared promise map registers work before yielding and rechecks the
cache. Same-scope requests share generation and persistence. The entry is removed
after completion. This protects **one Node.js process**, not multiple replicas.

**Provider and failures.** OpenAI receives the title as JSON data with no tools.
The call has zero automatic retries, a ten-second timeout, an application
deadline, and a 160-token output limit. Invalid or incomplete text is rejected.
Success is stored before display. Provider failure rereads the latest matching
saved fact; the UI labels stale fallback. Without one, it shows unavailable.
Storage failure never displays unpersisted output. Model text is not executed as
SQL or JavaScript. These boundaries limit execution risk, not factual errors.

**Logout.** The server deletes the stored session before redirecting home. Known
revocation failure shows a retry message and warns that the session may remain
active. Protected pages check identity on the server.

See [design decisions](docs/design-decisions.md) for the reasons, function map,
and failure details. [The requirements plan](docs/docs-plan.md) includes the
high-level design, ER diagram, user flow, and request sequence. In development,
[/architecture](http://localhost:3000/architecture) provides an interactive design
explorer. Its simulator makes no network calls; production renders a not-found
boundary for this route.

## Verification

Fast checks without a database or paid provider:

```sh
npm run typecheck
npm run check:contracts
npm run lint
npm run test:unit
npm run test:ui
```

[Provision the separate test database](docs/setup.md#separate-test-database)
before foundation, database, integration, security, or browser tests. The guard
requires `movie_memory_test` and role `movie_memory_app` at `127.0.0.1:5433`.
Tests create and remove owned fixtures only.

```sh
npm run test:foundation
npm run test:db
npm run test:integration
npm run build
npm run test:security
npm run check:secrets
```

The security HTTP tests and secret scanner require the build. For production
browser tests, follow [the two-terminal launcher guide](tests/e2e/README.md).
Google Chrome is required. Reports, runtime keys, cookies, and traces stay ignored.

| Evidence | Result and boundary |
| --- | --- |
| Independent publication copy | Pinned `npm ci`, Prisma generation, and production build passed with its own dependencies. This was not a second-machine test. |
| Migration setup | `migrate deploy` and `migrate status` passed in a new owned schema in the guarded test database. All five application tables were created, then that schema was removed. |
| Integration/security | 30 tests passed against guarded PostgreSQL and controlled provider responses. |
| Production browser | 12 desktop/mobile tests passed, including persistence, logout, timeout, stale fallback, and a two-tab burst with one request and one insert. Uses seeded sessions, not Google OAuth. |
| Earlier focused checks | Cache, ownership, auth, UI, and database checks passed during their implementation batches. Exact boundaries use deterministic clocks. |
| Live development checks | The owner completed Google login, onboarding, logout, and returning-user restoration. Approved live OpenAI checks verified generation and stale-cache reuse. These were separate from the controlled publication tests. |
| Publication safety | Secret scan passed for tracked, untracked, staged, and built browser inputs. Owned test rows were removed. |

[Acceptance scenarios](docs/acceptance-scenarios.md) give repeatable edge cases.
[Implementation status](docs/prototype.md) states the evidence and limits.

## Tradeoffs and next two hours

- The promise map is process-local. Multiple instances need a shared generation
  lease with expiry; distributed locking is not claimed.
- Titles remain free text. Ambiguity, spelling correction, and catalog matching
  are not solved. AI facts are labeled unverified.
- The existing timestamp schema is interpreted as UTC. A reviewed migration to
  `timestamptz` could simplify this while preserving existing instants.
- There is no persistent failure backoff, spending cap, or automatic update
  between browsers. A later stale refresh can retry; another tab updates on reload.
- The production build uses Webpack after reproducible Turbopack source-map
  failures in development of this project. Dev serving still uses Turbopack.

With two more hours, I would verify setup on a second machine, improve provider
backoff and operational diagnostics, and rehearse the design walkthrough. A shared
database lease would come first if deployment needed several server processes.

AI assistance is described in [AI_USAGE.md](AI_USAGE.md). The font license and
image-source notes are included under `public/`.
