# Deferred checks

Updated 25 October 2026. This is the register of required checks that have not passed yet. They are deferred, not skipped. GitHub Actions runs again since the repository became public: standard GitHub-hosted runners are free for public repositories ([GitHub billing docs](https://docs.github.com/en/actions/concepts/billing-and-usage)). CI clears the rows below. A full local end-to-end run can also clear a row where the local table allows it. The decision is in [memory.md](memory.md#public-repository-and-ci--20-october-2026).

## Rules

- Latest release checks passed on `0624493`, 25 October 2026: backend 438; Windows 666; macOS 1,914 and 40 intentional skips; Ubuntu 1,913, one existing WebKit filter case on retry, and 40 skips. Production `05400a8` passed its deploy gate and read-only preservation checks. Exact runs are in [tasks.md](tasks.md#current-task-claims). The wide-touch follow-up remains row 18.
- Rows keep their numbers after a row is cleared, so references stay valid. Rows 1–4 (backend and frontend CI on Ubuntu, macOS and Windows), rows 5–6 (earlier staging and production deploys), row 9 (24 October frontend matrix and backend CI), row 12 (Table Tennis matrix), row 13 (early match completion and result UI), row 14 (phone rail and live-feed rollout repair), row 15 (staging observability CI/deployment), and row 17 (production observability release) are cleared.
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
| 16 | Provider monitoring and Cloudflare dashboards | Native metrics/log/trace inspection and both environment exports; provider account review | Cloudflare, Neon, Clerk and Google | Account access now works for Cloudflare and Clerk. Deployed settings and production SQL export passed; remaining service views are not yet verified | Both environment dashboards; native Issues/traces; staging export; Google project metrics/isolation. No deliberate hosted error or scoring mutation | In progress; preserve live data and secrets |
| 18 | Wide touch rail settlement | Local required checks; staging gate; release frontend matrix and production touch-input smoke | Pixel, iPhone and iPad emulation; physical check remains row 11 | New 25 October touch report includes wide mobile layouts | Slow swipes, both ends, native panning, desktop preservation | Local lint/build and 667 Chromium/Pixel passed; staging/release checks pending |

### Risk for the release pull request

The release matrix on `0624493` passed; one existing Ubuntu WebKit match-filter case needed its retry. Physical devices remain in row 11; native touch-drag cases on WebKit are intentionally skipped. Production observability and the home-feed rollout repair are deployed in `05400a8`. One beacon and HTTP 204 collection passed in a normal Chrome CLI session; this is validation traffic, not production use or stable Core Web Vitals. Production SQL export and deployed settings passed authenticated reads. Remaining provider and dashboard checks are row 16. The initial production home-feed exception was not retained; its source fix is now deployed. Wider staff-layout checks on other engines remain in row 10.

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
