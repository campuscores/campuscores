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
npx playwright install chromium
npm test
```

Install Chromium once per machine. Re-run the browser install when a Playwright update requires it. Linux CI uses `npx playwright install --with-deps chromium`.

Tests start the current production preview on **4175**. Keep that port free. Tests deliberately refuse an existing server so they cannot pass against another checkout. Build before testing.

Installed Google Chrome can be used instead of downloading Chromium:

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

## Common problems

| Symptom | Check or action |
| --- | --- |
| Site is not reachable | Run `npm run dev`, read its URL/output, and leave it running. A file URL is not the React server. |
| `vite` or dependencies missing | Run `npm ci` at the repository root. |
| `npm ci` fails with `EPERM` on a native `.node` file | Stop this checkout's dev, preview and test servers with Ctrl+C in their terminals, then retry `npm ci`. Stop after a failed install; later tool errors can come from incomplete dependencies. Do not kill unrelated processes or delete the lockfile. |
| Port 4174 or 4175 is occupied | Stop your existing preview/test server. Check the terminal that started it. |
| PowerShell blocks `npm.ps1` | Use `npm.cmd` and `npx.cmd` for the same commands. Do not change the machine's execution policy for this app. |
| Browser executable missing | Install Chromium as above, or select installed Chrome. |
| Preview shows old source | Run `npm run build` again, then refresh. |
| Sport/tournament detail is blank | These routes are reserved; their UI is not implemented yet. |
| A teammate cannot open your localhost URL | They must pull the same branch and start their own server. The address refers to their machine. |

## Generated files and deployment

`node_modules/`, `frontend/dist/`, `frontend/test-results/` and `frontend/playwright-report/` are local generated output. They are ignored by Git. Keep source, local assets, tests, configs, manifests, the lockfile and docs in the shared repository.

Future hosting must serve `frontend/dist/` and return `index.html` for app routes such as `/sports/football`. This is the single-page application (SPA) fallback. The production host is still open; local preview is not a deployment.

## GitHub Actions and Docker

They solve different problems:

| Tool | Purpose | This project |
| --- | --- | --- |
| GitHub Actions | Runs automated jobs after configured repository events. | The frontend workflow installs dependencies, lints, builds and runs the full Chromium suite on Ubuntu, Windows and macOS. It runs on pushes/pull requests affecting `frontend/**`, root package files or the workflow. It does not deploy. |
| Docker | Packages and runs software with its dependencies in a container. | No Docker setup is required for the current frontend. |

An Actions job can run Docker containers. They can work together; neither replaces the other. Planned database CI may use a temporary database on the runner. That workflow is not implemented, and team devices do not need local Postgres.

The OS matrix checks installation, build and browser behavior on three runner systems. It does not test Safari, Firefox or physical phones. Each OS reports its result; a failure on one does not cancel the others. All required jobs must pass before the change is marked Verified.

References: [GitHub Actions overview](https://docs.github.com/en/actions/get-started/understand-github-actions), [Docker overview](https://docs.docker.com/get-started/docker-overview/).
