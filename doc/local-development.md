# Run and verify the website locally

This guide applies to the implemented frontend. It is the shared setup reference for all teams. Update it when the actual commands or prerequisites change.

## Prerequisites

- Git, to clone/pull the shared repository.
- Node.js **22.22 or newer**, with npm. CI uses Node 22.
- Internet for the first package/browser installation. Images are local after the app starts.

Check the tools:

```sh
git --version
node --version
npm --version
```

Run commands from the repository root, where the workspace `package.json` and `package-lock.json` are stored. Do not copy another machine's installed dependencies.

The homepage needs no database, account, environment file, Docker or agent connector. Agent skills and MCP tools are development aids; see [AGENTS.md](../AGENTS.md).

## Install and start

Clone the repository once, or pull the agreed branch into an existing checkout:

```sh
git clone https://github.com/campuscores/campuscores.git
cd campuscores
npm ci
npm run dev
```

Use the branch that contains the frontend changes. Local uncommitted work is not available on GitHub until the owner commits and pushes it.

Open [http://127.0.0.1:4174/](http://127.0.0.1:4174/). Keep the terminal running. Press Ctrl+C in that terminal to stop the server.

`npm ci` installs the exact locked workspace dependencies. It replaces an existing `node_modules/` directory. It does not change the lockfile. Run it again after pulling dependency/lockfile changes. Stop this checkout's dev, preview and test servers before running it. On Windows, a running server can lock a native dependency and block replacement. Restart the server only after installation succeeds.

| Dependency group | Use |
| --- | --- |
| React and React DOM | Components and browser rendering. |
| React Router | App routes and links. |
| Vite and React plugin | Development server and production build. |
| ESLint and its plugins | Source checks. |
| Playwright Test | Repeatable browser integration tests. |

Exact names, ranges and resolved versions are in the package manifests and lockfile. No Python or image-processing package is needed to run the app; the approved image variants are committed assets.

## Build and preview

```sh
npm run build
npm run preview
```

The build is in `frontend/dist/`. Preview uses port **4174**, so stop the dev server first. Preview serves the production build; it does not rebuild after source edits. Build again to inspect new changes.

Vite uses a strict port. An occupied port causes an error instead of silently switching to another URL. Stop the server you own; do not kill a teammate's process.

## Run the checks

```sh
npm run lint
npm run build
npx playwright install chromium firefox webkit
npm test
```

Install the browsers once per machine. Re-run the browser install when a Playwright update requires it. Linux also needs system libraries: use `npx playwright install --with-deps chromium firefox webkit`, or run `sudo npx playwright install-deps webkit` when WebKit reports missing libraries. CI uses `--with-deps`.

`npm run lint` also checks `shared/scoring.mjs`. Backend lint includes the shared calculations. Backend checks run the pure format suite in Node and transaction tests against CI’s temporary database. No hosted schema change is part of the scoring integration.

`npm test` runs six Playwright projects:

| Project | Engine and device descriptor | Specs |
| --- | --- | --- |
| `chromium` | Chromium, `Desktop Chrome` | All specs except `mobile.spec.js` |
| `firefox` | Firefox, `Desktop Firefox` | All specs except `mobile.spec.js` |
| `webkit` | WebKit, `Desktop Safari` | All specs except `mobile.spec.js` |
| `pixel` | Chromium, `Pixel 7` (touch, mobile) | `mobile.spec.js` only |
| `iphone` | WebKit, `iPhone 15` (touch, mobile) | `mobile.spec.js` only |
| `ipad` | WebKit, `iPad (gen 11)` (touch, mobile) | `mobile.spec.js` only |

WebKit is the engine behind Safari. It is not branded Safari. Emulated devices are not real phones. Firefox has no phone project, because Playwright does not support mobile emulation in Firefox. Some tests skip on an engine that lacks the needed input; each skip states its reason.

Select projects or files with arguments after `--`:

```sh
npm test -- --project=firefox
npm test -- --project=pixel --project=iphone --project=ipad
npm test -- tests/mobile.spec.js
```

Tests start the current production preview on **4175**. Keep that port free. Tests deliberately refuse an existing server so they cannot pass against another checkout. Build before testing.

Installed Google Chrome can be used instead of downloading Chromium. `PLAYWRIGHT_CHANNEL` applies only to the `chromium` and `pixel` projects; Firefox and WebKit always use Playwright's own builds:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm test
```

On macOS/Linux:

```sh
PLAYWRIGHT_CHANNEL=chrome npm test
```

Run commands one at a time and stop if one fails. In Git Bash, use `&&` to run the next check only after success:

```sh
npm ci && npm run lint && npm run build && CI=true PLAYWRIGHT_CHANNEL=chrome npm test
```

This command uses installed Google Chrome. Stop the project servers before starting the reinstall.

Use the repository tests for repeatable evidence. Use an installed Playwright CLI/browser MCP for investigation and visual checks. A successful screenshot alone is not a regression test.

Review phone and desktop rendering after UI/asset changes. Record tested cases, results and limitations in [tasks.md](tasks.md). Do not mark a feature verified when required checks failed or could not run.

Add feature and regression specs to `frontend/tests/` in the same change as the implementation. `npm test` discovers matching test files in that folder. Add applicable edge, failure and integration cases; preserve existing coverage. When other application layers are built, extend their commands and CI jobs/path triggers. Follow the shared verification policy in [AGENTS.md](../AGENTS.md).

[deferred-tests.md](deferred-tests.md) lists the required checks that have not passed yet, their exact commands and which ones a Windows machine can run. CI clears them.

### Before you push to develop

Pushes to `develop` do not run the CI matrix. Run the checks locally first, then push directly to `develop`; `deploy.yml` tests and deploys staging. The full matrix runs on the release pull request to `main`. The rules are in [AGENTS.md](../AGENTS.md#verify-before-marking-complete).

```sh
npm run lint
npm run build
npm test -- tests/<changed-area>.spec.js   # all of npm test when shared UI or contracts change
npm run lint:backend                      # when the backend changes
npm run test:backend                      # when the backend changes
```

To run the full matrix before a release pull request, use **Run workflow** on the Frontend checks or Backend checks workflow in GitHub Actions.

## Backend

The backend is implemented in `backend/`. The stack is a Cloudflare Worker (Hono) with Durable Object live rooms, Neon Postgres through Hyperdrive, and Clerk sign-in. See [architecture.md](architecture.md#technology).

- No Postgres or Docker is needed on team devices. CI tests migrations on a throwaway Postgres on the GitHub Actions runner.
- The root commands are: `npm run dev:backend` (local Worker), `npm run lint:backend` and `npm run test:backend`.
- Database test suites run only when `TEST_DATABASE_URL` is set; CI sets it to its throwaway Postgres. Without it they skip; with `REQUIRE_DB=1` (set in CI) the run fails instead. The URL must include a password, because Miniflare's Hyperdrive binding rejects a URL without one. The database must be migrated and loaded with `db/seed/fake.sql`. A developer may point it at a personal Neon branch of the staging project.
- Database test files run in parallel on one database. Do not change shared seed rows; create throwaway rows, or change state inside a transaction that rolls back. Do not commit a second ACTIVE `SUPER_ADMIN`: the last-Super-Admin cases in `auth.spec.js`, `accounts.spec.js` and `bootstrap.spec.js` need the seed `test_super_admin` to be the only one. A test that needs a Super Admin uses `test_super_admin`.
- Local Worker secrets go in `backend/.dev.vars`. Git ignores `.dev.vars*` and `.wrangler/`. Never commit secrets, and never put server secrets in `VITE_*` variables: Vite sends those to the browser.
- Only GitHub Actions applies migrations and deploys. Do not run them from a laptop.
- `reset-staging-demo.yml` (manual, staging only) runs `backend/scripts/reset-staging-demo.js`: in one transaction it deletes all tournament and match data on staging, then creates Test Tournament with six sports, 36 teams and 18 matches that start now, all assigned to the TFC Demo Scorer. The script refuses to run unless `RESET_ENV=staging`.

## Load test (Load_Harness)

The Load_Harness opens simulated WebSocket viewers on Live_Rooms and measures connect success, publish-to-receive latency and duplicate or missing `seq`. Thresholds and results are in [tasks.md](tasks.md#load-test-pass-thresholds).

**Gap: the script is not shared through Git.** Requirement 21.3 keeps it in the ignored `output/load/` folder, so it exists only on the machine that built it. A teammate must get the three files from that owner: `harness.mjs`, `shim.js` and `wrangler.jsonc`. If the team must share it, the proposed place is a committed `backend/scripts/load/` folder (like `smoke.js`), with raw results still written to `output/load/results/`. That changes Requirement 21.3 and needs the product owner's approval.

The harness needs Node 22 or newer and no added dependency. Every setting is an environment variable; the defaults are the agreed thresholds (`CLIENTS` 3000, `PER_MATCH` 500, `RAMP_S` 300, `HOLD_S` 600, `BURST` 1000, `BURST_S` 10, `PUBLISH_MS` 2000). Each run writes `config.json`, `timeline.jsonl` (every 5 s, with generator event-loop lag and CPU) and `summary.json` to `output/load/results/<time>/`. A run below the thresholds reports the verdict `SMOKE`. A full run reports `PASS`, `FAIL` or `INVALID` when the generator was the bottleneck (event-loop p99 over 100 ms or CPU over 85%).

Local small-scale check. The shim is a local-only Worker: it serves the real `src/index.js` plus one publish route. Never deploy it.

```sh
cd output/load && npx wrangler dev --config wrangler.jsonc --port 8788 --ip 127.0.0.1
# second terminal, repository root
BASE=http://127.0.0.1:8788 CLIENTS=120 RAMP_S=15 HOLD_S=30 BURST=40 SETTLE_S=10 node output/load/harness.mjs
```

The staging run uses `PUBLISH=api`: it takes the scorer lease and posts Test_Engine `POINT` actions to `/api/matches/:id/actions`. It needs a deployed staging Worker and a test operator; the preconditions are in [tasks.md](tasks.md#capacity-results-simulated-clients). Full run (all values default to the thresholds):

```sh
BASE=https://thaparlympics-staging.bhatiaarnav05.workers.dev PUBLISH=api MATCH_IDS=<4 live match ids> \
  CLERK_SECRET_KEY=<staging secret> CLERK_SESSION_ID=<test operator session> node output/load/harness.mjs
```
 Never put the secret key in a committed file or shell history that others can read.

## Common problems

| Symptom | Check or action |
| --- | --- |
| Site is not reachable | Run `npm run dev`, read its URL/output, and leave it running. A file URL is not the React server. |
| `vite` or dependencies missing | Run `npm ci` at the repository root. |
| `npm ci` fails with `EPERM` on a native `.node` file | Stop this checkout's dev, preview and test servers with Ctrl+C in their terminals, then retry `npm ci`. Stop after a failed install; later tool errors can come from incomplete dependencies. Do not kill unrelated processes or delete the lockfile. |
| Port 4174 or 4175 is occupied | Stop your existing preview/test server. Check the terminal that started it. |
| PowerShell blocks `npm.ps1` | Use `npm.cmd` and `npx.cmd` for the same commands. Do not change the machine's execution policy for this app. |
| Browser executable missing | Install the browsers as above, or select installed Chrome for the Chromium projects. |
| WebKit fails with "Host system is missing dependencies" | Run `sudo npx playwright install-deps webkit`. The message names the missing libraries, for example `libavif16`. Until then, run the other projects: `npm test -- --project=chromium --project=firefox --project=pixel`. |
| Preview shows old source | Run `npm run build` again, then refresh. |
| Tournament pages show sample tournaments | The build has no `VITE_API_BASE`, so the public pages show display fixtures. Set it to read the API. |
| A teammate cannot open your localhost URL | They must pull the same branch and start their own server. The address refers to their machine. |

## Generated files and deployment

`node_modules/`, `frontend/dist/`, `frontend/test-results/` and `frontend/playwright-report/` are local generated output. They are ignored by Git. Keep source, local assets, tests, configs, manifests, the lockfile and docs in the shared repository.

Hosting must serve `frontend/dist/` and return `index.html` for app routes such as `/sports/football`. This is the single-page application (SPA) fallback. The host is Cloudflare Workers static assets: staging `https://thaparlympics-staging.bhatiaarnav05.workers.dev`, production `https://campuscores.live`, both deployed by `deploy.yml`. Local preview is not a deployment.

## Worker error logs

`backend/wrangler.jsonc` enables custom application logs and runtime exceptions separately for staging and production. It redacts query strings and disables invocation logs. Both deployed environment configurations enable 1% traces. The staging additions are in [Staging observability and evidence](#staging-observability-and-evidence). Each environment applies this configuration when deployed; production received it through the 25 October release ([decision](memory.md#worker-error-logging--24-october-2026)). Log events use full sampling. Existing application errors emit fixed metadata; never add tokens, request bodies, email addresses or connection strings to logs. Retention and quotas depend on the Cloudflare plan; paid overage can add charges ([Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)).

After deployment, open Cloudflare **Workers & Pages**, select the correct environment's Worker, then open **Observability → Logs**. Filter to the failure time and, when available, the response's `X-Request-Id`. A live-feed failure needs the `/live/home` exception and time. Share the error text and request ID without credentials. Logs start after enabling them; the earlier production failure has no retained exception. CLI access requires a separate Cloudflare sign-in and is optional.

## GitHub Actions and Docker

They solve different problems:

| Tool | Purpose | This project |
| --- | --- | --- |
| GitHub Actions | Runs automated jobs after configured repository events. | The frontend workflow installs dependencies, lints, builds and runs the browser suite on Ubuntu, Windows and macOS: all six projects on Ubuntu and macOS, and `chromium` and `pixel` on Windows. It runs on pull requests to `main` that affect `frontend/**`, `shared/**`, root package files or the workflow, and on manual dispatch. It does not deploy. |
| Docker | Packages and runs software with its dependencies in a container. | No Docker setup is required for the current frontend. |

An Actions job can run Docker containers. They can work together; neither replaces the other. Backend CI (`backend.yml`) and the deploy workflow run a temporary `postgres:18` service container on the runner. Team devices do not need local Postgres.

The OS matrix checks installation, build and browser behavior on three runner systems. It covers the Chromium, Firefox and WebKit engines and emulated phones. WebKit does not run on Windows: Safari does not exist there, and Playwright's Windows WebKit port is the least representative. Ubuntu and macOS cover WebKit. CI does not test branded Safari or physical phones. Each OS reports its result; a failure on one does not cancel the others. All required jobs must pass before the change is marked Verified.

References: [GitHub Actions overview](https://docs.github.com/en/actions/get-started/understand-github-actions), [Docker overview](https://docs.docker.com/get-started/docker-overview/).

## Check on a real phone

Emulation is not real-device coverage. Run this checklist on a physical iPhone (Safari) and Android phone (Chrome) before a release that changes the sport pages. Last updated 9 October 2026.

1. Run `npm run build`.
2. From `frontend/`, run `npx vite preview --host 0.0.0.0 --port 4176 --strictPort`. Port 4176 keeps 4174 and 4175 free.
3. Connect the phone to the same trusted Wi-Fi. Open the Network URL that Vite prints. Allow the port in the computer's firewall if needed.
4. The preview is visible to the whole local network. Stop it with Ctrl+C when you finish.

On each sport page, check:

- Tap a card. The details open fullscreen, and Close is clear of the notch and safe areas.
- Close and the area outside the details close them. The page does not scroll behind the open details.
- Swipe the card rails and the date chips with a finger. On the homepage, use short slow and quick swipes in both directions: one card stays highlighted during a drag, and each phone rail settles on a card after release. Check inner score-table panning separately.
- Rotate between portrait and landscape.
- Use the system Back gesture or button with the details open. Record the actual result. Android Chrome can close the details first; the automated tests pin Back as leaving the page.
- Use large system text and 200% pinch zoom.
- With VoiceOver (iOS) and TalkBack (Android), check that the details name, the serving and winner text and the empty-section text are announced.
- Turn on the reduced-motion setting.
- The page does not scroll sideways.
- Open and use the phone header menu.

Record the device, OS version, browser version and results in [tasks.md](tasks.md).

Cloud device farms, such as BrowserStack or LambdaTest through Playwright `connect`, are a possible future option. They need an account and CI secrets. They are not set up.

## Connection recovery and local backend checks

API requests have a 15-second limit, including the response body. Public and staff lists still read once on entry and on Try again. Score delivery and temporary lease failures retry with the existing random backoff, capped at 30 seconds. A score retry keeps its action ID and sequence within the lease. A loaded scorer can keep saving pending actions offline. Initial access needs an online assignment read and lease; keep the console open during a match. Browser restart with no connection is not supported.

One login can score different assigned matches on different devices. A lease belongs to a match, not to the login. A second device on the same match needs Take over scoring, which discards its unsent actions and reloads the accepted result.

Backend database tests can use an isolated local Postgres 18 container with the migrations and `db/seed/fake.sql`. Set `REQUIRE_DB=1` and `TEST_DATABASE_URL` to that disposable database, then run `npm run test:backend`. Never use an event database for these tests. On a constrained Windows machine, `npm run test:backend -- --maxWorkers=2` limits test-pool load. A Workers pool `bad port` startup error means that suite did not run: rerun it separately and require the full CI result. Only CI migrates a hosted environment. The phone browser projects now also run `scoring-flow.spec.js` and `operator-console.spec.js`.

Neon, Clerk and Cloudflare skills are development aids. A skill does not grant account access. Read-only live inspection needs a separately authorized connection. Do not install global tools or change personal connector settings as part of a repository-only task.

For Neon staging inspection, select the project named `Campuscores-staging`, then verify its branch and database. Its current default branch is named `production`; that branch name does not identify the production application. The staging and production applications use separate projects. Pass the verified project and branch IDs explicitly. The connected Neon tools expose write operations; this handoff permits diagnostic reads and SELECT statements only. Hosted changes still use CI.

## Staging observability and evidence

The configuration and field contract are in [architecture.md](architecture.md#operational-measurements). Current deployment evidence and remaining account-only checks are in [tasks.md](tasks.md#current-task-claims). The production rollout is authorized on 25 October. Each Worker keeps its own database, Clerk and Analytics Engine bindings. Staging uses the manual browser beacon; production retains its existing automatic beacon and EU exclusion setting.

### What deploys automatically

- Both environment configurations: custom error logs, Issues, uploaded source maps and native traces at **1%**. Invocation logs stay off. Handled unexpected errors pass a safe Error object to `console.error`, so Issues can group them. Expected authorization/validation conflicts become metrics, without persistent routine log lines. See [Issues](https://developers.cloudflare.com/workers/observability/issues/) and [native tracing](https://developers.cloudflare.com/workers/observability/traces/).
- `APP_METRICS` writes to the selected environment dataset: `campuscores_staging_metrics` or `campuscores_production_metrics`. Cloudflare creates the dataset on its first write. It records API status/duration, scoring accepted/replay outcomes, post-commit publication, room broadcasts, active sweeps and observed queue recovery. No new database storage or analytics SDK. See [Analytics Engine setup](https://developers.cloudflare.com/analytics/analytics-engine/get-started/).
- `deploy.yml` enables the authenticated browser recovery summary in both environments. A separate public RUM token is optional. Without it, the app adds no beacon. The beacon also rejects the production and local origins, and avoids an existing Cloudflare script. Production uses the existing automatic injection; the app adds no manual production beacon.

### Environment isolation and provider evidence

| Component | Staging | Production | Evidence |
| --- | --- | --- | --- |
| Browser performance | Manual staging beacon/site | Existing automatic production beacon/site | Separate tokens; one script and HTTP 204 reports checked in each environment |
| Worker and rooms | `thaparlympics-staging`, its own rooms | `thaparlympics-production`, its own rooms | Native request/CPU/errors and room usage; deployed logs, Issues and 1% tracing confirmed by API |
| Application metrics | `campuscores_staging_metrics` | `campuscores_production_metrics` | API durations/outcomes, publication, fanout, sweep and queue observations; weighted export selector prevents mixing |
| Hyperdrive | Its cached and uncached configurations | Its cached and uncached configurations | Separate IDs in Wrangler; filter charts by configuration, not account totals |
| Neon | Campuscores-staging project | Campuscores-production project | Separate projects, despite both default branches being named production; system metrics, query performance and usage |
| Clerk | Development instance | Production instance | Separate keys/instances; Google enabled and GitHub disabled, confirmed through read-only config |
| Google OAuth | Clerk shared development credentials | Custom Google client | Staging has no app-owned Google client metrics; do not combine provider graphs with production |

### Authentication and database monitoring

- **Neon:** select the correct project, then Monitoring. Review system/database metrics, Active queries, Query performance and Usage. Query history uses a system-managed `pg_stat_statements` installation. The app databases currently have only `plpgsql`; no extension was installed by this work. Query statistics can reset when compute suspends or restarts, so save timed evidence. Aggregate database reads checked connections, waits, deadlocks and temporary bytes separately in both projects. Branch service-log queries returned no entries; this is not proof that raw PostgreSQL error logging is enabled. Neon's Functions/Storage/Realtime log viewers do not represent this Worker's database errors. Application database failures remain in safe Worker logs. See [Monitoring](https://neon.com/docs/introduction/monitoring), [Query performance](https://neon.com/docs/introduction/monitor-query-performance) and [service log scope](https://neon.com/docs/introduction/monitor-logs).
- **Clerk:** choose Campuscores, then the Development or Production instance. Open Application Logs and filter to the same UTC window and `sign_in.completed`, `sign_in.failed` or `sign_up.failed`. Email Logs help diagnose verification-code delivery. Current Hobby retention is one day for application/email logs; Admin Logs are unavailable on Hobby. Read-only CLI metadata confirmed the existing app and both instances; usage can be queried per instance. Billing-period active users are signed-in users, not anonymous spectators or concurrent viewers. Do not export identities, IP addresses, sessions or payloads to this public repository. See [Application Logs](https://clerk.com/docs/guides/dashboard/logs/application-logs) and [plan/retention](https://clerk.com/docs/guides/dashboard/logs/overview).
- **Google:** open the existing production Google Cloud project, then Google Auth Platform → Overview. Review OAuth Traffic, Errors and Users. Its graphs aggregate all clients in that project. A separate app-owned staging project/client is not configured: development currently uses Clerk's shared credentials. Keep production redirects, scopes, client secrets and publication state unchanged. A token-grant-rate graph can be empty for identity-only scopes. Provider authentication time is outside the Worker's API duration. See [Google Auth Platform Overview](https://support.google.com/cloud/answer/15548748).
- **Browser exceptions:** Sentry setup and current checks are in [Browser diagnostics](architecture.md#browser-diagnostics). Use the separate staging and production projects below.

### Finish the account setup

Before the first deployment, complete account onboarding in [Analytics Engine](https://dash.cloudflare.com/?to=/:account/workers/analytics-engine). If it shows **Create Blank Dataset**, enter Dataset Name `campuscores_staging_metrics` and Dataset Binding `APP_METRICS`, then Create. Its Create Binding JSON must match the existing staging Wrangler entry. The dataset can stay hidden until the Worker writes its first point. Cloudflare rejects deployment with `10089` until account onboarding is complete. This does not add a production Worker binding. If the dashboard requests a paid upgrade, keep the existing Free budget and resolve that requirement before deployment.

1. **Separate browser measurements.** In Cloudflare **Web Analytics**, add `thaparlympics-staging.bhatiaarnav05.workers.dev`. Select manual JS installation. Copy only the public `token` from its `data-cf-beacon` snippet into GitHub repository **Settings → Environments → staging → Environment variables**, named `CLOUDFLARE_WEB_ANALYTICS_TOKEN`. Do not copy the API token or the Web Analytics site's dashboard ID. The next staging build installs it. Open staging in a normal browser, check one beacon script and `/cdn-cgi/rum` requests, then check the staging site in Web Analytics. Blocking extensions can prevent collection. Do not count automated test traffic as actual use. See [Web Analytics setup](https://developers.cloudflare.com/web-analytics/get-started/).
2. **The supplied production screenshots.** They show `campuscores.live` with “Enable, excluding visitor data in the EU” selected. A screenshot does not prove the Update was saved or the beacon ran. Production automatic injection and HTTP 204 reports were confirmed in a browser before the rollout; preserve that setting. The Upgrade message is for **Web Analytics Rules**; Free has zero such rules. Basic RUM does not require that upgrade. Do not install a second production snippet. See [RUM beacon](https://developers.cloudflare.com/speed/observatory/rum-beacon/) and [rules limits](https://developers.cloudflare.com/web-analytics/limits/).
3. **Backend inspection.** In Workers & Pages select the environment's Worker, then Metrics and Observability. Staging is `thaparlympics-staging`; production is `thaparlympics-production`. Confirm Logs, Issues and Traces after deployment. Filter to the exact UTC test window. No Issues entry is expected without an error; do not deliberately crash an event match to populate it. A short run may produce no traces at 1% sampling. Automated tests check safe handled-error reporting; dashboard grouping needs account access.
4. **Database connection measurements.** Open each selected environment's Hyperdrive configuration from `backend/wrangler.jsonc`, then Metrics. Keep cached public reads separate from uncached staff/writes. Export query count, cache hits/misses, query/connection latency and waiting clients for the same window. Cache ratio is hits / (hits + misses) for that configuration, not a percentage of all database work. See [Hyperdrive metrics](https://developers.cloudflare.com/hyperdrive/observability/metrics/).
5. **Live room measurements.** Inspect the selected Worker's Durable Objects metrics: requests, WebSocket messages and resource usage. Connection metrics can appear after sockets close. Use the custom broadcast event for send attempts, bytes and failures, not unique people or confirmed receipt. See [Durable Object metrics](https://developers.cloudflare.com/durable-objects/observability/metrics-and-analytics/).
6. **Central view.** Open Analytics → Custom Dashboards; create separate **Campuscores staging** and **Campuscores production** dashboards from API Performance or a blank dashboard. Filter every applicable chart to the matching Worker and its Hyperdrive configurations. Add request volume, runtime errors, CPU/wall duration, connection/cache metrics and logs/traces. Check each chart's service filter; account totals can mix production. Use supported datasets offered by the editor. Keep the custom SQL export below alongside the dashboard if its dataset is unavailable there. Dashboard creation is an account operation, not a Wrangler setting. See [Custom Dashboards](https://developers.cloudflare.com/analytics/custom-dashboards/).

Worker Metrics, Hyperdrive Metrics and Durable Object Metrics need no application SDK or enable switch. Custom durations use the Worker clock across I/O; synchronous broadcast CPU is not timed with that clock. CPU/wall duration is not browser latency; a handled HTTP 500 can still count as a successful Worker invocation. See [Worker metric definitions](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/). RUM measures real browser LCP/INP/CLS; Observatory adds synthetic tests. Keep those evidence types separate.

### Free quotas and event-day checks

Verified against official docs on 25 October 2026:

- Workers Logs Free: **200,000 events/day, three-day retention** until 30 November 2026. This is a log-event allowance, not 200,000 visitors or total API requests. Routine requests and broadcasts create no custom log line. Error storms can still exhaust it; 1% tracing is sampling, not a hard spending cap. Check the account usage page before and after a test. See [Workers Logs pricing](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).
- From **1 December 2026**, Cloudflare announces a shared Free logs/traces allowance of **0.5 GB/day with seven-day retention**. Free ingestion stops at the daily allowance and resets at 00:00 UTC. Paid plans can incur overage. Recheck before that date; do not apply the future allowance to today's 200k display. See [Observability pricing](https://developers.cloudflare.com/observability/pricing/).
- Analytics Engine publishes **100,000 writes/day and 10,000 read queries/day** for Workers Free. Its current pricing page says usage is not yet billed. This is a separate allowance from logs. One point per request/broadcast, not per viewer recipient; one recovery summary per observed episode. Other applications share account usage. The app does not implement an account-wide quota counter. Collection can be incomplete because of sampling, quota or failures; scoring must continue. See [Analytics Engine pricing](https://developers.cloudflare.com/analytics/analytics-engine/pricing/).

Check at the start and end of the event, and before retention expires. Export evidence daily. No background monitor or paid plan was added. Browser diagnostics use the separate Sentry setup below.

### Export custom metrics

In Cloudflare, open **My Profile → API Tokens → Create Token → Create Custom Token**. Give it **Account → Account Analytics → Read**, scoped to this account. Copy the account ID from the Workers account overview. Store the token only locally, never Vite, source, chat, a screenshot or public CI artifact. Wrangler login is separate from this read token. From the designated checkout in PowerShell, use a masked prompt:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = Read-Host "Cloudflare account ID"
$metricsReadToken = Read-Host "Account Analytics Read token" -AsSecureString
$env:CLOUDFLARE_ANALYTICS_READ_TOKEN = [Net.NetworkCredential]::new("", $metricsReadToken).Password
try {
  node backend/scripts/export-metrics.js 2026-10-25T00:00:00Z 2026-10-26T00:00:00Z > output/staging-metrics-2026-10-25.json
} finally {
  $env:CLOUDFLARE_ANALYTICS_READ_TOKEN = $null
  $metricsReadToken = $null
}
```

Use an explicit interval of at most 24 hours. The script makes two read-only queries, returns aggregate groups and five-minute counts, and rejects missing access, invalid periods and truncated results. It defaults to staging. Add `--production` before the dates to query only production: `node backend/scripts/export-metrics.js --production <from> <to>`. It never changes scores or mixes datasets. Empty arrays mean no recorded evidence in that window. Sampling weights apply to counts, means and p95/p99; do not replace them with raw `COUNT(*)`, or average daily percentiles to make a weekly percentile. Re-run an appropriate aggregate query for a longer percentile window. Reference: [SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/) and [weighted aggregate functions](https://developers.cloudflare.com/analytics/analytics-engine/sql-reference/aggregate-functions/).

### Select credible project results

Keep date/window, environment, deployed revision, sample count, device/network or simulated load, source and remaining limits with every result. Store raw exports/captures in ignored `output/` or private storage. Never commit them or attach staff data to this public repository.

| Engineering claim | Evidence to gather | Required distinction |
| --- | --- | --- |
| Responsive scoring API | Action-route accepted/replay counts, p95/p99 duration and 4xx/5xx breakdown | Server duration through transaction, not tap-to-screen latency; separate retries and intended refusals from errors |
| Cache effectiveness | Cached Hyperdrive hit ratio and latency, measured over a comparable workload | Do not claim a speedup without a controlled before/after comparison; uncached authorization remains current |
| Live fanout efficiency | Broadcast attempts, payload bytes, send failures; native DO usage | Sockets can include multiple tabs; bytes exclude framing/compression; enqueue success is not receipt |
| Recoverable live delivery | Publication failures and later sweep deliveries, batch age/pending | Batch has at most 200 rows, not total backlog; recovery is not a second accepted score |
| Offline recovery | Recovered/paused summaries, peak pending, retries and p95 drain time | Client-reported, page-local, incomplete; verify reload/order/idempotency with fault tests and physical devices |
| Phone experience | RUM p75 LCP/INP/CLS split by phone/desktop and page; Observatory synthetic results | Staging synthetic traffic is not real production use; sample size and slow networks matter |
| Reliability and cost | Runtime errors, HTTP 5xx, usage/quota exports and fault-test results | No-error samples do not prove uptime; current test counts do not prove hosted concurrency capacity |

For a résumé, select two or three strong measured results that explain a design tradeoff: cached public reads with uncached authorization, atomic score/outbox persistence, hibernating fanout, or idempotent queue replay. State actual measured numbers and the test environment. Keep the 3,000-client goal marked unmeasured until its authorized load test runs. Staging results must stay labelled staging. Production results need their own collection window, revision and dataset.

### Repeatable browser performance checks

Keep Cloudflare RUM as the real-browser source. A Lighthouse run is a lab sample, not a real-user percentile or a concurrency test. For an anonymous read-only mobile sample, run this from the root with Chrome installed:

```sh
npx --yes lighthouse@13.5.0 https://campuscores.live --chrome-flags="--headless" --quiet --output=json --output-path=output/lighthouse-production.json
```

Repeat sequentially three times with distinct output names. Record the Lighthouse/Chrome versions, revision, UTC window, device/network/CPU simulation, score range, LCP, TBT and CLS. Use the staging hostname and a separate output prefix for staging. Do not compare different hosts/content as a controlled before/after improvement. Lighthouse TBT is not production INP. Keep reports in ignored `output/`. Do not run authenticated scoring flows or simulated scoring load on production.

### Sentry browser diagnostics

Arnav uses the GitHub Student Developer Pack entitlement. Inspect Organization Settings → Subscription and Usage for the actual allowances and expiry; no billing settings were changed. The trial banner alone does not confirm the student allowance. Keep sampled traffic within the displayed limits.

Projects in `arnav-bhatia`: `campuscores-staging` and `campuscores-production`. Open Issues for unexpected browser errors, Explore → Traces for sampled page/request timing, Logs for `Scoring queue recovery`, Metrics for `campuscores.queue.drain_ms` and `campuscores.queue.peak`, and Replays for the masked staging public-page sample. Filter by project, environment, release and an explicit time window. Queue summaries are client observations, not server acceptance counts or cross-reload recovery guarantees. Production initially sends errors and 1% traces only.

In GitHub Settings → Environments, each environment needs public variable `SENTRY_DSN` and private secret `SENTRY_AUTH_TOKEN`. The two organization upload tokens have separate names for rotation and are stored only in their matching environment. Their organization upload permission is not a project-level credential boundary. Never prefix the private token with `VITE_`, put it in app source, print it, or paste it into chat. The release deploy build validates uploads before publishing; a missing or rejected token fails the build. Local builds and ordinary CI browser checks need no private token and send no real events.

The [diagnostics contract](architecture.md#browser-diagnostics) owns sampling and privacy. Keep `dataCollection.userInfo=false` and the replay metadata inference setting: `sendDefaultPii=false` alone does not stop IP/location inference in SDK v11. In each project, open Security & Privacy and keep Data Scrubber and Use Default Scrubbers on. Enable Prevent Storing of IP Addresses. In Additional Sensitive Fields, preserve existing entries and add `city`, `subdivision`, `region`, `country_code` and `ip_address`, one per line. Click outside the field, then refresh to confirm the values persist. These fields do not need an Advanced Data Scrubbing rule. Allow 5-15 minutes for server changes, then check a newly ingested event rather than only the browser payload. Existing events are not scrubbed retroactively. See [Sentry location scrubbing](https://www.sentry.help/en/articles/13964201-can-i-disable-ip-geolocation-for-gdpr-compliance). Replays capture one public entry page for at most 60 seconds and stop on navigation; they do not inspect scorer screens. Source maps contain source code and stay private in Sentry, not public assets. Keep test validation events separate from event usage. A first event or replay proves ingestion, not reliability or performance at scale.

Authenticated checks on 25 October 2026 confirmed separate staging/production Analytics Engine exports and native Cloudflare Worker, Hyperdrive and Durable Object measurements. Filter Worker queries by `scriptName`, Hyperdrive by the configured `configId`, and rooms by the implementing Worker’s `ROOMS.namespace_id`; do not combine environments. Keep the window and sampling information with an export. Client disconnect statuses are not runtime failures. Native Hyperdrive averages are not percentiles. Platform counts include cron/socket activity and validation traffic, so they do not measure unique visitors. Central dashboard creation and the remaining account views stay deferred until checked.
