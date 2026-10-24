# Deferred checks

Updated 24 October 2026. This is the register of required checks that have not passed yet. They are deferred, not skipped. GitHub Actions runs again since the repository became public: standard GitHub-hosted runners are free for public repositories ([GitHub billing docs](https://docs.github.com/en/actions/concepts/billing-and-usage)). CI clears the rows below. A full local end-to-end run can also clear a row where the local table allows it. The decision is in [memory.md](memory.md#public-repository-and-ci--20-october-2026).

## Rules

- The last commit with every CI job green is `10a4b34` on `develop`, released to `main` as `1435628` (same tree), on 20 October 2026: backend; frontend Ubuntu, macOS and Windows; staging and production deploys. The results are in [tasks.md](tasks.md#current-task-claims). A later commit stays unverified until CI passes on it.
- Rows keep their numbers after a row is cleared, so references stay valid. Rows 1–4 (backend and frontend CI on Ubuntu, macOS and Windows) and rows 5–6 (staging and production deploys) are cleared.
- Before you push, add a row for each required check that did not run. Update **Covers** when a new commit adds to an open row.
- Clear a row only when its check passes in GitHub Actions or in a full local end-to-end run. Then remove the row and record the result, date, revision and limits in [tasks.md](tasks.md), as [AGENTS.md](../AGENTS.md#verify-before-marking-complete) requires.
- Do not mark a feature Verified while a row covers it.

## Register

Commands are copied from the workflow files. Run them from the repository root.

| # | Check | Command | Platform / projects | Why deferred | Covers | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | Nightly backup and restore check ([`backup.yml`](../.github/workflows/backup.yml)) | Schedule 21:30 UTC, or manual dispatch | Ubuntu; its own GitHub Environment (for example `production-backup`) | Workflow disabled: artifacts in a public repository are downloadable by any signed-in GitHub user | Production data; follow-up F12 in [tasks.md](tasks.md#follow-up-tasks) | Blocked: private R2 storage first; start only on Arnav's explicit command, planned before launch |
| 8 | Windows Firefox job (option D) | `npx playwright install --with-deps firefox`; `npm test -- --project=firefox --workers=1` | Windows: `firefox`, as a separate parallel job | Not in CI; needs a workflow change | Windows desktop Firefox coverage | Deferred: start only on Arnav's explicit command ([memory](memory.md#public-repository-and-ci--20-october-2026)) |
| 9 | Full frontend matrix ([`frontend.yml`](../.github/workflows/frontend.yml)) and backend CI ([`backend.yml`](../.github/workflows/backend.yml)) for the current `develop` head | Manual dispatch on `develop`; release pull requests to `main` also run both workflows | Frontend: Ubuntu and macOS all six projects, Windows `chromium` and `pixel`. Backend: Ubuntu with Postgres 18, `REQUIRE_DB=1` | The latest old matrix passed Windows; Firefox image-skeleton waiting failed on Ubuntu and macOS. The 24 October fixes need a new complete matrix | Changes after `c1629dc`: privacy, scoring retry, bootstrap seed guard, staff and manager screens, staff sign-in, cascading deletes, one-device scoring, and the 24 October handoff: favicon/header, phone details, supplied empty states and tournament illustrations, public read metadata, request timeout, lease retry, stable action retries, deleted-card protection and no-store API replies. Phone projects now include scoring-flow and operator-console. Local Windows WebKit remains investigation only because of its DPI mismatch | Pending manual dispatch after the local checks pass |
| 10 | Staff layout widths on Firefox and WebKit ([`staff-layout.spec.js`](../frontend/tests/staff-layout.spec.js)) | `npm test -- --project=firefox --project=webkit tests/staff-layout.spec.js` after removing `staff-layout` from `otherDesktop.testIgnore` in `playwright.config.js` | Ubuntu or macOS: `firefox`, `webkit` | The spec runs on `chromium` only, for run time (`playwright.config.js`). The phone projects run the manager specs but not the 11-width layout checks | Every manager and Super Admin screen at 320 to 3840px on engines other than Chromium (Req 23.5) | Deferred: decide at the release review |
| 11 | Public and staff screens on physical devices | Manual: [real-phone checklist](local-development.md#check-on-a-real-phone), on staging | A physical Android phone and iPhone (Safari) | Emulation only so far | Sign-in, staff forms and shell, manager and Super Admin screens, public pages, enlarged phone match details, new illustrations, and scoring during disconnection/reconnection: touch, system text size, on-screen keyboard, date/time inputs, durable queue and device takeover | Deferred to the coach demo on staging |

### Risk for the release pull request

Several keyboard specs (`admin.spec.js`, `manage-assign.spec.js`, `operator-console.spec.js`, `sport-edge-cases.spec.js`) press Option+Tab (`Alt+Tab`) only on macOS WebKit, because macOS WebKit, like Safari, skips links on plain Tab. Windows WebKit also skipped links on plain Tab in a local check. Ubuntu WebKit, `iphone` and `ipad` use plain Tab in these specs, and their Tab behavior on links has not run yet. The release pull request must confirm these cases on Ubuntu. If they fail there, apply the same key choice to that platform in the specs; do not change the screens.

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
| 9 | Not cleared locally. The macOS runner and the backend database suite need CI. |
| 10 | Investigation only: Windows WebKit has the DPI/viewport mismatch of row 9. A local Firefox run is allowed but is not the Ubuntu/macOS result. |
| 11 | Not an automated check. Record the device, browser and result in [tasks.md](tasks.md). |
