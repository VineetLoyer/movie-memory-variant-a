# Setup and test databases

This guide supports NFR-01 and NFR-09 in [docs-plan.md](docs-plan.md).
Run shell commands from the repository root. Use your own credentials.

## Application database

Install PostgreSQL and its `psql` command-line client. Connect as a database
administrator. The example uses the default local port:

```sh
psql -h 127.0.0.1 -p 5432 -U postgres -d postgres
```

For a new installation, run these commands in `psql`. The password command
prompts for a password without putting it in the SQL text:

```sql
CREATE ROLE movie_memory_app LOGIN;
\password movie_memory_app
CREATE DATABASE movie_memory OWNER movie_memory_app;
CREATE DATABASE movie_memory_shadow OWNER movie_memory_app;
\q
```

If the role or databases already exist, use the existing approved configuration.
Do not recreate them. The shadow database must be separate from application data.
It is used when authoring development migrations, not by `migrate deploy`.

Set the two URLs in the private `.env` file. Replace `YOUR_URL_ENCODED_PASSWORD`
with the role's password. Percent-encode special characters in URL credentials.
For example, `@` becomes `%40`. The host and port belong to PostgreSQL, not the
Next.js server. See [PostgreSQL's connection URI format](https://www.postgresql.org/docs/current/libpq-connect.html#LIBPQ-CONNSTRING-URIS).

```dotenv
DATABASE_URL="postgresql://movie_memory_app:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5432/movie_memory?schema=public"
SHADOW_DATABASE_URL="postgresql://movie_memory_app:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5432/movie_memory_shadow?schema=public"
```

Generate the client and apply the existing migration:

```sh
npx prisma generate
npx prisma migrate deploy
npx prisma migrate status
```

`migrate deploy` applies checked-in migrations. It does not reset the database.
The checked-in migration creates the five models in `prisma/schema.prisma`.
Use `migrate dev` only to author a reviewed development migration with a separate
shadow database. Do not use a reset command on application data.

## Google OAuth

1. Sign in to [Google Cloud Console](https://console.cloud.google.com/).
2. Use the project selector to create a Movie Memory project or select your
   chosen project.
3. Open **Google Auth Platform → Branding**. If prompted, choose **Get Started**
   and enter the app name, support email, and contact email.
4. Under **Audience**, choose **External** for personal Google accounts. While
   the app is in testing mode, add each intended account under **Test users**.
5. Under **Clients**, create a **Web application** client named Movie Memory Local.
6. Enter the origin and callback below, then create the client.
7. Open the client details and copy its ID and secret to your private `.env`.

The setup follows [Google's consent guide](https://developers.google.com/workspace/guides/configure-oauth-consent)
and [server sign-in credential guide](https://developers.google.com/identity/openid-connect/openid-connect).
Configure these application-specific values:

| Setting | Local value |
| --- | --- |
| Authorized JavaScript origin | `http://localhost:3000` |
| Authorized redirect URI | `http://localhost:3000/api/auth/callback/google` |
| Application `AUTH_URL` | `http://localhost:3000` |

Set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` in `.env`. If the consent screen
uses testing mode, add the accounts that will test the application. Use the same
hostname throughout the browser flow. A `127.0.0.1` callback is a different URI.
This app needs basic sign-in identity, email, and profile information; it does
not request Drive, Gmail, or Calendar access.

Generate an authentication secret locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Put the result in `AUTH_SECRET`. Keep the file private. The server rejects an
invalid canonical origin and keeps redirects on that origin.

## OpenAI

1. Sign in to [OpenAI Platform](https://platform.openai.com/) and select your
   application project.
2. Open [API keys](https://platform.openai.com/api-keys). Create a user-owned
   project key for local development and copy its value into `OPENAI_API_KEY`.
3. Check [API billing](https://platform.openai.com/account/billing/overview) and
   the project's available access before testing live generation.
4. Keep the key in `.env`, outside Git and browser code. If you cannot create
   a key, ask the project's administrator for the required access.

These steps follow the [OpenAI quickstart](https://developers.openai.com/api/docs/quickstart)
and [key and identity guidance](https://developers.openai.com/api/docs/guides/api-keys).

Set `OPENAI_API_KEY` to your server-side key. `OPENAI_MODEL` defaults to
`gpt-4o-mini`; the configured model must support the application's Chat
Completions request and `max_completion_tokens` field.

Normal operation uses `OPENAI_GENERATION_DISABLED=false` or omits that flag.
An absent or expired fact then starts generation, which can incur API charges.
The server limits each attempt to ten seconds, zero retries, and 160 output
tokens. These bounds are not a spending cap.

For inspection without provider calls, set `OPENAI_GENERATION_DISABLED=true`.
Fresh facts still come from PostgreSQL. Expired facts use the saved-fact fallback.
An account with no saved fact sees an unavailable message. The app does not
invent a replacement fact. Restart the server after changing private settings.

## Separate test database

Unit and UI tests use controlled dependencies. Foundation, database,
integration, security, and browser tests also use a real test database.
The guard deliberately requires:

| Setting | Required value |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `5433` |
| Database | `movie_memory_test` |
| Role | `movie_memory_app` |

Use a PostgreSQL instance listening on port 5433. The test database must be
separate from application and shadow databases, even if they share an instance.
Connect to that instance as its administrator:

```sh
psql -h 127.0.0.1 -p 5433 -U postgres -d postgres
```

Create the test role and database if absent:

```sql
CREATE ROLE movie_memory_app LOGIN;
\password movie_memory_app
CREATE DATABASE movie_memory_test OWNER movie_memory_app;
\q
```

Set this private value, using the test role's password:

```dotenv
TEST_DATABASE_URL="postgresql://movie_memory_app:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5433/movie_memory_test?schema=public"
```

Apply the migration to that database explicitly. These commands use PowerShell
and restore the process setting even if the command fails:

```powershell
$previousDatabaseUrl = $env:DATABASE_URL
try {
  $env:DATABASE_URL = 'postgresql://movie_memory_app:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5433/movie_memory_test?schema=public'
  npx prisma migrate deploy
  if ($LASTEXITCODE -ne 0) { throw 'Test database migration failed.' }
} finally {
  $env:DATABASE_URL = $previousDatabaseUrl
}
```

Replace the placeholder before running. Do not use the application or shadow
database here. Tests verify both the URL and connected database identity before
using it. They create unique fixture IDs, delete only owned rows, and disconnect.
They do not provision or reset databases.

## Verification commands

```sh
npm run typecheck
npm run check:contracts
npm run lint
npm run test:unit
npm run test:ui
npm run test:foundation
npm run test:db
npm run test:integration
npm run build
npm run test:security
npm run check:secrets
```

The security HTTP tests and secret scanner require the production build.
The scanner checks working files, staged files, untracked nonignored files,
and built client assets. A missing build fails the scan.

For browser tests, install Google Chrome and follow
[the browser launcher guide](../tests/e2e/README.md). The launcher uses a separate
port, real test sessions, and controlled provider responses. It makes no paid
calls and does not perform Google OAuth. Keep its runtime files and reports
private. Normal `npm start` imports none of its provider or fault preloads.

## Common setup failures

| Symptom | Check |
| --- | --- |
| Google reports a redirect mismatch | Compare the registered URI with `AUTH_URL` and the callback path above. |
| Google denies a test account | Check the consent screen's test-user list. |
| Prisma cannot connect | Check the database service, port, role, password encoding, and database name. |
| Prisma Client is not generated | Run `npx prisma generate` after installation. |
| Dashboard shows an old fact with a notice | Generation failed or is disabled. Check the server settings and provider account. The saved fact remains available. |
| Tests reject the database | Check every guarded test value above. Do not loosen the guard to point at application data. |
| Port 3000 is occupied | Use the existing application or stop its server before starting another on that port. |
