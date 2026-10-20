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
git clone https://github.com/Kush-Saharan/t-lympics.git
cd t-lympics
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

## Backend (planned)

The backend is planned and not implemented. The stack is a Cloudflare Worker (Hono) with Durable Object live rooms, Neon Postgres through Hyperdrive, and Clerk sign-in. See [architecture.md](architecture.md#technology).

- No Postgres or Docker is needed on team devices. CI tests migrations on a throwaway Postgres on the GitHub Actions runner.
- These root commands arrive with the backend scaffold: `npm run dev:backend` (local Worker), `npm run lint:backend` and `npm run test:backend`.
- Database test suites run only when `TEST_DATABASE_URL` is set; CI sets it to its throwaway Postgres. Without it they skip; with `REQUIRE_DB=1` (set in CI) the run fails instead. The URL must include a password, because Miniflare's Hyperdrive binding rejects a URL without one. The database must be migrated and loaded with `db/seed/fake.sql`. A developer may point it at a personal Neon branch of the staging project.
- Local Worker secrets go in `backend/.dev.vars`. Git ignores `.dev.vars*` and `.wrangler/`. Never commit secrets, and never put server secrets in `VITE_*` variables: Vite sends those to the browser.
- Only GitHub Actions applies migrations and deploys. Do not run them from a laptop.

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

The staging run uses `PUBLISH=api`: it takes the scorer lease and posts Test_Engine `POINT` actions to `/api/matches/:id/actions`. It needs a deployed staging Worker and a test operator; see the exact command and preconditions in [tasks.md](tasks.md#capacity-results-simulated-clients). Never put the secret key in a committed file or shell history that others can read.

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
| Tournament detail is blank | Tournament routes are reserved; their UI is not implemented yet. |
| A teammate cannot open your localhost URL | They must pull the same branch and start their own server. The address refers to their machine. |

## Generated files and deployment

`node_modules/`, `frontend/dist/`, `frontend/test-results/` and `frontend/playwright-report/` are local generated output. They are ignored by Git. Keep source, local assets, tests, configs, manifests, the lockfile and docs in the shared repository.

Hosting must serve `frontend/dist/` and return `index.html` for app routes such as `/sports/football`. This is the single-page application (SPA) fallback. The host is Cloudflare Workers static assets: staging `https://thaparlympics-staging.bhatiaarnav05.workers.dev`, production `https://campuscores.live`, both deployed by `deploy.yml`. Local preview is not a deployment.

## GitHub Actions and Docker

They solve different problems:

| Tool | Purpose | This project |
| --- | --- | --- |
| GitHub Actions | Runs automated jobs after configured repository events. | The frontend workflow installs dependencies, lints, builds and runs the browser suite on Ubuntu, Windows and macOS: all six projects on Ubuntu and macOS, and `chromium` and `pixel` on Windows. It runs on pushes/pull requests affecting `frontend/**`, `shared/**`, root package files or the workflow. It does not deploy. |
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
- Swipe the card rails and the date chips with a finger.
- Rotate between portrait and landscape.
- Use the system Back gesture or button with the details open. Record the actual result. Android Chrome can close the details first; the automated tests pin Back as leaving the page.
- Use large system text and 200% pinch zoom.
- With VoiceOver (iOS) and TalkBack (Android), check that the details name, the serving and winner text and the empty-section text are announced.
- Turn on the reduced-motion setting.
- The page does not scroll sideways.
- Open and use the phone header menu.

Record the device, OS version, browser version and results in [tasks.md](tasks.md).

Cloud device farms, such as BrowserStack or LambdaTest through Playwright `connect`, are a possible future option. They need an account and CI secrets. They are not set up.
