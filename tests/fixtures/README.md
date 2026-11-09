# Test boundaries

Tests cover FR-01 through FR-12 and NFR-02 through NFR-09 in docs/docs-plan.md.
Production source does not import these fixtures.

## Isolated tests

The foundation and UI projects use exact aliases for identity, facts, and
authentication. Each test sets its own result. Unconfigured mocks do not supply
a successful result. Unit fact tests replace identity only; the fact engine
remains real. Tests import the module under test by its source path.

Database, integration, and security tests resolve real production modules.
The server-only replacement applies only inside the test runner. Test compiler
scopes remain separate from the application scope.

## Database guard

openTestDatabase reads TEST_DATABASE_URL from the ignored root .env file.
It requires PostgreSQL at 127.0.0.1:5433, database movie_memory_test, and role
movie_memory_app. It checks the connected database and role before it returns
a client. Missing or different configuration fails the tests.

Prepare this separate database and apply the checked-in migration before tests.
Tests do not reset or migrate it. Each suite creates unique fixture IDs, deletes
only its own rows, checks cleanup, and disconnects. Never use the application or
shadow database as the test database.

The schema timestamp test checks the PostgreSQL timestamp default. Fact-store
tests separately check UTC interpretation and database-clock cache behavior.

## Production-process fixtures

provider-preload.mjs sends SDK traffic to a loopback controller and removes the
authorization header. identity-preload.mjs injects a database error for one
selected test session. Test launchers select these files with Node --import.
Normal application startup selects neither file.

session.ts creates real database sessions for owned test users. This checks
session enforcement and logout; it does not prove that Google OAuth succeeds.
Controlled provider responses do not prove live OpenAI access.

## Commands

Use the pinned Node version and run commands from the repository root:

```sh
npm run check:contracts
npm run test:foundation
npm run test:unit
npm run test:ui
npm run test:db
npm run test:integration
npm run build
npm run test:security
npm run check:secrets
```

The six Vitest projects use separate suite patterns. Security HTTP tests and
the secret scanner require a production build. See tests/e2e/README.md for
production browser tests and private report handling.
