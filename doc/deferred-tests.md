# Deferred checks

Updated 25 October 2026. This is the register of required checks that have not passed yet. They are deferred, not skipped. GitHub Actions runs again since the repository became public: standard GitHub-hosted runners are free for public repositories ([GitHub billing docs](https://docs.github.com/en/actions/concepts/billing-and-usage)). CI clears the rows below. A full local end-to-end run can also clear a row where the local table allows it. The decision is in [memory.md](memory.md#public-repository-and-ci--20-october-2026).

## Rules

- Latest full frontend matrix and backend CI: manual `develop` runs on `d8140ff`, 24 October 2026. All 408 backend cases passed. Windows passed 648 browser cases; Ubuntu and macOS each passed 1,860 with 40 intentional skips and no retries. The staging deployment passed backend, Chromium/Pixel and smoke checks. Exact runs and limits are in [tasks.md](tasks.md#current-task-claims). Production remains the earlier `8113f6d` release; its authorization is in [memory.md](memory.md#staging-only-continuation--24-october-2026).
- Rows keep their numbers after a row is cleared, so references stay valid. Rows 1–4 (backend and frontend CI on Ubuntu, macOS and Windows), rows 5–6 (earlier staging and production deploys), row 9 (24 October frontend matrix and backend CI), row 12 (Table Tennis matrix), row 13 (early match completion and result UI), and row 14 (phone rail and live-feed rollout repair) are cleared.
- Before you push, add a row for each required check that did not run. Update **Covers** when a new commit adds to an open row.
- Clear a row only when its check passes in GitHub Actions or in a full local end-to-end run. Then remove the row and record the result, date, revision and limits in [tasks.md](tasks.md), as [AGENTS.md](../AGENTS.md#verify-before-marking-complete) requires.
- Do not mark a feature Verified while a row covers it.

## Register

Commands are copied from the workflow files. Run them from the repository root.

| # | Check | Command | Platform / projects | Why deferred | Covers | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | Nightly backup and restore check ([`backup.yml`](../.github/workflows/backup.yml)) | Schedule 21:30 UTC, or manual dispatch | Ubuntu; its own GitHub Environment (for example `production-backup`) | Workflow disabled: artifacts in a public repository are downloadable by any signed-in GitHub user | Production data; follow-up F12 in [tasks.md](tasks.md#follow-up-tasks) | Blocked: private R2 storage first; start only on Arnav's explicit command, planned before launch |
| 8 | Windows Firefox job (option D) | `npx playwright install --with-deps firefox`; `npm test -- --project=firefox --workers=1` | Windows: `firefox`, as a separate parallel job | Not in CI; needs a workflow change | Windows desktop Firefox coverage | Deferred: start only on Arnav's explicit command ([memory](memory.md#public-repository-and-ci--20-october-2026)) |
| 10 | Staff layout widths on Firefox and WebKit ([`staff-layout.spec.js`](../frontend/tests/staff-layout.spec.js)) | `npm test -- --project=firefox --project=webkit tests/staff-layout.spec.js` after removing `staff-layout` from `otherDesktop.testIgnore` in `playwright.config.js` | Ubuntu or macOS: `firefox`, `webkit` | The spec runs on `chromium` only, for run time (`playwright.config.js`). The phone projects run the manager specs but not the 11-width layout checks | Every manager and Super Admin screen at 320 to 3840px on engines other than Chromium (Req 23.5) | Deferred: decide at the release review |
| 11 | Public and staff screens on physical devices | Manual: [real-phone checklist](local-development.md#check-on-a-real-phone), on staging | A physical Android phone and iPhone (Safari) | Emulation only so far | Sign-in, staff forms and shell, manager and Super Admin screens, public pages, enlarged phone match details, new illustrations, early-match finish, permanent-lock acknowledgement, stage/winner labels, short homepage rail swipes and spotlight transitions, and scoring during disconnection/reconnection: touch, system text size, on-screen keyboard, date/time inputs, durable queue and device takeover | Deferred to the coach demo on staging |
| 15 | Staging observability CI and deployment | Full backend workflow with REQUIRE_DB=1; full frontend matrix; staging deploy gate and read-only smoke | GitHub Actions; all configured projects | Local lint/build, 437 backend and 666 Chromium/Pixel cases passed; runner matrix and deployment not started | Safe handled errors, telemetry failures/privacy, staging-only gates, score/outbox replay, room fanout, recovery summary and optional RUM guard | Pending staging push and full CI |
| 16 | Staging account-side observability checks | Runbook account setup and authenticated metrics export | Cloudflare staging account; normal browser for RUM | Wrangler is signed out; separate public staging beacon token and Analytics Read access not available | Confirm dataset ingestion/query schema, Issues grouping and trace visibility, central dashboard, one staging RUM beacon and real browser measurements | Pending account access and public beacon token; independent code and CI continue |

### Risk for the release pull request

The full matrix on `d8140ff` passed Ubuntu and macOS WebKit, including iPhone and iPad spotlight checks. Native touch-drag automation uses Chromium CDP, so its iPhone/iPad cases are intentionally skipped; physical-device checks remain in row 11. No case needed a retry. The initial production home WebSocket 500 has no retained exception. The reproduced rollout compatibility failure and recursive smoke cleanup are fixed on staging; production awaits release (F5 in [tasks.md](tasks.md#follow-up-tasks)). The shared keyboard helper uses plain Tab on Linux and Option+Tab on macOS WebKit. Windows WebKit has a local DPI/viewport mismatch and is not CI evidence. Wider staff-layout checks on other engines remain open in row 10.

## Deploy merges

- `develop` deploys staging and `main` deploys production through `deploy.yml`. A direct push to `develop` starts the staging deploy. `main` requires a pull request, so the production deploy starts when the release pull request merges. The release flow is in [memory.md](memory.md#public-repository-and-ci--20-october-2026).
- Some earlier commits on `integration/matchscorer-scoring` have `[skip ci]` in the subject. GitHub skips `push` and `pull_request` workflows when the head commit message contains it ([GitHub docs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)). A squash message lists the branch commit subjects by default, so remove that text from the merge or squash message before you merge. Otherwise the deploy does not run.

## Run the deferred checks locally

Set up the machine first with [local-development.md](local-development.md#run-the-checks). Use the repository commands as the evidence. Use the `playwright-cli` skill or a browser MCP for investigation and phone/desktop captures, as [AGENTS.md](../AGENTS.md#skills-cli-tools-and-mcp-tools) describes; they do not replace the commands.

Set `CI=true` to match CI: one retry, traces on the first retry, and `test.only` refused.

| Row | On a Windows machine |
| --- | --- |
| 7 | Not reproducible locally. |
| 8 | A local Windows Firefox run is investigation only. It is not the Windows runner result that the acceptance needs. |
| 10 | Investigation only: Windows WebKit has a local DPI/viewport mismatch. A local Firefox run is allowed but is not the Ubuntu/macOS result. |
| 11 | Not an automated check. Record the device, browser and result in [tasks.md](tasks.md). |
