# Implementation Tasks: Thaparlympics Score Website

**Status:** Detailed implementation backlog; sport formats and selected operating policies remain open inputs.  
**Stack:** React/Vite + JavaScript on Cloudflare Workers static assets; Hono API Worker; Durable Object WebSocket rooms for live delivery; Neon Postgres through Hyperdrive; Clerk sign-in (open Viewer sign-up, invited staff roles); `dbmate` migrations in `db/migrations/` applied by GitHub Actions. No Postgres or Docker runs on any team device. Decided 11 October 2026; see [memory.md](memory.md#backend-and-hosting-decisions--11-october-2026).  
**Expected audience:** approximately 1,000 actual concurrent viewers. **Capacity demonstration:** 3,000 simulated clients only, pending a measured load test.

## 0. Product decisions agents must preserve

- The top-level public entity is a tournament: tournament index → tournament → enabled sport → matches → match detail.
- On tournament creation, a manager selects a subset of football, volleyball, basketball, table tennis, lawn tennis, and badminton.
- A tournament sport has its own validated, configurable scoring format and point values. Do not treat unlike sports as a single generic score counter; share configuration/versioning infrastructure but retain sport-specific domain engines.
- Each tournament sport's bracket is exactly two semifinals feeding one final. A manager assigns teams to the two semifinal matches; approved semifinal winners fill the final slots. Do not add other bracket rounds in this release.
- Regular_Matches (stored kind `CUSTOM`, shown as "Match"; the UI never says "custom") are outside the bracket, public with their tournament, and never affect bracket progression.
- Roles are explicit in `admin_accounts.role`: `SUPER_ADMIN`, `TOURNAMENT_MANAGER`, `MATCH_OPERATOR`; spectators are anonymous. One role per account; Super Admin includes every manager capability. A Tournament Manager acts only in their Manager_Scope: owned tournaments and the tournament sports where they are a Sport_Manager (`tournament_sport_managers`). Sport_Manager is a scope, not a role. No `is_admin` flag and still **no sport-scoped admin roles**.
- Only Super Admins create Tournament Managers and Super Admins. Managers can invite `MATCH_OPERATOR` accounts only.
- Match-scoped operator assignments (`match_operator_assignments`) are required. Operators score only matches with an effectively valid assignment; managers who score assign themselves first. One active assignment per match; `scorer_leases` picks the one active device.
- Every scoring HTTP/socket command runs the authorization chain against the database (token → active account → active assignment → time window by server time → `SCORE` → match accepting scores → lease). Unassigned match = 403; locked match = 409.
- The assigned operator confirms the final score; it immediately becomes final and locked (`APPROVED`). No separate manager review or post-final editing (confirmed 20 October 2026). Keep live score updates visible before confirmation.
- Live undo by the assigned operator is unlimited, needs no reason, is stored as reversal actions, and shows no public marker. Final confirmation permanently locks later edits.
- Use the Thapar logo site-wide when the user supplies the official asset. Do not fabricate or substitute an unofficial mark. Build a replaceable logo asset slot; logo file is intentionally pending.
- Implement in JavaScript, not TypeScript. PostgreSQL is the durable source of truth; Durable Object rooms are transport only.
- Never change a hosted database schema outside CI; every schema change is a `dbmate` migration deployed by CI.
- Never describe the 3,000 simulated-client goal as actual attendance or tested capacity until the load test is run and reported.

## Agent workflow and implementation conventions

1. Before coding, read `prd.md`, `architecture.md`, `rules.md`, `design.md`, and `memory.md`.
2. Choose an agreed, scoped incomplete task with clear ownership and dependencies. Independent frontend work can proceed alongside other phases; preserve completed homepage work. Record assumptions/questions in `memory.md`; do not resolve an open sports rule by guessing.
3. Keep changes cohesive and reviewable. Every schema change is a migration in `db/migrations/`; every new scoring format gets domain tests before UI work depends on it.
4. Use runtime validation for every API/socket payload. Use JSDoc and linting; never add TypeScript unless the product decision changes.
5. Enforce permissions server-side. Anonymous spectator APIs are read-only and return only approved public fields.
6. Persist an accepted score action, projection update, audit record, and outbox event in a transaction. Broadcast only committed data.
7. Test every protected path per role: Super Admin, Tournament Manager, Match Operator (assigned, unassigned, not yet valid, expired, revoked, locked match), and anonymous Spectator.
8. Use SCHEDULED → LIVE (provisional) → APPROVED/FINAL for new scoring. Preserve legacy pending/rejected row compatibility; do not create new review/reopening endpoints.
9. Update affected docs and this task list when requirements change; don't silently fork behavior between PRD, architecture, and rules.
10. Follow [AGENTS.md](../AGENTS.md) for tools, ownership, decision gates, final documentation and publication evidence. Use `handoff.md` for integration and `local-development.md` for setup. Keep one current task entry; do not append an execution diary.

## Current frontend work — pushed

The homepage, frontend CI, badminton page (`9a22720`) and all-sports change (`dfe54f5`) are on `origin/main`. Frontend CI results on `4405c8b` are recorded in [Known failures](#known-failures--20-october-2026). Requirements and unchecked tasks below remain planned.

| Area | Final implementation | Current status |
| --- | --- | --- |
| Homepage | React/Vite JavaScript, approved responsive UI, local artwork, filters, native card rails and reserved detail routes. Use [handoff.md](handoff.md) for integration and [design.md](design.md) for visual contracts. With `VITE_API_BASE` the live row reads the `home` room; on `develop` the tournament row also reads Live tournaments from the API (staff roles row below). | On `origin/main`; Ubuntu CI passed on `4405c8b`. |
| Frontend CI | Same install, lint and build on Ubuntu, Windows and macOS. Ubuntu and macOS run all six Playwright projects; Windows runs `chromium` and `pixel`. Each OS reports independently. | On `origin/main`. `4405c8b`: Ubuntu 491 passed; macOS 3 failed, Windows 1 failed ([known failures](#known-failures--20-october-2026)). |
| Shared docs | Existing canonical docs describe final contracts, durable decisions and current task state. Follow [AGENTS.md](../AGENTS.md) for documentation and completion rules. | Backend stack decisions recorded 11 October 2026. |

### Latest verification

Homepage, 9 October 2026: the locked install, `npm run lint`, `npm run build` and `CI=true PLAYWRIGHT_CHANNEL=chrome npm test` passed from the original checkout under Node 25.2.1 on Windows. All 8 tests passed. Coverage includes 18 widths from 320 to 3840px, 44px header targets, local assets, phone sources at pixel ratios 1/2/3, filters, keyboard menus, repeated/direct/refresh/back navigation, native rails/final-card access, reduced motion, canvas lifecycle and emulated touch. The test preview rejects an occupied port. Phone, desktop and large-screen captures were reviewed.

Production preview, 9 October 2026: Chrome decoded all 35 local WebPs and verified the favicon and filter isolation. No console/page errors, failed asset requests or external requests occurred.

CI configuration, 9 October 2026: YAML/matrix assertions and `CI=true npm test -- --list` passed; all 8 tests are discovered. GitHub runner execution is pending.

Publication checks, 9 October 2026: source/asset references, local doc links/anchors, contract checks and whitespace checks pass. The staging groups include every intended file once. Generated output, local agent/editor files, logs and environment secrets are ignored; required source, assets, licenses, lockfile, configs and docs remain stageable. No private-key/token patterns or personal paths were found in those candidates. Text uses LF; WebP/ICO files remain binary. The index is empty.

Limits: installed desktop Chrome only; touch was emulated. No physical-device, Safari/Firefox, screen-reader, LCP, capacity, backend or production-host verification is recorded. Test commands are in [local-development.md](local-development.md). Required unfinished checks stay visible until resolved.

### Current task claims

Use one row per active task: owner, scope/files, dependencies, state and branch/PR. Replace it with a concise final result and checks when finished. Record the confirmed remote commit/PR before marking the feature shared and complete. Remove finished edit claims; do not retain per-agent execution logs.

| Owner | Scope / files | Dependencies | State | Branch / PR |
| --- | --- | --- | --- | --- |
| Arnav | Super Admin-only cascading deletes (`backend/src/routes/manage.js` `deleteMatchRows`, `dropHomeCards`; `validate.js` `matchFlags`; `rooms.js` `removeCards`; `TournamentOverviewView.jsx`, `MatchesView.jsx`, `MatchEditorView.jsx`, `manage.js` `deleteMatchDialog`), no self-delete for Match Scorers (`routes/me.js`, `AccountPages.jsx`, `PrivacyPage.jsx`), one scoring device with discard on takeover (`ScoreConsole.jsx`, `queueStore.js` `deleteActions`), uncached public tournament reads (`routes/public.js`). No schema change | Confirmed by Arnav, 24 October 2026 ([memory](memory.md#deletes-scorer-accounts-and-one-scoring-device--24-october-2026)) | Locally verified 24 October 2026: lint, build, backend database suite (all files pass; `test-engine.property.spec.js` and `authz-matrix.spec.js` pass alone after the Windows pool `bad port` start error), `npm test -- --project=chromium --project=pixel`. Release-matrix projects run at the next release PR | `develop`, then release PR to `main` |
| Arnav | Staff-only sign-in and Sign out: `RejectViewer` in `frontend/src/features/auth/AuthArea.jsx` (Viewer on `/start`, `/sign-in` or a staff screen is signed out to `/sign-in?no-access`), notice in `SignInChoiceView.jsx`, Sign out button in `StaffShell.jsx`, `tests/sign-in-choice.spec.js`, `tests/staff-shell.spec.js`, Clerk stub `signOut` in `tests/helpers.js`. No database, role or match change | Confirmed by Arnav, 24 October 2026 ([memory](memory.md#staff-only-sign-in--24-october-2026)) | Locally verified 24 October 2026: lint, build, `npm test -- --project=chromium --project=pixel` 561 passed. Release-matrix projects run at the next release PR | `develop`, then release PR to `main` |
| Arnav | Integrate real operator scoring from `matchscorer-scoring` into `develop`: shared sport calculations, API transactions/DTOs, scoring UI, live/completed cards, tests and canonical docs | Confirmed 20 October format controls, operator final lock and current-day eligibility (replaced by the START rule on 21 October 2026) in rules/memory; preserve auth, assignment, lease and queue | CI verified on head `9ca68b3` (2026-10-20, `pull_request` runs): Backend checks `backend` passed, 221 of 221 tests (34 files) with `REQUIRE_DB=1` on Postgres 18 ([run](https://github.com/campuscores/campuscores/actions/runs/39459678721)). Frontend checks ([run](https://github.com/campuscores/campuscores/actions/runs/39459678727)): `homepage (ubuntu-latest)` passed, 604 passed, 28 skipped, 1 flaky; `homepage (macos-latest)` passed, 605 passed, 28 skipped; `homepage (windows-latest)` passed, `chromium` + `pixel` 211 passed. The Ubuntu flaky case is `[firefox] operator-console.spec.js:158` keyboard-only flow: the first attempt failed with "Tab never reached the control" and the retry passed (known failure 5, F6). Released 20 October 2026. PR #2 merged into `develop` as `10a4b34`. Staging Deploy ([run](https://github.com/campuscores/campuscores/actions/runs/39464503374)) passed every step, smoke 4 of 4. A `playwright-cli` check of staging at 390 and 1440 px passed (signed out, Chromium; no live or final card, because the staging seed has no published action). Backend and Frontend checks passed on `10a4b34` on Ubuntu, macOS and Windows. PR #3 merged `develop` into `main` as `1435628` (same tree as `10a4b34`). Production Deploy ([run](https://github.com/campuscores/campuscores/actions/runs/39470371624), attempt 2, reviewer approved) passed every step: backend 221 of 221, `chromium` + `pixel` 211 passed, production `dbmate up` with no pending migration, build, `wrangler deploy --env production`, smoke 4 of 4. Attempt 1 failed on [known failure 8](#known-failures--20-october-2026) before any production step. Deferred rows 1–6 are cleared; rows 7–8 stay open ([deferred-tests.md](deferred-tests.md)). The homepage rail test runs one case per width with a 15 s assertion budget; traces record on the first retry only. Windows CI no longer runs Firefox; option D is deferred until Arnav's command ([memory](memory.md#public-repository-and-ci--20-october-2026)). Gaps: the Windows Firefox stall cause is unproven; no physical-device check; live and final cards not checked against deployed data. Acceptance covers formats, derived winners, undo/final lock, queue/reload, permissions, public delivery and phone/keyboard access | [PR #2](https://github.com/campuscores/campuscores/pull/2) → `develop` (`10a4b34`); [PR #3](https://github.com/campuscores/campuscores/pull/3) → `main` (`1435628`) |
| Arnav | Public repository release: visibility, GitHub security settings, backup workflow, docs | Readiness check found no secret in history, refs or Actions logs | Applied 20 October 2026 and confirmed by API read: repository public; secret scanning, push protection and Dependabot alerts on; rulesets now `protect-main` and `protect-develop` (see the CI-on-release row); Environment `production` reviewer `arnavbhatia2003`; fork pull request workflows need approval for all external contributors; `backup.yml` disabled and its artifact deleted. Decisions: no license, public commit emails accepted, fixture names invented, images left as they are. Deferred until Arnav's explicit command, not started by any team member or agent otherwise: option D and R2 backups with `backup.yml` re-enabled (F12) ([memory](memory.md#public-repository-and-ci--20-october-2026)) | `integration/matchscorer-scoring`, [PR #2](https://github.com/campuscores/campuscores/pull/2) |
| Arnav | CI on release only: `frontend.yml` and `backend.yml` triggers, GitHub rulesets, development-flow docs | Confirmed by Arnav, 20 October 2026 ([memory](memory.md#public-repository-and-ci--20-october-2026)) | Applied 20 October 2026. Rulesets confirmed by API read: `protect-main` (25489363) on `main`: pull request required, no force push, no deletion; `protect-develop` (25499533) on `develop`: no force push, no deletion, direct pushes allowed; no bypass actors. Environment `production` reviewer unchanged. `frontend.yml` and `backend.yml` run only on pull requests to `main` and on manual dispatch; `deploy.yml` is unchanged. Local check: `npm run lint` passed, workflow YAML parsed. Open: [deferred row 9](deferred-tests.md) until the next release pull request | `develop` (direct push) |
| Arnav | Privacy contact on `/privacy`; score console retries HTTP 429 with backoff (`ScoreConsole.jsx`); rate-limit decision; F8, F9, F12 and F13 records | Confirmed by Arnav, 21 October 2026 ([memory](memory.md#backend-open-items) items 3, 4) | Implemented, not verified. Local, Windows, Node 25.2.1: `npm run lint` and `npm run build` passed; `auth-pages.spec.js` and `operator-console.spec.js` on `chromium`, `firefox` and `pixel`: 27 passed, 1 flaky ([known failure 5](#known-failures--20-october-2026)). Open: [deferred row 9](deferred-tests.md) | `develop` (direct push) |
| Arnav | Cross-browser, phone-emulation and edge-case tests: `frontend/playwright.config.js` (six projects), `tests/sport-edge-cases.spec.js`, `tests/mobile.spec.js`, `tests/helpers.js`, small edits to `tests/homepage.spec.js`, `.github/workflows/frontend.yml`, two CSS fixes (`SportPage.css`, `HorizontalRail.css`) and docs | The sport-pages change | Locally verified (all six projects; WebKit needed side-loaded libraries, see below); frontend CI on `4405c8b`: Ubuntu passed; macOS and Windows have [known failures](#known-failures--20-october-2026) 2–5 | `origin/main`, `dfe54f5`; no PR |
| Arnav | Sport pages for all six sports: `frontend/src/features/sports/*`, `App.jsx` (sport routes), `global.css` (section container selector), `tests/sport-pages.spec.js` (replaces `badminton.spec.js`), `tests/homepage.spec.js` (sport routes built), README and docs | None. Formats stay open in `rules.md`; fixtures are display only. Open items in `memory.md`: ended-match label, detail URL. | Locally verified; frontend CI on `4405c8b`: Ubuntu passed; macOS and Windows have [known failures](#known-failures--20-october-2026) 2–5 | `origin/main`, `dfe54f5`; no PR |
| Arnav | Backend live platform, spec tasks 1–16 (`backend/`, `db/`, backend workflows, live client, operator console, sign-in and privacy pages) | — | Published and deployed; see [Backend live platform](#backend-live-platform--published-20-october-2026). Follow-ups: [Follow-up tasks](#follow-up-tasks) | `origin/main` and `origin/develop`, `4405c8b`; no PR |
| Arnav | Match Operator "My Matches" dashboard, frontend only: `frontend/src/features/operator/{MyMatchesPage.jsx,OperatorMatchCard.jsx,operatorMatches.js,MyMatches.css}`, `App.jsx` (`/operator/matches` + reserved `/operator/matches/:matchId/score`), `SiteHeader.jsx` (My Matches nav tab, desktop + mobile; removed on 22 October 2026 by change 5), `tests/operator-matches.spec.js`, docs. Shows only this scorer's assigned matches in Live (Continue scoring) / Scheduled (Start scoring, date-filtered) / Completed (View, read-only) sections. Reuses `SiteHeader`, `HorizontalRail`, date chips, `SportIcon`, card shell and design tokens. No auth, no login indicator, no backend. | Scoring console page is a later pass (shared admin + scorer). Match formats stay admin-decided and open in `rules.md`; `operatorMatches.js` reuses existing sport display fixtures. | Locally verified on `matchscorer`; now wired to `GET /api/operator/matches` by the backend live platform (fixture `operatorMatches.js` kept only for the section map tests); frontend CI on `4405c8b`: Ubuntu passed; macOS and Windows have [known failures](#known-failures--20-october-2026) 2–5 | `matchscorer` `6a0517e`, merged into `develop`; no PR |
| Arnav | Staff roles and manager console (spec `staff-roles-manager-console`, changes 1–10): tournament ownership and sport scope, the Manager_Console, the Admin_Console, tournament statuses, Regular_Matches, the START rule, the Event_Time_Zone and the public tournament pages. Backend: `db/migrations/20261022090000_manager_scope.sql`, `db/seed/fake.sql`, `backend/src/{scope,validate,db,scoring,http}.js`, `backend/src/routes/{manage,admin,accounts,invites,assignments,me,public,actions}.js`, `shared/time.mjs`. Frontend: `main.jsx`, `app/App.jsx`, `components/SiteHeader.jsx`, `features/{auth,staff,manage,admin,operator,tournaments,sports,home}/`. Tests: new backend specs (`manage`, `admin`, `lock-order`, `scope.property`, `validate.property`, `time.property`, `public-dto.property`, `event-time-zone`) and new frontend specs (`sign-in-choice`, `staff-shell`, `staff-layout`, `manage-setup`, `manage-matches`, `manage-assign`, `admin`, `public-tournaments`, `staff-helpers.property`, `venues`), plus updates to existing specs. Docs: all canonical docs. Contract: [architecture.md](architecture.md#staff-roles-and-manager-console); decisions and open items: [memory.md](memory.md#staff-roles-and-manager-console--decisions) | Layout_Approval: Arnav, 21 October 2026, commit `27db57d` ([memory](memory.md#stage-1-layout-approval--21-october-2026)) | **Published to `develop`, staging deployed; not Verified.** Each `deploy.yml` staging run passed every step (lint, backend database tests, `chromium` + `pixel`, migrations, seed, build, deploy, smoke 4 of 4): [39712894247](https://github.com/campuscores/campuscores/actions/runs/39712894247) on `b2194d5` (backend, 22 October 2026; applied the `20261022090000_manager_scope.sql` migration to staging Neon), [39744812832](https://github.com/campuscores/campuscores/actions/runs/39744812832) on `a2c8950` (manager screens; 5 dialog cases flaky on Ubuntu), [39772316628](https://github.com/campuscores/campuscores/actions/runs/39772316628) on `86f52b3` (scorers and START; 0 flaky), [39795156377](https://github.com/campuscores/campuscores/actions/runs/39795156377) on `9b10637` (public pages; 0 flaky) and [39869511703](https://github.com/campuscores/campuscores/actions/runs/39869511703) on `cdaf4f5` (Super Admin; backend 366 of 366, 41 files; `chromium` + `pixel` 554 passed, 0 flaky). Local, Windows, Node 25.2.1, on the final Super Admin code: `npm run lint`, `npm run lint:backend` and `npm run build` passed; `npm run test:backend` with `REQUIRE_DB=1` against Postgres 18 (migrations and fake seed) passed 366 of 366 in two consecutive runs, including the concurrent `LAST_SUPER_ADMIN` race; `npm test`: `chromium` 390, `pixel` 164 and `firefox` 350 passed (18 skipped). A `playwright-cli` review (Chromium; mocked API, stub Clerk) of every staff screen and the public tournament pages at 390 and 1440 px found one `h1`, no page or dialog overflow, no target under 44×44 px, one Primary_Action per screen (none on the read-only Live match editor and in the danger dialog), no "custom" text and no error code. Spec task 22.1 removed the Stage 1 layout preview (its feature folder, browser spec, routes and build flag in `App.jsx`, `deploy.yml` and `playwright.config.js`). Release checkpoint (spec task 23), local, Windows, Node 25.2.1, 23 October 2026, on the 22.1 code: `npm run lint`, `npm run lint:backend` and `npm run build` passed; `npm test`: `chromium` + `pixel` 548 passed, `firefox` 347 passed (18 skipped); `webkit`, `iphone` and `ipad` failed through the known Windows DPI/viewport mismatch (not evidence); backend with `REQUIRE_DB=1` against Postgres 18 passed 366 of 366 in two consecutive runs (an earlier run timed out once at 30 s in the `admin.spec.js` 51-row paging case under machine load). A `playwright-cli` smoke review (Chromium; mocked API, stub Clerk) of Home, the Badminton sport page, Tournaments, a Tournament sport page, My Matches, Manager home and Admin home at 390 and 1440 px found one `h1`, no page overflow, no page error, no error code and no "custom" text. Staging `deploy.yml` [39894156083](https://github.com/campuscores/campuscores/actions/runs/39894156083) on `b0d91fe` passed every step (lint, backend database tests, `chromium` + `pixel`, migrations, seed, build, deploy, smoke). Not Verified: deferred rows 9 (full frontend matrix and `backend.yml` on the release pull request, including the [Ubuntu WebKit Tab risk](deferred-tests.md#risk-for-the-release-pull-request)), 10 (staff layout widths on Firefox and WebKit) and 11 (physical devices) in [deferred-tests.md](deferred-tests.md). Gaps: local Windows `webkit`, `iphone` and `ipad` fail through the known DPI/viewport mismatch; the 5 Ubuntu dialog flakes of the manager-screens run did not recur in later runs, which supports the `ConfirmDialog` late-close fix but does not prove it; no physical-device check; staging has no real staff accounts until F11. Open items for Arnav: [memory.md](memory.md#open-items-for-arnav) | `develop` (direct pushes), from `569015b` to `bb7f19b`: code `569015b` (layout preview, later removed), `fb96c09`, `b2194d5`, `7521949`, `db8e038`, `a2c8950`, `47694ac`, `42386c1`, `f66a195`; records `edc0597`, `27db57d`, `3ef191c`, `f7bdf6e`, `d29913d`, `4b6369f`, `86f52b3`, `be573a2`, `9b10637`, `98de4f2`, `cdaf4f5`, `bb7f19b`; 22.1 code `41609bc`, docs `b0d91fe` and this record. Release pull request `develop` → `main`: **Blocked** (23 October 2026). The repository token on the release machine cannot create a pull request or dispatch a workflow (GitHub API 403 "Resource not accessible by personal access token"), so `frontend.yml` and `backend.yml` have not run. Arnav opens the pull request, or grants that token Pull requests and Actions write access |
| Arnav | Production release of staff roles and manager console, with the scorer lease notice and release on leave, college year 1st–4th (migration `20261023090000_team_college_year.sql`), header logo, image skeletons, the Thaparlympics 2026 image, and the event seed (`backend/scripts/seed-thaparlympics-2026.js`, `.github/workflows/seed-event.yml`) | Production release authorized by Arnav, 23 October 2026 | Released to production; WebKit/Safari CI and physical-device checks pending; not Verified. Local, Windows, 23 October 2026, on `7793d5a`: `npm run lint`, `npm run lint:backend` and `npm run build` passed; backend vitest with the test database: 367 passed; `npm test` on `chromium` + `pixel`: 556 passed. Event seed on the test database: 1 tournament, 6 sports, 36 teams, 36 matches; a second run created 0. Staging Deploy ([run 39936390933](https://github.com/campuscores/campuscores/actions/runs/39936390933)) passed. Release PR #6 merged into `main` as `0d64f79`; production Deploy ([run 39938470146](https://github.com/campuscores/campuscores/actions/runs/39938470146)) passed migration, deploy and smoke. Production seed ([run 39940683616](https://github.com/campuscores/campuscores/actions/runs/39940683616)) created 1 tournament, 6 sports, 36 teams and 36 matches. Public API and a `playwright-cli` check (Chromium, signed out, 390 and 1440 px) show THAPARLYMPICS 2026 with the new image, 6 sports and 36 matches at the IST times. Pending: WebKit/Safari/iPhone/iPad CI fixes on the release matrix, physical-device checks ([deferred-tests.md](deferred-tests.md)). | `main` `0d64f79`, PR #6 |
| Arnav | Campuscores document titles and header landmark labels, the logo as the first tab icon (`favicon.ico` stays the fallback), and seed date options: `SEED_START_DATE` (India_Time day 1; ends on day 1 + 2), `SEED_UPDATE_DATES` and an optional owner Clerk ID, also as `seed-event.yml` inputs. With a start date, a seeded pairing that exists at any time is skipped, and the run refuses when a match falls outside the dates. Files: `frontend/index.html`, `App.jsx`, `SiteHeader.jsx`, `StaffShell.jsx`, title tests, `backend/scripts/seed-thaparlympics-2026.js`, `backend/test/node/assets.spec.js`, `.github/workflows/seed-event.yml` | Production release authorized by Arnav, 23 October 2026. Cause of "No tournaments are live": production `starts_on` was still 2026-10-24, so the phase was correctly `upcoming` on 23 October | Released to production; WebKit/Safari CI and physical-device checks pending; not Verified. Local, Windows, 23 October 2026: `npm run lint`, `npm run lint:backend` and `npm run build` passed; `chromium` + `pixel` 556 passed; backend `test/node` 68 passed; seed fresh run, rerun and date update checked against local Postgres 18. Staging `deploy.yml` [39945332275](https://github.com/campuscores/campuscores/actions/runs/39945332275) and production [39946604840](https://github.com/campuscores/campuscores/actions/runs/39946604840) passed every step. Seeds with start 2026-10-23 and update dates: staging [39946326568](https://github.com/campuscores/campuscores/actions/runs/39946326568) (owner `test_super_admin`; created 1 tournament, 6 sports, 36 teams, 36 matches on 23–24 October), production [39947361631](https://github.com/campuscores/campuscores/actions/runs/39947361631) (dates set to 23–25 October; 36 matches unchanged on 24–25 October). Both APIs show THAPARLYMPICS 2026 `live` | `develop` `74d60e2`; PR [#7](https://github.com/campuscores/campuscores/pull/7) merged into `main` as `17ddfe1` |

### Scoring integration verification — 20 October 2026

Local checks: `npm run lint`, `npm run lint:backend`, `npm run build` and the staging Wrangler dry-run passed. Backend local suite: 126 passed, 94 database cases skipped. GitHub CI on `8eca8ad`: all 220 passed against temporary Postgres 18 with REQUIRE_DB=1 ([run](https://github.com/campuscores/campuscores/actions/runs/39390450293)). The final shared rule suite has 29 passing cases, including blocked football tie resolution. The shared format suite covers six presets, custom formats, deuce/caps/deciding sets, tennis advantage/tie-break service, period totals, invalid actions, undo and final lock. Connected browser coverage includes all six sports, format freeze, early set winners, final retry/reload, cards/substitutions, offline queue, public live/final cards and India dates. The complete local Windows browser set on `8eca8ad` passed 362, skipped 13. Final Chromium/Firefox checks passed 28, including each independent click/refresh/Back journey, repeated Home scroll and blocked football tie resolution. Repeated Home and dialog keyboard checks passed all 48 Chromium/Firefox cases across three repeats after waiting for menu and dialog close state. Phone/desktop score and format captures were reviewed; the UI detector reported no findings.

The complete frontend matrix remains required in CI. Windows WebKit has a local viewport/DPI mismatch; the existing CI policy runs WebKit on Ubuntu/macOS instead. No physical-device, screen-reader, live deployment or load verification is claimed. New formats do not convert existing played Test_Engine matches. Management UI, bracket advancement, standings, football shoot-outs and exceptional whole-match awards remain separate/Open as recorded in rules/memory.

## Backend live platform — published 20 October 2026

Scope: backend live platform plan, spec tasks 1–16 (the plan file is local and not in Git). State: **Published and deployed**, with the known failures below. Commit `4405c8b` is on `origin/main` and `origin/develop` (fast-forward). Staging: `https://thaparlympics-staging.bhatiaarnav05.workers.dev`. Production: `https://campuscores.live`.

| Area | Source | Contract |
| --- | --- | --- |
| Worker, `/health`, errors, request ID | `backend/src/index.js`, `http.js` | [architecture.md](architecture.md#repository-structure) |
| Live rooms (`/live/home`, `/live/match:<id>`) | `backend/src/rooms.js` | [handoff.md](handoff.md#live-snapshot-to-card-contract) |
| Schema, fake seed (staging and CI only) | `db/migrations/` (4 files), `db/seed/fake.sql` | [architecture.md](architecture.md#database-hosting-and-migrations) |
| Public read API | `backend/src/routes/public.js` | [architecture.md](architecture.md#public-read-api) |
| Clerk sign-in, `GET`/`DELETE /api/me`, invites, account disable | `backend/src/auth.js`, `routes/me.js`, `invites.js`, `accounts.js` | [architecture.md](architecture.md#sign-in-setup) |
| Assignments, revoke, `GET /api/operator/matches`, leases, authorization chain | `backend/src/scoring.js`, `routes/assignments.js`, `leases.js` | [architecture.md](architecture.md#scoring-authorization-chain) |
| Score actions, Test_Engine (staging only), outbox sweep | `backend/src/routes/actions.js`, `engines/`, `outbox.js` | [architecture.md](architecture.md#live-updates-and-offline-scoring) |
| Homepage live row, Live_Client | `frontend/src/services/live.js`, `api.js`, `features/matches/liveCards.js` | [handoff.md](handoff.md#live-snapshot-to-card-contract) |
| My Matches and score console with offline queue | `frontend/src/features/operator/` | [handoff.md](handoff.md#integration-points) |
| Sign-in, sign-up, account, account delete, privacy | `frontend/src/features/auth/`, `features/legal/PrivacyPage.jsx` | [handoff.md](handoff.md#integration-points) |
| CI, deploy, nightly backup, Super Admin bootstrap, smoke check | `.github/workflows/backend.yml`, `deploy.yml`, `backup.yml`, `bootstrap.yml`; `backend/scripts/` | [architecture.md](architecture.md#database-hosting-and-migrations) |

Verification, 19–20 October 2026 (spec task 16):

- `npm run lint`, `npm run lint:backend` and `npm run build` passed.
- `REQUIRE_DB=1 npm run test:backend`: 179 of 179 (32 files) passed on a throwaway Postgres 18 with all `dbmate` migrations and `db/seed/fake.sql`.
- Frontend, local Linux: Chromium, Firefox and Pixel 0 failures. WebKit, iPhone and iPad in Docker `mcr.microsoft.com/playwright:v1.64.0-noble`: 173 passed, 15 skipped, 0 failed.
- GitHub Actions on `4405c8b`: Backend checks passed. Deploy `develop` → staging passed, smoke 4 of 4. Deploy `main` → production: migrations, build and `wrangler deploy` passed; the smoke step failed (known failure 1). A manual smoke run a minute later passed 4 of 4 (`/health`, `/api/tournaments`, `/live/home` first message, `/api/me` 401).
- Frontend checks on `4405c8b`: Ubuntu 491 passed, 0 failed (all six projects). macOS and Windows have failures (known failures 2–4).

Data state: production has no seed and no tournaments or matches, so its homepage live row is empty. Staging has the fake seed. Since the staff roles and manager console (on `develop` and staging, not on `main`), the tournament pages, the homepage tournament row and the `/sports/*` Upcoming and Past sections read the API when the build sets `VITE_API_BASE`; production still serves the 20 October build.

Limits: no physical-device or branded-Safari check; the load test ran only at small local scale ([Capacity results](#capacity-results-simulated-clients)); the nightly backup is disabled until F12.

### Known failures — 20 October 2026

| # | Failure | Cause | State |
| --- | --- | --- | --- |
| 1 | Deploy `main` → production smoke step: `GET /health: expected 200, got 522` | The step ran seconds before the `campuscores.live` route served the new Worker. The deploy itself succeeded; a manual smoke run passed. | Open; follow-up F5 |
| 2 | macOS `[chromium] homepage.spec.js:223` repeat Home and Tournaments navigation scrolls and closes phone menus | Scroll timing on macOS runners. Also fails on branch `matchscorer-scoring`, so it pre-dates this work. | Open; F6 |
| 3 | macOS `[iphone]` and `[ipad] mobile.spec.js:74` rails and date chips are native touch scroll containers | ArrowRight on a focused rail leaves `scrollLeft` 0 on emulated WebKit. Pre-dates this work. | Open; F6 |
| 4 | Windows `[firefox] homepage.spec.js:76` sport filters change only live cards and support keyboard input | Timeout waiting for 5 `.tournament-card`. Pre-dates this work. | Closed: Windows CI no longer runs Firefox |
| 5 | Flaky: macOS `[chromium] sport-pages.spec.js:218` Volleyball keyboard; Windows `[firefox] homepage.spec.js:107` DPR test (can hang to the 45 s timeout); Windows `[chromium]` sport-pages basketball keyboard and `live.spec.js` reconnect; Ubuntu `[firefox] auth-pages.spec.js:51` `networkidle` timeout (once); Ubuntu `[firefox] operator-console.spec.js:158` keyboard-only flow, "Tab never reached the control", passed on retry (`9ca68b3`); local Windows `[firefox] operator-console.spec.js:83` offline reload test, 3 posts instead of 2, passed on retry and 5 of 5 repeats (21 October 2026) | Runner timing. | Open; F6 |
| 6 | Local WebKit, iPhone and iPad projects do not launch | A Linux host lacked `libavif.so.16`. Fix: `sudo npx playwright install-deps webkit`. Windows and CI are not affected. | Local Linux only |
| 7 | Local Node v22.21.1 is below `engines` `>=22.22.0` | Machine setup. | Closed 21 October 2026: local Node is v25.2.1 |
| 8 | Flaky: `backend/test/public.spec.js` "returns the same body with or without an Authorization header": `/api/tournaments` gave 12 tournaments, then 13. Failed the production Deploy test gate on `1435628` (attempt 1); the re-run passed | `operator-scoring.spec.js` inserts a `PUBLISHED` tournament into the shared test database between the two `/api/tournaments` calls. | Fixed (F14): the list comparison uses only the tournaments in both responses |

Failures 2–5 are not deploy gates: the deploy workflow runs the Chromium and Pixel projects only.

### Follow-up tasks

| # | Task | Owner | State / blocker |
| --- | --- | --- | --- |
| F1 | Admin and manager screens for the built endpoints: invite (`POST /api/invites`), assign scorer (`POST /api/matches/:id/assignments`), revoke (`POST /api/assignments/:id/revoke`), disable account (`POST /api/accounts/:id/disable`) | Arnav | Done by the staff roles and manager console ([current task claims](#current-task-claims)); on `develop`, not Verified |
| F2 | Validated rosters (`roster_players`, `match_roster`), bracket advancement and standings | Engineering | Open; needs scope and claim. Tournament, team and match management and the public tournament pages are done by the staff roles and manager console |
| F3 | Real sport scoring with presets/custom formats and operator final lock | Arnav | Done: released to `main` as `1435628` (20 October 2026); see the scoring row in [current task claims](#current-task-claims) |
| F4 | Full 3,000-client load run on staging | Engineering | Blocked: needs the staging Super Admin (F11) and a test operator Clerk account with 4 `LIVE` assigned matches (user) |
| F5 | Make `backend/scripts/smoke.js` retry `/health` for about 30 s, or re-run the production job | Engineering | Open |
| F6 | Fix or stabilize the macOS and Windows frontend failures 2–5 | Engineering | Open |
| F7 | Set production Worker secrets `CLERK_SECRET_KEY` and `CLERK_JWT_KEY` (`npx wrangler secret put <NAME> --env production` from `backend/`) | User | Done, 21 October 2026 (confirmed by Arnav): a signed-in `GET /api/me` on `https://campuscores.live` returned 200 with the database role |
| F8 | Clerk production: custom Google OAuth client, consent screen privacy URL, Clerk DNS records DNS only ([architecture.md](architecture.md#sign-in-setup)) | User | Done, 21 October 2026 (confirmed by Arnav): Google app published (In production); the OAuth client "campuscores Production Login" redirect URI is the Clerk production callback; Clerk Production uses these custom credentials; the 5 Clerk CNAME records are DNS only; consent screen branding is set. On campus Wi-Fi, Google sign-in and email sign-up with a code work, and `accounts.campuscores.live` loads. Open risk: campus DNS filter ([memory.md](memory.md#backend-open-items) item 9) |
| F9 | Cloudflare: route fail-closed mode, usage notifications, WAF rate-limit rule ([architecture.md](architecture.md#rate-limiting-and-quota-failure)) | User | Done, 21 October 2026 (confirmed by Arnav): the production route `campuscores.live/*` is set to fail closed (staging uses `workers.dev` and has no route); rule `api-flood-guard` is applied: `/api/` or `/sign-up` paths, not `/live/`, per IP, 300 requests per 10 s, Block for 10 s (item 3, closed); account notifications "HTTP DDoS Attack Alert" and "Incident alert" are added. The Free plan has no Workers usage alert, so check Workers & Pages usage by hand on event days |
| F10 | Lower Neon autoscaling maximum from 2 CU to 0.5 CU on both projects | User | Open |
| F11 | Run "Bootstrap Super Admin" (`bootstrap.yml`) per environment with the Clerk `user_` ID | User | Production done, 21 October 2026 (confirmed by Arnav): the workflow ran for environment `production`; `GET /api/me` returns role `SUPER_ADMIN`, status `ACTIVE`. Staging: open. Do it before staff-flow tests on staging (admin screens, invites, assignments, load test F4): sign up on the staging site (Clerk development instance, different `user_` ID); in the browser console run `window.Clerk.user.id` to get the ID; then run **Bootstrap Super Admin** with branch `develop`, environment `staging` and that ID. On staging only, the check ignores the fake seed accounts (`clerk_user_id` starting `test_`); production and any other environment keep the strict rule ([architecture.md](architecture.md#database-hosting-and-migrations)). The staging rule is implemented, not verified: its database cases run in the deploy gate ([deferred-tests.md](deferred-tests.md) row 9) |
| F12 | Store backups in a private Cloudflare R2 bucket, then re-enable `backup.yml` with its own GitHub Environment (for example `production-backup`, `main` only). Keep a copy of `BACKUP_PASSPHRASE` outside GitHub | Arnav | Deferred: the backup stays disabled until R2 storage, on Arnav's explicit command. This supersedes the earlier "check the first nightly backup run" step. Keep the `BACKUP_PASSPHRASE` copy outside GitHub. Planned after the final feature, before launch. Launch blocker ([Current blockers](#current-blockers)) |
| F13 | Privacy policy owner and contact | User | Closed 21 October 2026: owner Arnav, contact `bhatiaarnav05@gmail.com` on `/privacy` (item 4) |
| F14 | Stabilize known failure 8. `public.spec.js` compares the `/api/tournaments` rows that both responses contain (seed tournament `1` must be one); the public-field check still covers the full body. Pull request into `develop` | Arnav | Fixed in `0a3f6f0`, [PR #4](https://github.com/campuscores/campuscores/pull/4) → `develop` (`9ae7dc3`). Backend checks passed 221 of 221 with `REQUIRE_DB=1` ([run](https://github.com/campuscores/campuscores/actions/runs/39476787480)); staging Deploy passed, smoke 4 of 4 ([run](https://github.com/campuscores/campuscores/actions/runs/39477066092)). Not yet on `main` |
| F15 | Header still shows "Sign in" to a signed-in user, because public pages load no Clerk code | Arnav | Open UX item; Arnav decides whether to change it |

Usage estimate and Workers Paid gate, 18 October 2026 (**user-confirmed inputs**). The Usage_Calculator is a local script outside Git. Cost model: each socket connect is 1 Worker + 1 DO request; each score action is 1 Worker request, 3 DO requests (`noteWrite`, `publish`, `publishCard`), about 5 DO row writes and about 6 Hyperdrive queries; each staff request is 1 Worker request and about 2 queries; each public `/api/*` read is 1 Worker request and 1 cached query; each sweep is 1 Worker + 1 DO request (queries counted as an upper bound). Static assets are not counted.

| Peak-day input (user-confirmed 18 October 2026) | Value |
| --- | --- |
| Viewers | 1,000 |
| Extra socket connects per viewer | 10 |
| Live matches | 12 |
| Score actions per match (incl. undo) | 200 |
| Staff API requests (besides score actions) | 2,000 |
| Public API reads per viewer | 10 |
| Outbox sweeps | 1,440 |

| Peak-day estimate | Result | Free cap |
| --- | --- | --- |
| Worker requests | 26,840 | 100,000 |
| DO requests | 19,640 | 100,000 |
| DO row writes | 12,000 | 100,000 |
| Hyperdrive queries | 29,840 | 100,000 |

Decision: Workers Free ($0). The gate (more than 70,000 Worker or DO requests/day) is not reached. No Workers Paid for Event_Months unless the inputs change ([memory.md](memory.md#backend-open-items) item 1, closed). Sensitivity: Worker requests grow by about 21 per viewer; 3,000 viewers with the same other inputs gives 68,840, near the gate.

Sport page checks, 9 October 2026, Linux, Node 22.21.1, installed Chrome 146: `npm run lint` and `npm run build` passed; `PLAYWRIGHT_CHANNEL=chrome npm test` passed all 73 tests (8 in `homepage.spec.js`, 65 in `sport-pages.spec.js`). Coverage: all six sport routes; three sections; header-only cards; fixture validity against the official baselines and the registry; one dialog per scoring model (badminton, tennis, table tennis, volleyball, football, basketball) with bold winners, red current period, serving dot, Pts and tiebreak, scorers and lineups; ended-match winner; date chips and the empty 12 Oct day; keyboard open, Escape and focus return; desktop backdrop close; no body overflow and 44px targets from 320 to 2560px; textures and icon colour; route entry, refresh and back; chip reset between sports; tournament routes stay blank. A production preview was checked with `playwright-cli` at phone 390×844 and desktop 1440×900: all six pages and one open live dialog for badminton, tennis, volleyball, football and basketball; no body, dialog or table overflow; sport textures loaded; no console errors. Captures stay local and are not committed. Limits: Chromium only; no Safari/Firefox, physical-device or screen-reader check; Back does not close the dialog; plain `npm test` needs the bundled Playwright Chromium, which is not installed on this machine ([local-development.md](local-development.md)).

My Matches dashboard checks, 11 October 2026 (the header "My Matches" tab checked here was removed on 22 October 2026, change 5), branch `matchscorer`, macOS, Node 24.11.1, installed Chrome. `npm run lint` and `npm run build` passed. `PLAYWRIGHT_CHANNEL=chrome npm test -- operator-matches.spec.js --project=chromium` passed all 7 tests: fixtures resolve to real assigned matches grouped by state; the page shows only Live/Scheduled/Completed with the assigned counts; each card links to `/operator/matches/<id>/score` with the correct action label (Continue scoring / Start scoring / View match) and sport label; scheduled date chips filter in place; the header "My Matches" tab navigates from the home page to the dashboard and gets `aria-current="page"`; layout has no body overflow and 44px actions from 320 to 2560px; the reserved scoring route renders blank. A production-preview visual check with Playwright (installed Chrome) confirmed the desktop nav reads Home/Tournaments/My Matches/Sports, and the dashboard sections read Live/Scheduled/Completed at phone 390×844 and desktop 1440×900 with no body overflow and no console errors; captures were local and not committed. Limits: Chromium/installed-Chrome only this run; no Safari/Firefox, physical-device or screen-reader check; mobile-emulation projects (`mobile.spec.js`) do not yet include an operator case; the shared scoring console is unbuilt. A pre-existing flaky failure (`homepage.spec.js` repeat-navigation scroll at height 600) reproduces on the clean baseline with my changes stashed, so it is an environment/browser issue (installed Chrome 146 scroll timing), not caused by this change, which only adds a nav link and renames a section. After the merge into `develop`, 18 October 2026, Linux: `npm run lint`, `npm run build`, `lint:backend` and `test:backend` (22 tests) passed; `npm test -- --project=firefox` passed 130, skipped 1, including the 7 operator tests. Other browser projects could not launch on this machine (same limit as Backend 1).

Cross-browser checks, 9 October 2026, Linux, Node 22.21.1, base `9a22720` plus uncommitted changes. `npm run lint` and `npm run build` passed. `PLAYWRIGHT_CHANNEL=chrome npm test` ran 417 tests: 413 passed, 4 skipped, 0 failed.

| Project | Browser | Passed | Skipped |
| --- | --- | --- | --- |
| `chromium` | Installed Chrome 146 | 124 | 0 |
| `firefox` | Playwright Firefox | 123 | 1 |
| `webkit` | Playwright WebKit | 123 | 1 |
| `pixel` | Installed Chrome 146, Pixel 7 emulation | 15 | 0 |
| `iphone` | Playwright WebKit, iPhone 15 emulation | 14 | 1 |
| `ipad` | Playwright WebKit, iPad (gen 11) emulation | 14 | 1 |

The four skips are touch-swipe tests. Playwright has touch-drag input only through Chromium CDP. WebKit did not launch on this machine at first: the host lacks `libavif16`. The fix is `sudo npx playwright install-deps webkit`. For this run, the library and its dependencies were unpacked outside the checkout without sudo and preloaded. CI installs them with `--with-deps`. Coverage added: empty Live section; single-match, empty and rapid date chips; chip state across dialog close by button, Escape and backdrop; 320px long names; one dialog, focus trap, focus return, scroll lock and restore; Back with the dialog open (pinned); trailing slashes, unknown sports, blank tournaments, refresh and history; reduced motion, console errors, failed and external requests; 200% and 400% zoom reflow; keyboard-only flow; tap, fullscreen and fitted landscape dialogs, 44px targets, native scroll containers, swipe on Pixel and the phone menu.

Fixes found by these tests: long side names overflowed 320px cards (`overflow-wrap: anywhere` on card side names in `SportPage.css`). WebKit snapped the last rail card under the end fade (`HorizontalRail.css` snaps the last card's end to the end padding; Chromium and Firefox positions are unchanged). The homepage rail test is marked slow on WebKit, because headless WebKit renders the 3840px rails about 3× slower.

CI matrix: Windows runs `chromium` and `pixel` only. Safari does not exist on Windows, and Playwright's Windows WebKit port is the least representative; Ubuntu and macOS cover WebKit and Firefox ([memory](memory.md)). CI results are pending until the change is pushed.

Limits: emulated devices only. No physical phone, branded Safari or screen-reader check. Use the manual checklist in [local-development.md](local-development.md#check-on-a-real-phone). Firefox has no phone emulation. WebKit touch swipe and system text size are manual checks only. On emulated iPhone and iPad, one ArrowRight press on a rail snaps back to the start; three presses scroll it. The homepage cards have no long-name test. The empty-cell `—` marks in the dialog keep their pending screen-reader fix. The LAN preview command was not started in this run.

## Backend manual prerequisites (user)

These are account and console steps, not coding tasks. Backend 1 needs none of them.

- [x] Claim a domain and move its DNS to Cloudflare (`campuscores.live`).
- [x] Create the Cloudflare account, the Neon staging and production projects (Postgres 18), and the Clerk development and production instances.
- [x] Create a Google OAuth client for Clerk production: "campuscores Production Login", confirmed 21 October 2026 (follow-up F8).
- [x] Create the `develop` branch.
- [x] Add the GitHub Environment secrets and variables for `staging` and `production` (both deploys ran). Production has `BACKUP_PASSPHRASE`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `DATABASE_URL`, `VITE_API_BASE` and `VITE_CLERK_PUBLISHABLE_KEY`.
- [ ] Remaining manual steps: follow-ups F10, F12 and the staging part of F11 in [Follow-up tasks](#follow-up-tasks).

Open backend decisions are listed in [memory.md](memory.md#backend-open-items).

## Phase 0 — Resolve implementation-blocking inputs

Phases 0–12 are the full product backlog; their checkboxes are not updated item by item. The [backend live platform](#backend-live-platform--published-20-october-2026) delivers the foundation, schema subset, sign-in and roles, assignments and leases, the score write path with the Test_Engine, live rooms, the offline operator console, backup and the load harness from phases 1–3, 5, 10, 11 and 12. Real scoring and operator final confirmation deliver phases 7 and 8. The staff roles and manager console delivers the tournament, sport, team and match setup and scorer assignment of phases 4 and 5 and the tournament pages of phase 9. Validated rosters (phase 5), the bracket (phase 6), standings and match detail pages (phase 9) are not started.

### Tournament and identity setup

- [ ] Confirm tournament name, dates/timezone, lifecycle/status labels, venue metadata, and whether multiple tournaments can be active concurrently.
- [ ] Confirm branch/year/division categories and team naming conventions.
- [x] Role model and invite rules decided: Super Admin creates managers/Super Admins; managers invite operators only; no sport-scoped roles.
- [x] Finalization policy: operator confirmation immediately publishes the final result and locks editing (20 October 2026).
- [x] Invitation email decided: Clerk sends invitation and verification email; no custom SMTP provider is needed.
- [ ] Decide whether invited emails must be Thapar addresses, and the account recovery policy.
- [x] Assign scorer sets no time window (21 October 2026, change 7).

### Sport formats and score configuration

- [ ] For each selected sport, record the tournament's actual format variants and configuration fields in `rules.md` before implementing its production scoring engine:
  - Football: team size, period duration, clock/stoppage handling, substitutions, cards, and tie resolution.
  - Volleyball: set count/target, win-by/cap, deciding set, lineup/rotation and substitution tracking.
  - Basketball: 5v5/3x3, period count/duration, clock/fouls/timeouts, overtime, and configured scoring values.
  - Table tennis: singles/doubles, points per game, win-by rule, games per match, service/end tracking, and optional team-tie format.
  - Lawn tennis: singles/doubles, advantage/no-ad, set count/format, tiebreak and final-set format.
  - Badminton: singles/doubles, games per match, target points, win-by/cap, and any alternate scoring.
- [ ] Specify which point/rule values a manager can change at tournament creation and which must remain fixed by the sport engine. Validate configurations so impossible combinations cannot be saved.
- [ ] Decide which match statistics and player contributions must be captured for each sport; avoid collecting unused events.
- [ ] Decide exceptional result rules for ties, abandonments, forfeits and walkovers. No post-final editing is authorized.
- [ ] Decide whether Regular_Match results count toward player statistics or standings. They are public (change 4) and never fill bracket slots.
- [ ] Decide standings columns, points, tie-break order, and treatment of pending/rejected matches and Regular_Matches.
- [ ] Confirm roster/team limits, player eligibility, match-day squad rules, and substitute movement after match start.

### Branding and delivery

- [ ] Keep the site-wide Thapar logo component/slot ready, but leave the real image unset until supplied. Then add the approved asset, source/usage note, responsive variants if needed, and verify aspect ratio/contrast on every layout.
- [x] Database and hosting plan decided: Neon Free and Cloudflare Workers Free, with Workers Paid in event months only if the measured gate requires it.
- [ ] Choose the production account owner, supported browsers and event-day support contact. Host (Cloudflare) and domain source (Student Pack) are decided.
- [x] Load-test pass thresholds agreed, 19 October 2026: see [Load-test pass thresholds](#load-test-pass-thresholds).

## Phase 1 — Repository foundation and shared contracts

- [ ] Inspect repository structure and existing README before adding packages; preserve existing files and user changes.
- [ ] Preserve the implemented React + Vite JavaScript frontend and root npm workspace. Add the `backend/` Worker workspace only for an agreed backend task; do not recreate the frontend.
- [ ] Add `db/migrations/` and a pinned `dbmate`. Do not require Docker or a local Postgres for development.
- [ ] Create staging and production Neon projects and Hyperdrive configs. Store each environment's database URL and Clerk keys as GitHub Environment secrets.
- [ ] Add a GitHub Actions CI workflow: start a throwaway Postgres on the runner, apply all migrations, run lint/tests, then discard it.
- [ ] Add a deploy workflow: `dbmate up` and `wrangler deploy` to staging on merge to `develop`, and to production on merge to `main`. No one applies migrations or deploys from a laptop.
- [ ] Preserve existing frontend scripts. Add needed backend/migration scripts when those features exist; update exact prerequisites and commands in `local-development.md`. Team devices require no local database.
- [ ] Keep local Worker secrets in ignored `.dev.vars`; document variable names only. Validate required bindings and secrets at startup and never expose server secrets to Vite/browser code.
- [ ] Add formatting/lint conventions, JSDoc expectations, test runner, and runtime schema validation library.
- [ ] Add API contract conventions: JSON errors (401/403/409 shapes), request correlation ID, pagination/filter syntax, date/time handling, and public/private DTO separation.
- [ ] Add `/health` and `/ready` endpoints; readiness must detect required DB connectivity without exposing secrets or internal diagnostics publicly.
- [ ] Add a small smoke test proving web build, API boot, health response, and test database connection in CI.

**Exit criteria:** a clean checkout can install, run, lint, test, and build using documented commands; CI applies migrations to a throwaway database; no secrets or TypeScript have been introduced and no local Postgres is required.

## Phase 2 — Database schema and migration foundation

- [ ] Document the migration policy: forward-only `dbmate` migrations in `db/migrations/`; never edit a hosted schema outside a CI migration. Migrations must apply cleanly in CI against an empty database.
- [ ] Create core tables and indexes:
  - `tournaments`: name, slug, dates/timezone, status, venue/description, created/updated metadata.
  - `sports`: stable keys and display labels for the six supported sports.
  - `tournament_sports`: enabled sport per tournament; sport-specific format config, scoring values, rules source/version, roster policy, standings policy, and config version.
  - `teams`: tournament-sport scope, branch/year/division, display label, active/archive state.
  - `roster_players`: sport-team-scoped display name, branch/year as needed, captain marker, optional jersey, active state.
  - `matches`: tournament sport, two sides, schedule/venue, `bracket` or `custom` origin, status, score/result projection, format-config snapshot/version.
  - `match_roster`: selected players and active/substitute state for a match.
  - `tournament_brackets` and `bracket_slots`: exactly two semifinal matches and one final per tournament sport; final participant slots reference the approved semifinal winner.
  - `admin_accounts`: Clerk user ID, `role` (`SUPER_ADMIN` | `TOURNAMENT_MANAGER` | `MATCH_OPERATOR`), `status` (`ACTIVE` | `DISABLED`), `invited_by`, timestamps. No sport or tournament scope column.
  - `match_operator_assignments`: `id`, `match_id`, `user_id`, `assigned_by`, `permission` (`'SCORE'` default, only value), nullable `valid_from`/`valid_until`, `status` (`ACTIVE` | `REVOKED`), `created_at`, `revoked_at`, `revoked_by`, `revoke_reason`.
  - `match_result_reviews`: retained legacy schema only; no new result-review endpoints.
  - `score_actions` (including linked reversal actions), `match_snapshots`, `player_match_stats`, `sport_standings`, `scorer_leases`, `admin_audit_log`, and `outbox_events`.
- [ ] Add foreign keys, check constraints, uniqueness rules, timestamps, status constraints, and indexes for tournament/sport/match public reads and for assignment lookups by `(match_id, user_id, status)`.
- [ ] Assignment constraints: check `valid_until > valid_from` when both are set; partial unique index on `match_id` where `status = 'ACTIVE'`; revoked rows require `revoked_at` and `revoked_by`.
- [ ] Preserve legacy review-table constraints without treating them as a current product workflow.
- [ ] Grant database access only to the Worker's role; no browser or public API connects to the database.
- [ ] Add constraints/tests preventing a Regular_Match from occupying a bracket slot and preventing the bracket from having extra semifinal/final slots.
- [ ] Ensure one team cannot be assigned to both sides of the same semifinal unless an explicitly approved special rule supports it.
- [ ] Store immutable-at-match-start format config snapshots so changing tournament defaults cannot reinterpret an in-progress match.
- [ ] Seed synthetic data in `db/seed/fake.sql` for CI and staging only. Clearly mark seeded users, teams, and scores as fake; never seed production.

**Exit criteria:** migrations build the schema from scratch in CI, constraints reject invalid bracket/match/assignment rows, and seeds create a tournament with multiple enabled sports, assigned operators, and live/final sample results.

## Phase 3 — Authentication, roles, match assignment authorization, and audit

- [ ] Configure Clerk: open sign-up, required email verification, the suspicious-sign-up challenge, Google as the only social provider, and allowed redirect URLs.
- [ ] Verify Clerk session tokens in the Worker with `@clerk/backend` and an `authorizedParties` allow-list. Keep the secret key on the Worker only.
- [ ] Load the `admin_accounts` row on every protected request; reject disabled or missing accounts with 403. Do not trust role or assignment data from token claims.
- [ ] Implement role middleware for non-scoring routes: manager-or-above for tournaments, sports, teams, matches and assignments; Super Admin only for manager/Super Admin account administration.
- [ ] Implement invite flows: Super Admin invites managers/Super Admins; managers invite operators only (server rejects any other role). Use the Clerk Invitations API server-side; audit every account change. Sign-up without an invitation stays a Viewer.
- [ ] Preserve the implemented scoring chain in `architecture.md`, including the START rule and live commands, account/assignment window, SCORE permission and device lease. Keep legacy rejected-state compatibility; add no new correction/review workflow.
- [ ] Never rely only on hidden UI buttons or room membership. Viewer sockets accept no commands.
- [ ] Implement audit helpers storing actor, action, entity, timestamp, request/correlation ID, before/after summary, and reason. Audit assignments, revocations, reassignments, self-assignments, reversals, match start and final confirmation.
- [ ] Add authorization tests (HTTP; viewer sockets are receive-only):
  - anonymous public GET allowed; anonymous mutation denied;
  - operator scoring an unassigned match → 403; before `valid_from` → 403; after `valid_until` → 403; revoked → 403 on the next command; submitted/approved match → 409; no lease → 409;
  - operator cannot reach tournament, team, match, user, or review routes;
  - manager cannot invite managers or Super Admins; manager can manage every tournament and sport;
  - disabled account denied.
  - rejected OPERATOR route permits the valid assigned scorer; rejected MANAGER route denies operators and permits only a valid self-assigned manager/Super Admin; missing, expired or revoked assignment and missing lease still fail;
  - manager takeover revokes the old assignment and creates the self-assignment in one audited transaction; finalized results remain locked.
- [ ] Redact tokens, credentials, and unnecessary player personal data from logs.

**Exit criteria:** permission tests cover every role, including a signed-in Viewer; revocation takes effect on the next request; no sport-scoped admin logic exists; every privileged mutation produces an auditable record.

## Phase 4 — Tournament creation and sports configuration

- [ ] Implement manager tournament create, edit, publish/archive, and status transitions with validation.
- [ ] At tournament creation, require selection of one or more supported sports; reject unknown/duplicate sports.
- [ ] Build a configuration wizard that opens a sport-specific settings form for every selected sport.
- [ ] Make configurable values explicit, typed, bounded, and versioned (for example points per scoring action, periods/sets/games, target score, win-by margin, cap, and tie resolution as appropriate to that sport).
- [ ] Provide a readable rules/config summary and confirmation before publishing; show defaults as proposed defaults, not as event-confirmed rules.
- [ ] Reject config edits that would invalidate a live match. For safe changes, increment config version and preserve existing match snapshots.
- [ ] Build tournament index/detail pages and sport sub-navigation based on the enabled-sport list; hide disabled sports.
- [ ] Add empty, draft, published, ongoing, completed, and archived states only where the lifecycle decision supports them.

**Exit criteria:** a manager can create a tournament, enable a subset of sports, set distinct sport formats/points, and see only those sports publicly; invalid configuration cannot be published; operators cannot reach these actions.

## Phase 5 — Teams, roster, match setup, and scorer assignment

- [ ] Implement teams per tournament sport, including branch/year/division values and duplicate detection.
- [ ] Implement roster create/edit/archive with display name, captain marker, optional jersey number, and agreed eligibility fields.
- [ ] Implement tile-based roster UI with keyboard/touch-accessible actions for available, match-active, and substitute states; drag-and-drop must not be the only interaction.
- [ ] Implement match-day squad selection and enforce configured roster/substitute constraints.
- [ ] Prevent destructive deletion of a player/team referenced by match history; use archived/inactive state instead.
- [ ] Implement scheduled match creation and Regular_Match creation outside the bracket. Require sport, teams/sides, format snapshot, match label/type, date/time/venue as applicable.
- [ ] Show a Regular_Match as "Match" in admin and public UI (never "custom"); guarantee no Regular_Match triggers bracket progression.
- [ ] Add match lifecycle transitions (`SCHEDULED → LIVE → APPROVED/FINAL`) with server-side validation.
- [ ] Add duplicate fixture warnings, unavailable-team validation, missing roster warnings, and schedule overlap warnings without blocking intentional overlaps across sports.
- [ ] Implement assignment API and Assign Scorer UI: assign by email (inviting new operators), optional window, revoke with reason, reassign as revoke + insert in one transaction, and "assign myself" for managers. Audit each action.
- [ ] Implement scorer lease acquisition/release/takeover for the assigned user's device; a second device sees "scoring active on another device".
- [ ] Implement the operator "My Matches" page listing only matches with an active assignment, and the operator scoring route.

**Exit criteria:** managers can set up teams/rosters, create matches, and assign/revoke/reassign scorers; operators see only their matches; invalid lifecycle transitions are rejected.

## Phase 6 — Fixed semifinal/final bracket

- [ ] Implement bracket setup per tournament sport with exactly semifinal A, semifinal B, and final.
- [ ] Allow a manager to assign four eligible teams to semifinal sides and preview the full bracket before publishing.
- [ ] Prevent duplicate/missing team assignments; support an explicit TBD slot only if organizer confirms byes/late assignment are needed.
- [ ] Create the two semifinal match records and the final with participant slots linked to semifinal winners.
- [ ] Keep final slots unresolved until the corresponding semifinal result is approved; a merely live or submitted result must not advance a team.
- [ ] On semifinal approval, transactionally set the corresponding final participant and write an audit/outbox event.
- [ ] Resolve downstream bracket conflicts through a separately agreed policy; never modify a finalized result or silently swap live final participants.
- [ ] Lock bracket team assignment once a semifinal starts. Exceptional cases need an agreed policy; final score editing remains locked.
- [ ] Build accessible bracket UI for public and admin, including empty, scheduled, live and final states.

**Exit criteria:** only the approved winner of each semifinal fills the final; the bracket contains no other rounds and Regular_Matches remain outside it.

## Phase 7 — Sport scoring engines and configurable point systems

Implemented on the current integration branch; verification/publication is recorded in the current task claim. The authoritative format and event scope is [rules.md](rules.md#10-accepted-scoring-feature-and-limits).

- Shared pure calculations in `shared/scoring.mjs` validate frozen formats and replay accepted actions for six sports.
- Backend commands preserve authorization, lease, idempotency, sequence and atomic action/snapshot/audit/outbox writes.
- Phone-first operator controls select presets/custom formats, record team points, end sets early with an explicit winner, undo live mistakes and show pending actions separately.
- Football cards/substitutions and basketball fouls/substitutions use public display text. No running clock or individual goal/basket attribution.
- Coaches' roster, disciplinary and exceptional-outcome policies remain separate. Management UI, bracket advancement, standings and player statistics are unbuilt.

## Phase 8 — Operator final confirmation

Implemented on the current integration branch, replacing the earlier manager-review proposal.

- A computed winner stays provisional until the assigned operator confirms it.
- FINALIZE saves final status/snapshot, audit and outbox atomically. It publishes immediately after acceptance and locks all later edits.
- Exact lost-response retries return the original acceptance after current permission checks. No reopening, reviewer, rejection or self-approval override endpoint is authorized.
- Final results remain visible on public homepage/sport cards and read-only operator routes.

**Exit criteria:** applicable local and CI checks pass, including database transaction/concurrency tests, final retry/lock, offline recovery and public visibility; record the pushed revision and branch before marking shared verification complete.

## Phase 9 — Public spectator experience

- [ ] Build public tournament index with status/date and live/upcoming/recent match summaries.
- [ ] Build tournament detail with enabled sports, bracket summary, and tournament matches.
- [ ] Build one page per enabled sport with match filters, Regular_Match labeling ("Match"), bracket, and configured standings.
- [ ] Build match detail with sport-specific scorecard, provisional/final status, timeline and approved display events.
- [ ] Ensure pending/rejected result states are unambiguous and never styled as final.
- [ ] Keep player data to approved display fields; no personal profiles or login in this release. Never expose operator identities or assignments publicly.
- [ ] Add responsive mobile viewing, keyboard navigation, accessible labels, contrast, loading/empty/error states, and freshness/reconnecting indicator.
- [ ] Add site-wide brand header/footer/logo component with a replaceable official-logo asset path; before the file is supplied, use a neutral text placeholder and do not invent a Thapar mark.
- [ ] Serve immutable built assets from CDN where hosting permits; set correct cache/revalidation policy for live snapshots.

**Exit criteria:** a spectator can navigate tournament-first on desktop/mobile and distinguish live provisional scores from approved finals.

## Phase 10 — Realtime delivery and offline scoring

- [ ] Connect viewers to the relevant match room or the `home` room; the room sends its stored snapshot first.
- [ ] Keep room subscriptions narrow and public payloads free of account, assignment, and audit detail.
- [ ] Publish committed changes from PostgreSQL outbox only; include event ID, sequence, schema version, and timestamp.
- [ ] Make clients deduplicate old events, detect sequence gaps, fetch a fresh snapshot, and recover after reconnect.
- [ ] Add visible realtime connected/stale/reconnecting states and low-frequency snapshot fallback.
- [ ] Let the operator download the assigned match snapshot; persist scorer actions to IndexedDB before showing local queued acknowledgement; distinguish local queue from published score.
- [ ] Sync actions sequentially per match with same idempotency key on retry; validate each against the assignment by server receipt time.
- [ ] Pause sync on expiry, revocation, sequence/config/final-lock conflicts; surface the paused state to the operator and the conflict to managers, who can extend the window or resolve.
- [ ] Test network loss, browser refresh/restart, duplicate delivery, stale client, action rejection, sync after `valid_until`, and sync after revocation; document storage quota/device-loss limitations.
- [ ] Verify score updates, final confirmations, and future bracket/standings changes all propagate consistently to active spectators.

**Exit criteria:** connected clients converge on the authoritative approved state; offline retries do not duplicate score actions, bypass assignment checks, or falsely mark results finalized.

## Phase 11 — Quality, security, and operational readiness

- [ ] Add unit tests for all six configured score engines and bracket/result state transitions.
- [ ] Add integration tests (in CI against the throwaway Postgres) for DB constraints, transactions, per-role authorization, assignment validity, final lock, idempotency, outbox retries, and projection rebuild.
- [ ] Add browser tests for tournament create, sport config, roster/match setup, scorer assignment/revocation, operator My Matches, scoring and undo, final confirmation, public updates, mobile layouts, and offline recovery.
- [ ] Add security checks for public data minimization, database access through the Worker only, admin/operator route protection, input validation, CORS/origin, rate limits, secret handling, and log redaction.
- [ ] Add backup/restore rehearsal (nightly encrypted `pg_dump` from CI), health checks, structured logs, error reporting, and an event-day runbook (check Workers usage and the paid gate, verify migrations deployed, verify Clerk sign-in).
- [ ] Confirm all domain statuses have accessible text/icon labels and do not depend on color alone.
- [ ] Confirm logo integration once asset arrives: header, tournament, sport, match, admin, operator, mobile; no distortion and appropriate contrast.

## Phase 12 — Capacity demo and honest reporting

### Load-test pass thresholds

User-confirmed, 19 October 2026, before any run ([memory.md](memory.md#backend-open-items) item 5). This list is authoritative; other docs link here. All clients are simulated.

- Ramp: 0 → 3,000 simulated clients over 5 minutes, then hold for 10 minutes.
- Room distribution: every client subscribes to `home`; 4 match rooms have 500 clients each.
- Update rate: 1 publish per room every 2 seconds.
- Reconnect burst: drop 1,000 clients and reconnect them within 10 seconds.
- Pass: at least 99% of connects succeed; publish-to-receive latency p95 ≤ 1 s and p99 ≤ 2 s; 0 duplicate `seq`; at most 0.1% missing `seq`. Gaps are tolerated because the next full snapshot replaces state.

- [ ] Verify WebSocket upgrades to Durable Object rooms through the production route.
- [ ] Measure room delivery with one Durable Object per room; split a room across objects only if the measurement requires it.
- [ ] Build a synthetic viewer harness with plain WebSocket clients; monitor the generator to avoid a client-side bottleneck.
- [ ] Run ramp tests (e.g. 100 → 500 → 1,000 → 3,000), stable soak, all-viewers-one-match hotspot, distribution across tournament sports, and reconnect burst.
- [ ] During load, issue representative score events and final confirmations; verify delivery ordering, no loss/duplication, and no unauthorized mutation path.
- [ ] Record connect success, p50/p95/p99 update latency, errors, sequence gaps, Worker and Durable Object request counts, Neon compute and slow queries, outbox lag, and egress.
- [ ] Record build SHA, topology, region, instance sizes, workload, duration, results, failures and limits in the capacity section of this file after the run. Keep raw measurements outside shared source. Do not add a separate report by default.
- [ ] Do not claim 3,000-viewer capacity until results and thresholds are measured and reported; keep synthetic clients separate from actual audience figures.

### Capacity results (simulated clients)

No 3,000-client run has happened. There is no capacity result. Thresholds: [Load-test pass thresholds](#load-test-pass-thresholds). How to run the harness: [local-development.md](local-development.md#load-test-load_harness).

**Full run: Blocked.** Staging is deployed since 20 October 2026 (smoke 4 of 4). Remaining blocker:

1. No safe publish trigger without staff credentials. The only staging publish path is `POST /api/matches/:id/actions` (Test_Engine, `ENABLE_TEST_ENGINE=true` in staging). It needs a real Clerk user linked to an active `MATCH_OPERATOR` account with `ACTIVE` assignments on 4 `LIVE` matches, and the staging `CLERK_SECRET_KEY` with that user's session ID to mint 60 s session tokens during the run. The fake seed has no real Clerk user. No publish backdoor was added. Not checked: whether a token minted through the Clerk Backend API passes the `AUTHORIZED_PARTIES` (`azp`) check.

The command for the full run, after the blocker is resolved, is in [local-development.md](local-development.md#load-test-load_harness).

Free-plan cost of one full run (estimate, not measured): about 8,500 Worker requests (5,000 socket upgrades, about 1,700 burst reconnects, about 1,800 score actions at 4 rooms × 1 per 2 s × about 15.5 min), about 12,000 Durable Object requests and about 11,000 Hyperdrive queries. This fits the 100,000/day Workers, Durable Objects and Hyperdrive limits in one run.

**Local small-scale check (not a threshold result), 19 October 2026.** Build: base `e1878dd` plus uncommitted local changes. Topology: `wrangler dev` 4.151.1 on Linux, Node 22.21.1, generator and Worker on one machine; a local-only shim Worker serves the real `src/index.js` and calls the real `publishEvent` for publishes. Workload: 120 simulated clients on `home`, 20 per match room × 4 rooms, ramp 15 s, hold 30 s, 1 publish per room every 2 s, reconnect burst of 40 clients over 10 s. Results: 266 of 266 connects (100%); publish-to-receive latency p95 88 ms, p99 169 ms; 0 duplicate `seq`; 0 missing `seq` of 16,111 messages; burst 66 of 66 sockets reconnected in 10.0 s; generator event-loop p99 ≤ 28 ms and CPU ≤ 28%, so no generator bottleneck. Failures: none. Limits: local runtime, loopback network and one machine prove only that the harness works; they say nothing about staging or Cloudflare capacity. The `PUBLISH=api` path was checked only for a clean stop on a failed lease; it has not scored against a real database.

## Cross-feature acceptance checklist

- [ ] Requirement traces to PRD/rules and the user decision log.
- [ ] No TypeScript, sport-scoped admin roles, or extra bracket rounds have been introduced; operator access is match-scoped and checked against the database on every request.
- [ ] Roles are explicit (`SUPER_ADMIN`, `TOURNAMENT_MANAGER`, `MATCH_OPERATOR`); managers cannot create managers or Super Admins.
- [ ] Match sport config is validated, versioned, and frozen into the match at start.
- [ ] Bracket contains exactly two semifinals and one final; only approved semifinal results advance.
- [ ] Regular_Matches never affect bracket progression.
- [ ] Final result requires assigned-operator confirmation; acceptance locks editing and publishes the result.
- [ ] HTTP inputs are runtime-validated and authorized; viewer sockets accept no commands; audit records identify actors and transitions, including assignments and overrides.
- [ ] Score event, projections, audit, and outbox are consistent and recoverable.
- [ ] All schema changes are migrations deployed by CI; only the Worker connects to the database.
- [ ] UI covers loading, empty, error, provisional, final, stale, assignment, and responsive states.
- [ ] Tests cover scoring boundaries, undo, final lock, future bracket progression, reconnects, idempotent retries, and per-role authorization.
- [ ] Existing docs describe final accepted contracts and concise verification/publication evidence. Applicable checks pass, and the remote commit/PR is confirmed before a feature is marked shared and complete. No abandoned attempts, duplicate summaries or local scratch references are included.

## Deferred scope

- Player accounts, cross-sport player profiles, and long-term personal statistics.
- Combined cross-sport champion table/points formula.
- Historical tournament archive UX unless separately prioritized.
- Sports beyond the six initially selectable choices.
- Livestreaming, media uploads, registration/payments, chat, social feeds, or notifications.
- Operator permissions beyond `SCORE`.
- Thapar logo asset integration until the user supplies the official file/source.

## Current blockers

The homepage, fixed bracket shape, role model and common assignment gate are decided. Future foundation work can proceed when its scoped contracts and acceptance cases are agreed. Do not recreate the completed frontend.

| Dependent work | Missing decision | State and decision owner |
| --- | --- | --- |
| Event defaults, exceptional outcomes and standings | Coaches choose event presets/custom values; tie/award/standings policy remains Open | Scoring controls implemented on integration branch; dependent exceptional outcomes and standings stay Blocked. |
| Regular_Match statistics | Whether Regular_Match results contribute to statistics or standings (their public visibility is decided, change 4) | Blocked; user/authorized product owner. |
| Final roster validation and public fields | Eligibility, limits, squads and approved display data | Blocked; user/authorized event organizer. |
| Final shared API/lifecycle implementation | Exact payload/error schemas, machine states and transitions | Blocked until scoped contract review; implementing teams agree with the product owner. |
| Account recovery for staff | Recovery policy | Blocked; authorized account owner. |
| Event readiness in production (deployed 20 October 2026) | Release of the staff roles and manager console to `main` after the release pull request checks (deferred rows 9–11); validated rosters, bracket advancement and standings (F2); account ownership | Blocked; user/authorized product owner. See [Follow-up tasks](#follow-up-tasks). |
| Capacity claims | A measured 3,000-client run against the [agreed thresholds](#load-test-pass-thresholds) | Blocked on a test operator account (F4). |
| Launch | Private R2 backup storage and `backup.yml` re-enabled with its own environment (F12). The workflow is disabled and its artifact is deleted ([memory](memory.md#public-repository-and-ci--20-october-2026)) | Blocked; Arnav. Starts only on Arnav's explicit command; planned after the final feature, before launch. Deferred row 7 in [deferred-tests.md](deferred-tests.md). |

These blocks apply to the dependent behavior, not every independent task. Record decisions in memory and update the existing authoritative contract before implementation. Record failed/untested cases honestly. Keep the handoff and task evidence current after agreed tests pass.
