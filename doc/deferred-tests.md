# Deferred checks

Updated 20 October 2026. This is the register of required checks that have not passed yet. They are deferred, not skipped. GitHub Actions runs again since the repository became public: standard GitHub-hosted runners are free for public repositories ([GitHub billing docs](https://docs.github.com/en/actions/concepts/billing-and-usage)). CI clears the rows below. A full local end-to-end run can also clear a row where the local table allows it. The decision is in [memory.md](memory.md#public-repository-and-ci--20-october-2026).

## Rules

- The last commit with every CI job green is `6f19182` on `integration/matchscorer-scoring` (backend; frontend Ubuntu, macOS and Windows). CI has not verified any later commit yet. Each later commit stays unverified until every row that covers it is cleared.
- Before you push, add a row for each required check that did not run. Update **Covers** when a new commit adds to an open row.
- Clear a row only when its check passes in GitHub Actions or in a full local end-to-end run. Then remove the row and record the result, date, revision and limits in [tasks.md](tasks.md), as [AGENTS.md](../AGENTS.md#verify-before-marking-complete) requires.
- Do not mark a feature Verified while a row covers it.

## Register

Commands are copied from the workflow files. Run them from the repository root.

| # | Check | Command | Platform / projects | Why deferred | Covers | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Backend checks ([`backend.yml`](../.github/workflows/backend.yml)): lint, all migrations, fake seed, Worker and database tests | `npm ci`; `npm run lint:backend`; `npx dbmate --url "$TEST_DATABASE_URL" --migrations-dir db/migrations --no-dump-schema --wait up`; `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f db/seed/fake.sql`; `REQUIRE_DB=1 npm run test:backend` | Ubuntu, Node 22.22, throwaway `postgres:18` | Not run in CI after `6f19182`; needs CI's temporary Postgres. Without `TEST_DATABASE_URL`, local Windows on `6f19182`: 127 passed, 94 database cases skipped | `integration/matchscorer-scoring` after `6f19182` | Deferred; CI runs it on the next push |
| 2 | Frontend checks, Ubuntu ([`frontend.yml`](../.github/workflows/frontend.yml)) | `npm ci`; `npm run lint`; `npm run build`; `npx playwright install --with-deps chromium firefox webkit`; `npm test` | Ubuntu: `chromium`, `firefox`, `webkit`, `pixel`, `iphone`, `ipad` | Not run in CI after `6f19182`; needs Linux for the CI WebKit, iPhone and iPad runs | `integration/matchscorer-scoring` after `6f19182` | Deferred; CI runs it on the next push |
| 3 | Frontend checks, macOS (`frontend.yml`) | Same as row 2 | macOS: all six projects | Not run in CI after `6f19182`; needs macOS | `integration/matchscorer-scoring` after `6f19182` | Deferred; CI runs it on the next push |
| 4 | Frontend checks, Windows (`frontend.yml`) | `npm ci`; `npm run lint`; `npm run build`; `npx playwright install --with-deps chromium`; `npm test -- --project=chromium --project=pixel` | Windows: `chromium`, `pixel` | Not run in CI after `6f19182` | `integration/matchscorer-scoring` after `6f19182` | Deferred; CI runs it on the next push |
| 5 | Staging deploy ([`deploy.yml`](../.github/workflows/deploy.yml)): deploy gate tests, `dbmate up` on staging, fake seed, build, `wrangler deploy --env staging`, smoke | Merge a pull request into `develop`; smoke: `node backend/scripts/smoke.js "$BASE_URL"` | Ubuntu; GitHub Environment `staging` | Runs only on a merge into `develop` | Merge of [PR #2](https://github.com/campuscores/campuscores/pull/2) into `develop` | Waits for the PR #2 merge |
| 6 | Production deploy (`deploy.yml`): same steps, no seed, `wrangler deploy --env production`, smoke | Merge a pull request into `main`; the `production` reviewer approves the deploy | Ubuntu; GitHub Environment `production` | Runs only on a merge into `main`, after Arnav's staging check | The next release to `main` | Waits for the next release |
| 7 | Nightly backup and restore check ([`backup.yml`](../.github/workflows/backup.yml)) | Schedule 21:30 UTC, or manual dispatch | Ubuntu; its own GitHub Environment (for example `production-backup`) | Workflow disabled: artifacts in a public repository are downloadable by any signed-in GitHub user | Production data; follow-up F12 in [tasks.md](tasks.md#follow-up-tasks) | Blocked: private R2 storage first, before launch |
| 8 | Windows Firefox job (option D) | `npx playwright install --with-deps firefox`; `npm test -- --project=firefox --workers=1` | Windows: `firefox`, as a separate parallel job | Not in CI; needs a decision and a workflow change | Windows desktop Firefox coverage | Open decision ([memory](memory.md#public-repository-and-ci--20-october-2026)) |

## Deploy merges

- `develop` deploys staging and `main` deploys production through `deploy.yml`. The ruleset on both branches requires a pull request, so a deploy starts when a pull request merges. The release flow is in [memory.md](memory.md#public-repository-and-ci--20-october-2026).
- Some earlier commits on `integration/matchscorer-scoring` have `[skip ci]` in the subject. GitHub skips `push` and `pull_request` workflows when the head commit message contains it ([GitHub docs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)). A squash message lists the branch commit subjects by default, so remove that text from the merge or squash message before you merge. Otherwise the deploy does not run.

## Run the deferred checks locally

Set up the machine first with [local-development.md](local-development.md#run-the-checks). Use the repository commands as the evidence. Use the `playwright-cli` skill or a browser MCP for investigation and phone/desktop captures, as [AGENTS.md](../AGENTS.md#skills-cli-tools-and-mcp-tools) describes; they do not replace the commands.

Set `CI=true` to match CI: one retry, traces on the first retry, and `test.only` refused.

| Row | On a Windows machine |
| --- | --- |
| 1 | Lint and the non-database tests run. The 94 database cases skip without `TEST_DATABASE_URL`. They need a disposable Postgres 18 database, migrated and seeded as in row 1. The documented option is a personal Neon branch of the staging project ([local-development.md](local-development.md#backend-planned)). Delete it afterwards. Never point tests at the staging or production main branch. A local Postgres or Docker database needs a decision first: team devices run no Postgres ([memory.md](memory.md#backend-and-hosting-decisions--11-october-2026)). |
| 2, 3 | Not reproducible. Windows WebKit is a different port from the CI WebKit on Linux and macOS. Use a Linux or macOS machine. Linux needs `npx playwright install --with-deps`. |
| 4 | Reproducible. A local pass is evidence for this row; record the machine and browser versions. |
| 5, 6 | Not reproducible locally. Only GitHub Actions applies migrations and deploys. After a deploy, `node backend/scripts/smoke.js <url>` can run from any machine. |
| 7 | Not reproducible locally. |
| 8 | A local Windows Firefox run is investigation only. It is not the Windows runner result that the acceptance needs. |
