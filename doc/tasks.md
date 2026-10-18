# Implementation Tasks: Thaparlympics Score Website

**Status:** Detailed implementation backlog; sport formats and selected operating policies remain open inputs.  
**Stack:** React/Vite + JavaScript on Cloudflare Workers static assets; Hono API Worker; Durable Object WebSocket rooms for live delivery; Neon Postgres through Hyperdrive; Clerk sign-in (open Viewer sign-up, invited staff roles); `dbmate` migrations in `db/migrations/` applied by GitHub Actions. No Postgres or Docker runs on any team device. Decided 11 October 2026; see [memory.md](memory.md#backend-and-hosting-decisions--11-october-2026).  
**Expected audience:** approximately 1,000 actual concurrent viewers. **Capacity demonstration:** 3,000 simulated clients only, pending a measured load test.

## 0. Product decisions agents must preserve

- The top-level public entity is a tournament: tournament index → tournament → enabled sport → matches → match detail.
- On tournament creation, a manager selects a subset of football, volleyball, basketball, table tennis, lawn tennis, and badminton.
- A tournament sport has its own validated, configurable scoring format and point values. Do not treat unlike sports as a single generic score counter; share configuration/versioning infrastructure but retain sport-specific domain engines.
- Each tournament sport's bracket is exactly two semifinals feeding one final. A manager assigns teams to the two semifinal matches; approved semifinal winners fill the final slots. Do not add other bracket rounds in this release.
- Custom matches are separate from the bracket and do not affect bracket progression.
- Roles are explicit in `admin_accounts.role`: `SUPER_ADMIN`, `TOURNAMENT_MANAGER`, `MATCH_OPERATOR`; spectators are anonymous. One role per account; Super Admin includes every manager capability. Tournament Managers are global (no tournament-scoped manager table). No `is_admin` flag and still **no sport-scoped admin roles**.
- Only Super Admins create Tournament Managers and Super Admins. Managers can invite `MATCH_OPERATOR` accounts only.
- Match-scoped operator assignments (`match_operator_assignments`) are required. Operators score only matches with an effectively valid assignment; managers who score assign themselves first. One active assignment per match; `scorer_leases` picks the one active device.
- Every scoring HTTP/socket command runs the authorization chain against the database (token → active account → active assignment → time window by server time → `SCORE` → match accepting scores → lease). Unassigned match = 403; locked match = 409.
- A completed score is provisional until approved. Only an approved result is final. The submitter can never approve their own result, except via an audited Super Admin override with a reason. Rejection chooses `correction_route` `OPERATOR` or `MANAGER`. Keep live score updates visible while the match is in progress.
- Live undo by the assigned operator is unlimited, needs no reason, is stored as reversal actions, and shows no public marker. Corrections after submission/approval need a reason and show a public marker.
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
8. Maintain clear states: `LIVE` (provisional), `PENDING_APPROVAL`, `APPROVED/FINAL`, `REJECTED/CORRECTION`. Rejected or pending results must not be reported as final.
9. Update affected docs and this task list when requirements change; don't silently fork behavior between PRD, architecture, and rules.
10. Follow [AGENTS.md](../AGENTS.md) for tools, ownership, decision gates, final documentation and publication evidence. Use `handoff.md` for integration and `local-development.md` for setup. Keep one current task entry; do not append an execution diary.

## Current frontend work — pushed, remote CI not recorded

The homepage, frontend CI, badminton page (`9a22720`) and all-sports change (`dfe54f5`) are on `origin/main`, per the local remote-tracking ref on 11 October 2026. The GitHub Actions results for these commits are not recorded here. Requirements and unchecked tasks below remain planned.

| Area | Final implementation | Current status |
| --- | --- | --- |
| Homepage | React/Vite JavaScript, approved responsive UI, local artwork, filters, native card rails and reserved detail routes. Use [handoff.md](handoff.md) for integration and [design.md](design.md) for visual contracts. Card content remains temporary. | Locally verified; on `origin/main`; remote CI result not recorded. |
| Frontend CI | Same install, lint and build on Ubuntu, Windows and macOS. Ubuntu and macOS run all six Playwright projects; Windows runs `chromium`, `firefox` and `pixel`. Each OS reports independently. | On `origin/main`; remote CI result not recorded. |
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
| Kiro agent (for the user) | Cross-browser, phone-emulation and edge-case tests: `frontend/playwright.config.js` (six projects), `tests/sport-edge-cases.spec.js`, `tests/mobile.spec.js`, `tests/helpers.js`, small edits to `tests/homepage.spec.js`, `.github/workflows/frontend.yml`, two CSS fixes (`SportPage.css`, `HorizontalRail.css`) and docs | The sport-pages change | Locally verified (all six projects; WebKit needed side-loaded libraries, see below); remote CI result not recorded | `origin/main`, `dfe54f5`; no PR |
| Kiro agent (for the user) | Sport pages for all six sports: `frontend/src/features/sports/*`, `App.jsx` (sport routes), `global.css` (section container selector), `tests/sport-pages.spec.js` (replaces `badminton.spec.js`), `tests/homepage.spec.js` (sport routes built), README and docs | None. Formats stay open in `rules.md`; fixtures are display only. Open items in `memory.md`: ended-match label, detail URL. | Locally verified; remote CI result not recorded | `origin/main`, `dfe54f5`; no PR |
| Kiro agent (for the user) | Backend 1: shared docs for the confirmed stack; `.gitignore` rules for `.dev.vars*` and `.wrangler/`; `backend/` workspace (Hono, Wrangler, Workers test pool), `GET /health`, root scripts, backend CI | None | Locally verified, 18 October 2026: `lint:backend` and `test:backend` (22 tests, incl. property tests) passed; frontend `lint` and `build` passed; `npm test` passed in Firefox only (Chromium, Pixel, WebKit, iPhone and iPad could not launch on this machine: Chromium revision 1248 and `libavif.so.16` missing); remote CI result not recorded | `main` |
| Kiro agent (for the user) | Backend 2: `MatchRoom` Durable Object, `/live/:room`, request-count estimate and the Workers Paid gate | Backend 1 | Locally verified, 18 October 2026: `MatchRoom`, `/live/:room`, live room integration tests and property tests pass in `test:backend`; same browser limits as Backend 1. Usage estimate and Workers Paid gate: decision Workers Free (see below); remote CI result not recorded | `main` |
| Kiro agent (for the user) | Match Operator "My Matches" dashboard, frontend only: `frontend/src/features/operator/{MyMatchesPage.jsx,OperatorMatchCard.jsx,operatorMatches.js,MyMatches.css}`, `App.jsx` (`/operator/matches` + reserved `/operator/matches/:matchId/score`), `SiteHeader.jsx` (My Matches nav tab, desktop + mobile), `tests/operator-matches.spec.js`, docs. Shows only this scorer's assigned matches in Live (Continue scoring) / Scheduled (Start scoring, date-filtered) / Completed (View, read-only) sections. Reuses `SiteHeader`, `HorizontalRail`, date chips, `SportIcon`, card shell and design tokens. No auth, no login indicator, no backend. | Scoring console page is a later pass (shared admin + scorer). Match formats stay admin-decided and open in `rules.md`; `operatorMatches.js` reuses existing sport display fixtures. | Locally verified on `matchscorer` (see checks below); remote CI result not recorded | `matchscorer` `6a0517e`, merged into `develop`; no PR |
| Kiro agent (for the user) | Backend 3: Neon projects, `dbmate` pipeline, core schema and constraint tests, CI throwaway Postgres, deploy workflow | Backend 1; manual prerequisites | Planned | — |
| Kiro agent (for the user) | Backend 4: Hyperdrive cached and uncached configs, public read API, fake seed | Backend 3 | Planned | — |
| Kiro agent (for the user) | Backend 5: Clerk token and role middleware, invitations, Super Admin bootstrap, header Sign in link, privacy and account-deletion pages | Backend 4; privacy owner (Open) for production | Planned | — |
| Kiro agent (for the user) | Backend 6: assignments, scorer leases, shared scoring authorization chain and its test matrix | Backend 5 | Planned | — |
| Kiro agent (for the user) | Backend 7: score-action write path, test-only engine, single-transaction outbox, outbox sweep | Backend 6; production engines Blocked on [rules.md](rules.md) | Planned | — |
| Kiro agent (for the user) | Backend 8: frontend live client and homepage live row | Backend 7; snapshot-to-card contract agreed in [handoff.md](handoff.md) | Planned | — |
| Kiro agent (for the user) | Backend 9: operator console with the offline queue | Backend 8 | Planned | — |
| Kiro agent (for the user) | Backend 10: hardening, nightly encrypted backup, load harness | Backend 9; rate-limit threshold and load-test thresholds (Open) | Blocked for the load test | — |
| Kiro agent (for the user) | Backend 11: production cutover (domain route, Clerk production, Google OAuth, smoke check) | Backend 10; manual prerequisites | Blocked on prerequisites | — |

Usage estimate and Workers Paid gate, 18 October 2026 (**user-confirmed inputs**). The Usage_Calculator is a local script in ignored `output/usage/`. `node output/usage/usage.mjs` reproduces the results below; its self-check passes. Cost model: each socket connect is 1 Worker + 1 DO request; each score action is 1 Worker request, 3 DO requests (`noteWrite`, `publish`, `publishCard`), about 5 DO row writes and about 6 Hyperdrive queries; each staff request is 1 Worker request and about 2 queries; each public `/api/*` read is 1 Worker request and 1 cached query; each sweep is 1 Worker + 1 DO request (queries counted as an upper bound). Static assets are not counted.

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

My Matches dashboard checks, 11 October 2026, branch `matchscorer`, macOS, Node 24.11.1, installed Chrome. `npm run lint` and `npm run build` passed. `PLAYWRIGHT_CHANNEL=chrome npm test -- operator-matches.spec.js --project=chromium` passed all 7 tests: fixtures resolve to real assigned matches grouped by state; the page shows only Live/Scheduled/Completed with the assigned counts; each card links to `/operator/matches/<id>/score` with the correct action label (Continue scoring / Start scoring / View match) and sport label; scheduled date chips filter in place; the header "My Matches" tab navigates from the home page to the dashboard and gets `aria-current="page"`; layout has no body overflow and 44px actions from 320 to 2560px; the reserved scoring route renders blank. A production-preview visual check with Playwright (installed Chrome) confirmed the desktop nav reads Home/Tournaments/My Matches/Sports, and the dashboard sections read Live/Scheduled/Completed at phone 390×844 and desktop 1440×900 with no body overflow and no console errors; captures were local and not committed. Limits: Chromium/installed-Chrome only this run; no Safari/Firefox, physical-device or screen-reader check; mobile-emulation projects (`mobile.spec.js`) do not yet include an operator case; the shared scoring console is unbuilt. A pre-existing flaky failure (`homepage.spec.js` repeat-navigation scroll at height 600) reproduces on the clean baseline with my changes stashed, so it is an environment/browser issue (installed Chrome 146 scroll timing), not caused by this change, which only adds a nav link and renames a section. After the merge into `develop`, 18 October 2026, Linux: `npm run lint`, `npm run build`, `lint:backend` and `test:backend` (22 tests) passed; `npm test -- --project=firefox` passed 130, skipped 1, including the 7 operator tests. Other browser projects could not launch on this machine (same limit as Backend 1).

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

CI matrix: Windows runs `chromium`, `firefox` and `pixel` only. Safari does not exist on Windows, and Playwright's Windows WebKit port is the least representative; Ubuntu and macOS cover WebKit. CI results are pending until the change is pushed.

Limits: emulated devices only. No physical phone, branded Safari or screen-reader check. Use the manual checklist in [local-development.md](local-development.md#check-on-a-real-phone). Firefox has no phone emulation. WebKit touch swipe and system text size are manual checks only. On emulated iPhone and iPad, one ArrowRight press on a rail snaps back to the start; three presses scroll it. The homepage cards have no long-name test. The empty-cell `—` marks in the dialog keep their pending screen-reader fix. The LAN preview command was not started in this run.

## Backend manual prerequisites (user)

These are account and console steps, not coding tasks. Backend 1 needs none of them.

- [ ] Claim a GitHub Student Pack domain and move its DNS to Cloudflare.
- [ ] Create the Cloudflare account, the Neon staging and production projects, and the Clerk development and production instances.
- [ ] Create a Google OAuth client for Clerk production.
- [ ] Create the `develop` branch.
- [ ] Add the GitHub Environment secrets for `staging` and `production`.

Open backend decisions are listed in [memory.md](memory.md#backend-open-items).

## Phase 0 — Resolve implementation-blocking inputs

### Tournament and identity setup

- [ ] Confirm tournament name, dates/timezone, lifecycle/status labels, venue metadata, and whether multiple tournaments can be active concurrently.
- [ ] Confirm branch/year/division categories and team naming conventions.
- [x] Role model and invite rules decided: Super Admin creates managers/Super Admins; managers invite operators only; no sport-scoped roles.
- [x] Approver policy decided: submitter ≠ approver, with audited Super Admin override.
- [x] Invitation email decided: Clerk sends invitation and verification email; no custom SMTP provider is needed.
- [ ] Decide whether invited emails must be Thapar addresses, and the account recovery policy.
- [ ] Decide whether the Assign Scorer form suggests a default time window.

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
- [ ] Decide result rules for ties, abandonments, forfeits, walkovers, and official correction after approval.
- [ ] Decide whether custom-match results are public and whether they count toward player statistics or standings. They never fill bracket slots.
- [ ] Decide standings columns, points, tie-break order, and treatment of pending/rejected/custom matches.
- [ ] Confirm roster/team limits, player eligibility, match-day squad rules, and substitute movement after match start.

### Branding and delivery

- [ ] Keep the site-wide Thapar logo component/slot ready, but leave the real image unset until supplied. Then add the approved asset, source/usage note, responsive variants if needed, and verify aspect ratio/contrast on every layout.
- [x] Database and hosting plan decided: Neon Free and Cloudflare Workers Free, with Workers Paid in event months only if the measured gate requires it.
- [ ] Choose the production account owner, supported browsers and event-day support contact. Host (Cloudflare) and domain source (Student Pack) are decided.
- [ ] Agree load-test pass thresholds: connection ramp/soak duration, message/update frequency, p95/p99 latency, reconnect profile, and acceptable errors.

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
  - `match_result_reviews`: result version, `submitted_by`, `reviewed_by`, `decision`, `reason`, `correction_route` (`OPERATOR` | `MANAGER`), `self_approval_override`, `override_reason`.
  - `score_actions` (including linked reversal actions), `match_snapshots`, `player_match_stats`, `sport_standings`, `scorer_leases`, `admin_audit_log`, and `outbox_events`.
- [ ] Add foreign keys, check constraints, uniqueness rules, timestamps, status constraints, and indexes for tournament/sport/match public reads and for assignment lookups by `(match_id, user_id, status)`.
- [ ] Assignment constraints: check `valid_until > valid_from` when both are set; partial unique index on `match_id` where `status = 'ACTIVE'`; revoked rows require `revoked_at` and `revoked_by`.
- [ ] Review constraint: `reviewed_by <> submitted_by` unless `self_approval_override` is true with a non-empty `override_reason`; rejection requires `reason` and `correction_route`.
- [ ] Grant database access only to the Worker's role; no browser or public API connects to the database.
- [ ] Add constraints/tests preventing a custom match from occupying a bracket slot and preventing the bracket from having extra semifinal/final slots.
- [ ] Ensure one team cannot be assigned to both sides of the same semifinal unless an explicitly approved special rule supports it.
- [ ] Store immutable-at-match-start format config snapshots so changing tournament defaults cannot reinterpret an in-progress match.
- [ ] Seed synthetic data in `db/seed/fake.sql` for CI and staging only. Clearly mark seeded users, teams, and scores as fake; never seed production.

**Exit criteria:** migrations build the schema from scratch in CI, constraints reject invalid bracket/match/assignment/review rows, and seeds create a tournament with multiple enabled sports, assigned operators, and pending/approved sample results.

## Phase 3 — Authentication, roles, match assignment authorization, and audit

- [ ] Configure Clerk: open sign-up, required email verification, the suspicious-sign-up challenge, Google as the only social provider, and allowed redirect URLs.
- [ ] Verify Clerk session tokens in the Worker with `@clerk/backend` and an `authorizedParties` allow-list. Keep the secret key on the Worker only.
- [ ] Load the `admin_accounts` row on every protected request; reject disabled or missing accounts with 403. Do not trust role or assignment data from token claims.
- [ ] Implement role middleware for non-scoring routes: manager-or-above for tournaments, sports, teams, matches, assignments, and reviews; Super Admin only for manager/Super Admin account administration.
- [ ] Implement invite flows: Super Admin invites managers/Super Admins; managers invite operators only (server rejects any other role). Use the Clerk Invitations API server-side; audit every account change. Sign-up without an invitation stays a Viewer.
- [ ] Implement the scoring chain from `architecture.md`: token → active account → active assignment → server-time window → SCORE → role-aware match state → device lease. LIVE and REJECTED/OPERATOR use the valid assigned scorer. REJECTED/MANAGER requires a self-assigned Tournament Manager or Super Admin; operators remain locked out. Retain the documented 401/403/409 responses, reasons and audit.
- [ ] Never rely only on hidden UI buttons or room membership. Viewer sockets accept no commands.
- [ ] Implement audit helpers storing actor, action, entity, timestamp, request/correlation ID, before/after summary, and reason. Audit assignments, revocations, reassignments, self-assignments, reviews, overrides, and corrections.
- [ ] Add authorization tests (HTTP; viewer sockets are receive-only):
  - anonymous public GET allowed; anonymous mutation denied;
  - operator scoring an unassigned match → 403; before `valid_from` → 403; after `valid_until` → 403; revoked → 403 on the next command; submitted/approved match → 409; no lease → 409;
  - operator cannot reach tournament, team, match, user, or review routes;
  - manager cannot invite managers or Super Admins; manager can manage every tournament and sport;
  - disabled account denied.
  - rejected OPERATOR route permits the valid assigned scorer; rejected MANAGER route denies operators and permits only a valid self-assigned manager/Super Admin; missing, expired or revoked assignment and missing lease still fail;
  - manager takeover revokes the old assignment and creates the self-assignment in one audited transaction; resubmission and independent approval remain required.
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
- [ ] Implement scheduled match creation and custom match creation outside the bracket. Require sport, teams/sides, format snapshot, match label/type, date/time/venue as applicable.
- [ ] Clearly mark custom matches in admin and public UI; guarantee no custom match triggers bracket progression.
- [ ] Add match lifecycle transitions (`SCHEDULED → LIVE → PENDING_APPROVAL → APPROVED/FINAL`, or `REJECTED/CORRECTION`) with server-side validation.
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
- [ ] On rejection, keep the bracket unchanged and return the semifinal result to correction workflow.
- [ ] On correction/reversal of an already approved semifinal, mark downstream final slot/match as requiring manager review; never silently swap participants in a live or finalized final.
- [ ] Lock bracket team assignment once a semifinal starts. Provide audited manager correction/reopen flow for exceptional cases.
- [ ] Build accessible bracket UI for public and admin, including empty, pending, approved, rejected, live, and final states.

**Exit criteria:** only the approved winner of each semifinal fills the final; the bracket contains no other rounds and custom matches remain separate.

## Phase 7 — Sport scoring engines and configurable point systems

### Shared score-command infrastructure

- [ ] Define a common versioned score-action envelope: action ID, match ID, sport key, rules/config version, client sequence, action type/payload, actor/device metadata, and server acceptance metadata.
- [ ] Run the scoring authorization chain before validation of every action.
- [ ] Validate action payload against the specific sport's runtime schema and the match's frozen configuration.
- [ ] Enforce idempotency, monotonic server sequence per match, legal state transitions, and atomic action/projection/audit/outbox persistence.
- [ ] Implement deterministic rebuild of score snapshot and player-match contributions from accepted actions.
- [ ] Implement live undo: the assigned operator can reverse any number of prior actions while `LIVE`, with no reason and no extra permission. Store each as a linked reversal action with actor and server time; do not set the public correction marker.
- [ ] Implement post-submission/post-approval correction as linked compensating/replacement actions that require a reason, set the public correction marker, and never erase accepted history.

### Sport-specific engines (build only after rules are confirmed)

- [ ] Football: configurable team size/periods/clock; goals, own goals if required, cards, substitutions, optional scorer/assist, configured tie procedure; derive score and result.
- [ ] Volleyball: rally points by set; configured sets-to-win, target/win-by/cap and deciding set; optional lineup/rotation, substitutions, timeout/fault detail as agreed.
- [ ] Basketball: configurable periods/clock; configurable scoring values (e.g. 1/2/3 as confirmed), player attribution, team/player fouls and timeouts only if required; overtime/tie rule.
- [ ] Table tennis: point/rally and game progression; configured target/win-by, games-to-win, singles/doubles; server/end tracking and team-tie orchestration only if selected.
- [ ] Lawn tennis: point → game → set → match progression; configurable advantage/no-ad, set and tiebreak/final-set variants; singles/doubles participants.
- [ ] Badminton: rally scoring; configured game target, win-by/cap, games-to-win; singles/doubles and alternative scoring when explicitly selected.
- [ ] For each configured scoring value, validate allowed values and derive results from actions; do not allow manual total edits to bypass the event log.
- [ ] Add boundary tests for deuce/win-by/cap, period/set transitions, tiebreaks, tied outcomes, invalid player/team/action, undo/replay, correction, and config-version mismatch.
- [ ] Build sport-specific scorer consoles with laptop-first controls and responsive mobile fallback; make rapid input touch-safe and keyboard-operable; undo has no reason prompt while live.
- [ ] Show local pending/offline score separately from server-accepted live score.

**Exit criteria:** each enabled sport has a tested scoring engine for the organizer-confirmed format; score totals, match result, and match-only player stats are reproducible from action history including undos.

## Phase 8 — Result submission and approval

- [ ] Add "finish and submit result" for the assigned operator; persist the result version with `submitted_by`, move the match to `PENDING_APPROVAL`, and lock ordinary scoring.
- [ ] Build the review queue with tournament/sport/match, teams, final scorecard, event summary, submitter, corrections, and relevant match metadata.
- [ ] Implement approve and reject for managers and Super Admins. Approval records reviewer and timestamp; rejection requires a reason and a `correction_route`.
- [ ] Enforce submitter ≠ reviewer in the service and the database check. Allow a Super Admin override only with `self_approval_override = true` and a non-empty `override_reason`; audit it.
- [ ] On rejection with `OPERATOR`, reopen scoring for the still-active assignment until resubmission; with `MANAGER`, keep the operator locked out and let a manager (self-assigned) correct.
- [ ] Ensure only approval moves a result to `APPROVED/FINAL` and enables final-result-dependent standings/bracket progression.
- [ ] Ensure pending/rejected results remain visibly non-final to spectators and do not populate final bracket outcomes.
- [ ] On changes after approval, require an explicit correction that creates a new result version and a new approval; display the public correction marker.
- [ ] Make approval idempotent and transaction-safe; concurrent approve/reject attempts must not both succeed.
- [ ] Add tests: approved advancement, rejected no-advancement, pending visibility, self-approval blocked for every role, Super Admin override with and without reason, both correction routes, duplicate review requests, correction after approval, and reviewer audit data.

**Exit criteria:** no result becomes final, advances the bracket, or enters confirmed standings before approval by someone other than the submitter (or an audited override).

## Phase 9 — Public spectator experience

- [ ] Build public tournament index with status/date and live/upcoming/recent match summaries.
- [ ] Build tournament detail with enabled sports, bracket summary, and tournament matches.
- [ ] Build one page per enabled sport with match filters, custom-match labeling, bracket, and configured standings.
- [ ] Build match detail with sport-specific scorecard, provisional/final/review status, timeline, approved player contributions, and correction marker (post-submission corrections only).
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
- [ ] Pause sync on expiry, revocation, sequence/config/review conflicts; surface the paused state to the operator and the conflict to managers, who can extend the window or resolve.
- [ ] Test network loss, browser refresh/restart, duplicate delivery, stale client, action rejection, sync after `valid_until`, and sync after revocation; document storage quota/device-loss limitations.
- [ ] Verify score updates, result submissions, approvals, bracket advancement, and standings all propagate consistently to active spectators.

**Exit criteria:** connected clients converge on the authoritative approved state; offline retries do not duplicate score actions, bypass assignment checks, or falsely mark results finalized.

## Phase 11 — Quality, security, and operational readiness

- [ ] Add unit tests for all six configured score engines and bracket/result state transitions.
- [ ] Add integration tests (in CI against the throwaway Postgres) for DB constraints, transactions, per-role authorization, assignment validity, review workflow, idempotency, outbox retries, and projection rebuild.
- [ ] Add browser tests for tournament create, sport config, roster/match setup, scorer assignment/revocation, operator My Matches, scoring and undo, approval/rejection, public updates, mobile layouts, and offline recovery.
- [ ] Add security checks for public data minimization, database access through the Worker only, admin/operator route protection, input validation, CORS/origin, rate limits, secret handling, and log redaction.
- [ ] Add backup/restore rehearsal (nightly encrypted `pg_dump` from CI), health checks, structured logs, error reporting, and an event-day runbook (check Workers usage and the paid gate, verify migrations deployed, verify Clerk sign-in).
- [ ] Confirm all domain statuses have accessible text/icon labels and do not depend on color alone.
- [ ] Confirm logo integration once asset arrives: header, tournament, sport, match, admin, operator, mobile; no distortion and appropriate contrast.

## Phase 12 — Capacity demo and honest reporting

- [ ] Verify WebSocket upgrades to Durable Object rooms through the production route.
- [ ] Measure room delivery with one Durable Object per room; split a room across objects only if the measurement requires it.
- [ ] Build a synthetic viewer harness with plain WebSocket clients; monitor the generator to avoid a client-side bottleneck.
- [ ] Run ramp tests (e.g. 100 → 500 → 1,000 → 3,000), stable soak, all-viewers-one-match hotspot, distribution across tournament sports, and reconnect burst.
- [ ] During load, issue representative score events and result approvals; verify delivery ordering, no loss/duplication, and no unauthorized mutation path.
- [ ] Record connect success, p50/p95/p99 update latency, errors, sequence gaps, Worker and Durable Object request counts, Neon compute and slow queries, outbox lag, and egress.
- [ ] Record build SHA, topology, region, instance sizes, workload, duration, results, failures and limits in the capacity section of this file after the run. Keep raw measurements outside shared source. Do not add a separate report by default.
- [ ] Do not claim 3,000-viewer capacity until results and thresholds are measured and reported; keep synthetic clients separate from actual audience figures.

## Cross-feature acceptance checklist

- [ ] Requirement traces to PRD/rules and the user decision log.
- [ ] No TypeScript, sport-scoped admin roles, or extra bracket rounds have been introduced; operator access is match-scoped and checked against the database on every request.
- [ ] Roles are explicit (`SUPER_ADMIN`, `TOURNAMENT_MANAGER`, `MATCH_OPERATOR`); managers cannot create managers or Super Admins.
- [ ] Match sport config is validated, versioned, and frozen into the match at start.
- [ ] Bracket contains exactly two semifinals and one final; only approved semifinal results advance.
- [ ] Custom matches never affect bracket progression.
- [ ] Final result requires approval by someone other than the submitter (or an audited Super Admin override); pending/rejected results are not final standings inputs.
- [ ] HTTP inputs are runtime-validated and authorized; viewer sockets accept no commands; audit records identify actors and transitions, including assignments and overrides.
- [ ] Score event, projections, audit, and outbox are consistent and recoverable.
- [ ] All schema changes are migrations deployed by CI; only the Worker connects to the database.
- [ ] UI covers loading, empty, error, pending review, rejected, approved, stale, assignment, and responsive states.
- [ ] Tests cover scoring boundaries, undo, approvals, bracket progression, reconnects, idempotent retries, and per-role authorization.
- [ ] Existing docs describe final accepted contracts and concise verification/publication evidence. Applicable checks pass, and the remote commit/PR is confirmed before a feature is marked shared and complete. No abandoned attempts, duplicate summaries or local scratch references are included.

## Deferred scope

- Player accounts, cross-sport player profiles, and long-term personal statistics.
- Combined cross-sport champion table/points formula.
- Historical tournament archive UX unless separately prioritized.
- Sports beyond the six initially selectable choices.
- Livestreaming, media uploads, registration/payments, chat, social feeds, or notifications.
- Tournament-scoped managers and operator permissions beyond `SCORE`.
- Thapar logo asset integration until the user supplies the official file/source.

## Current blockers

The homepage, fixed bracket shape, role model and common assignment gate are decided. Future foundation work can proceed when its scoped contracts and acceptance cases are agreed. Do not recreate the completed frontend.

| Dependent work | Missing decision | State and decision owner |
| --- | --- | --- |
| Production sport engines and standings | Event format, scoring values, ties, standings policy | Blocked; user/authorized event organizer, recorded in rules/memory. |
| Custom-match statistics and public visibility | Whether custom results contribute, and where they appear | Blocked; user/authorized product owner. |
| Final roster validation and public fields | Eligibility, limits, squads and approved display data | Blocked; user/authorized event organizer. |
| Final shared API/lifecycle implementation | Exact payload/error schemas, machine states and transitions | Blocked until scoped contract review; implementing teams agree with the product owner. |
| Account recovery for staff | Recovery policy | Blocked; authorized account owner. |
| Production release and capacity claims | Account ownership, privacy contact, rate-limit and load-test thresholds (see [memory.md](memory.md#backend-open-items)) | Blocked; authorized operations/product owner. |

These blocks apply to the dependent behavior, not every independent task. Record decisions in memory and update the existing authoritative contract before implementation. Record failed/untested cases honestly. Keep the handoff and task evidence current after agreed tests pass.
