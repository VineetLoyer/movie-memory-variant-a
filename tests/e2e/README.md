# Production browser tests

Use the pinned Node 24.22.2 runtime and the existing Chrome installation. These
tests use the real production build, Auth.js adapter, Prisma client, identity and
fact services. They do not perform Google OAuth or paid OpenAI calls.

1. Configure the ignored `.env` with the approved `TEST_DATABASE_URL`. The shared
   guard requires `movie_memory_test`, role `movie_memory_app`, at 127.0.0.1:5433.
2. Run `npm run build` after production inputs change.
3. In a terminal at the repository root, run `node tests/e2e/launch.ts`.
   Wait for `TASK19_READY`. Keep that process alive.
4. In another terminal, run `npm run test:e2e`. Both desktop 1440x900 and
   mobile 390x844 projects run serially against that same production process.
5. Send a line of input to the launcher to stop its exact child, close the
   loopback controller, delete its exact owned users and verify cascading row
   cleanup, and disconnect the DB. Its `runtime.json.cleanup.json` records counts.
   After this owned launcher exits, remove its runtime metadata before another
   run; creation intentionally refuses to overwrite an existing runtime file.

The default metadata path is `.omo/tmp/e2e/runtime.json`; override it with
`MOVIE_MEMORY_E2E_RUNTIME` in both terminals. `MOVIE_MEMORY_E2E_EVIDENCE` chooses
the ignored report directory (default `.omo/evidence/e2e`). Runtime metadata,
cookies and complete trace/report payloads are private test artifacts. Do not
commit or publish them. Remove the owned temporary profile/cache directory after
all owned browser processes exit.

The controller serves SDK-compatible success, 503, held and timeout responses.
The provider preload is selected only through the test child's Node `--import`
argument. It strips authorization before forwarding OpenAI requests and delegates
other fetches unchanged. Normal `npm start` selects neither preload.

The identity preload preserves actual Prisma queries except a selected owned
session's read, which executes a real `SELECT 1 / 0` SQL fault. The controller
selects only a session it seeded, acknowledges enable/disable over process IPC,
and the application never imports or chooses this fixture.

The burst case holds the real upstream response, drives two tabs, asserts one
request and exactly one new persisted fact, then reloads both tabs without
generation. The initial response is paused after the real HTTP fetch so the
test can assert persistence before giving the browser that unchanged response.
The timeout case uses the actual ten-second SDK bound. No retries mask failures.

If a scenario fails, inspect the private HTML report and Playwright trace. Check
the controller's scoped `/state` and `/stats` results, not production data.
The tests cover a single Node process; they do not prove distributed locking.
