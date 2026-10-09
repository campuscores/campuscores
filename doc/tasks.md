# Implementation Tasks: Thaparlympics Score Website

**Status:** Detailed implementation backlog; sport formats and selected operating policies remain open inputs.  
**Stack:** React/Vite + JavaScript; Node/Express + Socket.IO; hosted Supabase Postgres + Supabase Auth (invite-only); migrations in `supabase/migrations/` applied by GitHub Actions; Redis Socket.IO adapter for multi-instance mode. No Postgres runs on any team device.  
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
- Implement in JavaScript, not TypeScript. PostgreSQL is the durable source of truth; Socket.IO/Redis are transport only.
- Never change the remote database schema through the Supabase Dashboard; every schema change is a migration deployed by CI.
- Never describe the 3,000 simulated-client goal as actual attendance or tested capacity until the load test is run and reported.

## Agent workflow and implementation conventions

1. Before coding, read `prd.md`, `architecture.md`, `rules.md`, `design.md`, and `memory.md`.
2. Choose an agreed, scoped incomplete task with clear ownership and dependencies. Independent frontend work can proceed alongside other phases; preserve completed homepage work. Record assumptions/questions in `memory.md`; do not resolve an open sports rule by guessing.
3. Keep changes cohesive and reviewable. Every schema change is a migration in `supabase/migrations/`; every new scoring format gets domain tests before UI work depends on it.
4. Use runtime validation for every API/socket payload. Use JSDoc and linting; never add TypeScript unless the product decision changes.
5. Enforce permissions server-side. Anonymous spectator APIs are read-only and return only approved public fields.
6. Persist an accepted score action, projection update, audit record, and outbox event in a transaction. Broadcast only committed data.
7. Test every protected path per role: Super Admin, Tournament Manager, Match Operator (assigned, unassigned, not yet valid, expired, revoked, locked match), and anonymous Spectator.
8. Maintain clear states: `LIVE` (provisional), `PENDING_APPROVAL`, `APPROVED/FINAL`, `REJECTED/CORRECTION`. Rejected or pending results must not be reported as final.
9. Update affected docs and this task list when requirements change; don't silently fork behavior between PRD, architecture, and rules.
10. Follow [AGENTS.md](../AGENTS.md) for tools, ownership, decision gates, final documentation and publication evidence. Use `handoff.md` for integration and `local-development.md` for setup. Keep one current task entry; do not append an execution diary.

## Current frontend work — publication pending

The homepage and frontend CI commits are on `origin/main` (`dac54a0` per the local remote-tracking ref). The badminton page commit `9a22720` is local on `main` and unpushed. The all-sports change is uncommitted on `main`. No remote commit/PR is recorded for the sport pages. Local verification does not establish a published or merged feature. Requirements and unchecked tasks below remain planned.

| Area | Final implementation | Current status |
| --- | --- | --- |
| Homepage | React/Vite JavaScript, approved responsive UI, local artwork, filters, native card rails and reserved detail routes. Use [handoff.md](handoff.md) for integration and [design.md](design.md) for visual contracts. Card content remains temporary. | Locally verified, unpublished. |
| Frontend CI | Same install, lint and build on Ubuntu, Windows and macOS. Ubuntu and macOS run all six Playwright projects; Windows runs `chromium`, `firefox` and `pixel`. Each OS reports independently. | Configuration checked locally; remote execution and publication pending. |
| Shared docs | Existing canonical docs describe final contracts, durable decisions and current task state. Follow [AGENTS.md](../AGENTS.md) for documentation and completion rules. | Document checks passed; unpublished. |

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
| Kiro agent (for the user) | Cross-browser, phone-emulation and edge-case tests: `frontend/playwright.config.js` (six projects), `tests/sport-edge-cases.spec.js`, `tests/mobile.spec.js`, `tests/helpers.js`, small edits to `tests/homepage.spec.js`, `.github/workflows/frontend.yml`, two CSS fixes (`SportPage.css`, `HorizontalRail.css`) and docs | The uncommitted sport-pages change | Locally verified, unpublished (all six projects; WebKit needed side-loaded libraries, see below) | `main`, uncommitted; no PR |
| Kiro agent (for the user) | Sport pages for all six sports: `frontend/src/features/sports/*`, `App.jsx` (sport routes), `global.css` (section container selector), `tests/sport-pages.spec.js` (replaces `badminton.spec.js`), `tests/homepage.spec.js` (sport routes built), README and docs | None. Formats stay open in `rules.md`; fixtures are display only. Open items in `memory.md`: ended-match label, detail URL. | Locally verified, unpublished | `main`, uncommitted; no PR |

Sport page checks, 9 October 2026, Linux, Node 22.21.1, installed Chrome 146: `npm run lint` and `npm run build` passed; `PLAYWRIGHT_CHANNEL=chrome npm test` passed all 73 tests (8 in `homepage.spec.js`, 65 in `sport-pages.spec.js`). Coverage: all six sport routes; three sections; header-only cards; fixture validity against the official baselines and the registry; one dialog per scoring model (badminton, tennis, table tennis, volleyball, football, basketball) with bold winners, red current period, serving dot, Pts and tiebreak, scorers and lineups; ended-match winner; date chips and the empty 12 Oct day; keyboard open, Escape and focus return; desktop backdrop close; no body overflow and 44px targets from 320 to 2560px; textures and icon colour; route entry, refresh and back; chip reset between sports; tournament routes stay blank. A production preview was checked with `playwright-cli` at phone 390×844 and desktop 1440×900: all six pages and one open live dialog for badminton, tennis, volleyball, football and basketball; no body, dialog or table overflow; sport textures loaded; no console errors. Captures stay local and are not committed. Limits: Chromium only; no Safari/Firefox, physical-device or screen-reader check; Back does not close the dialog; plain `npm test` needs the bundled Playwright Chromium, which is not installed on this machine ([local-development.md](local-development.md)).

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

## Phase 0 — Resolve implementation-blocking inputs

### Tournament and identity setup

- [ ] Confirm tournament name, dates/timezone, lifecycle/status labels, venue metadata, and whether multiple tournaments can be active concurrently.
- [ ] Confirm branch/year/division categories and team naming conventions.
- [x] Role model and invite rules decided: Super Admin creates managers/Super Admins; managers invite operators only; no sport-scoped roles.
- [x] Approver policy decided: submitter ≠ approver, with audited Super Admin override.
- [ ] Choose the custom SMTP provider and sender domain; set up SPF/DKIM/DMARC.
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
- [ ] Choose the Supabase plan for the event period: Pro, or Free with the project unpaused before the event plus scheduled `pg_dump` backups from CI.
- [ ] Choose the long-running backend host and region (near the Supabase project), domain, budget, account owner, supported browsers, and event-day support contact.
- [ ] Agree load-test pass thresholds: connection ramp/soak duration, message/update frequency, p95/p99 latency, reconnect profile, and acceptable errors.

## Phase 1 — Repository foundation and shared contracts

- [ ] Inspect repository structure and existing README before adding packages; preserve existing files and user changes.
- [ ] Preserve the implemented React + Vite JavaScript frontend and root npm workspace. Add the planned Node.js + Express backend only for an agreed backend task; do not recreate the frontend.
- [ ] Initialize the Supabase CLI project (`supabase/config.toml`, `supabase/migrations/`, `supabase/seed.sql`). Do not require `supabase start`, Docker, or a local Postgres for development.
- [ ] Create staging and production Supabase projects. Store `SUPABASE_ACCESS_TOKEN` and each environment's project ID and DB password as GitHub Actions secrets.
- [ ] Add a GitHub Actions CI workflow: start a throwaway Postgres on the runner, apply all migrations, run lint/tests, then discard it.
- [ ] Add a release workflow: `supabase db push` to staging on merge to `develop`, and to production on merge to `main`. No one runs `db push` from a laptop.
- [ ] Preserve existing frontend scripts. Add needed backend/migration scripts when those features exist; update exact prerequisites and commands in `local-development.md`. Team devices require no local database.
- [ ] Add `.env.example` containing variable names only (session-pooler connection string, Supabase URL, publishable and secret key; SMTP credentials live in Supabase Auth settings, not the app); validate required variables at server startup and never expose server secrets to Vite/browser code.
- [ ] Add formatting/lint conventions, JSDoc expectations, test runner, and runtime schema validation library.
- [ ] Add API contract conventions: JSON errors (401/403/409 shapes), request correlation ID, pagination/filter syntax, date/time handling, and public/private DTO separation.
- [ ] Add `/health` and `/ready` endpoints; readiness must detect required DB connectivity without exposing secrets or internal diagnostics publicly.
- [ ] Add a small smoke test proving web build, API boot, health response, and test database connection in CI.

**Exit criteria:** a clean checkout can install, run, lint, test, and build using documented commands; CI applies migrations to a throwaway database; no secrets or TypeScript have been introduced and no local Postgres is required.

## Phase 2 — Database schema and migration foundation

- [ ] Document the migration policy: forward-only migrations in `supabase/migrations/`, created with `supabase migration new`; never edit the remote schema via the Dashboard; use `supabase migration repair` / `db pull` only to recover drift. Migrations must apply cleanly in CI against an empty database.
- [ ] Create core tables and indexes:
  - `tournaments`: name, slug, dates/timezone, status, venue/description, created/updated metadata.
  - `sports`: stable keys and display labels for the six supported sports.
  - `tournament_sports`: enabled sport per tournament; sport-specific format config, scoring values, rules source/version, roster policy, standings policy, and config version.
  - `teams`: tournament-sport scope, branch/year/division, display label, active/archive state.
  - `roster_players`: sport-team-scoped display name, branch/year as needed, captain marker, optional jersey, active state.
  - `matches`: tournament sport, two sides, schedule/venue, `bracket` or `custom` origin, status, score/result projection, format-config snapshot/version.
  - `match_roster`: selected players and active/substitute state for a match.
  - `tournament_brackets` and `bracket_slots`: exactly two semifinal matches and one final per tournament sport; final participant slots reference the approved semifinal winner.
  - `admin_accounts`: Supabase Auth user ID, `role` (`SUPER_ADMIN` | `TOURNAMENT_MANAGER` | `MATCH_OPERATOR`), `status` (`ACTIVE` | `DISABLED`), `invited_by`, timestamps. No sport or tournament scope column.
  - `match_operator_assignments`: `id`, `match_id`, `user_id`, `assigned_by`, `permission` (`'SCORE'` default, only value), nullable `valid_from`/`valid_until`, `status` (`ACTIVE` | `REVOKED`), `created_at`, `revoked_at`, `revoked_by`, `revoke_reason`.
  - `match_result_reviews`: result version, `submitted_by`, `reviewed_by`, `decision`, `reason`, `correction_route` (`OPERATOR` | `MANAGER`), `self_approval_override`, `override_reason`.
  - `score_actions` (including linked reversal actions), `match_snapshots`, `player_match_stats`, `sport_standings`, `scorer_leases`, `admin_audit_log`, and `outbox_events`.
- [ ] Add foreign keys, check constraints, uniqueness rules, timestamps, status constraints, and indexes for tournament/sport/match public reads and for assignment lookups by `(match_id, user_id, status)`.
- [ ] Assignment constraints: check `valid_until > valid_from` when both are set; partial unique index on `match_id` where `status = 'ACTIVE'`; revoked rows require `revoked_at` and `revoked_by`.
- [ ] Review constraint: `reviewed_by <> submitted_by` unless `self_approval_override` is true with a non-empty `override_reason`; rejection requires `reason` and `correction_route`.
- [ ] Enable RLS on every `public` table with no policies (deny-all for the Data API); add a CI test asserting no table lacks RLS.
- [ ] Add constraints/tests preventing a custom match from occupying a bracket slot and preventing the bracket from having extra semifinal/final slots.
- [ ] Ensure one team cannot be assigned to both sides of the same semifinal unless an explicitly approved special rule supports it.
- [ ] Store immutable-at-match-start format config snapshots so changing tournament defaults cannot reinterpret an in-progress match.
- [ ] Seed synthetic data in `supabase/seed.sql` for CI and staging only. Clearly mark seeded users, teams, and scores as fake; never seed production.

**Exit criteria:** migrations build the schema from scratch in CI, constraints reject invalid bracket/match/assignment/review rows, RLS is enabled everywhere, and seeds create a tournament with multiple enabled sports, assigned operators, and pending/approved sample results.

## Phase 3 — Authentication, roles, match assignment authorization, and audit

- [ ] Configure invite-only Supabase Auth: disable public sign-up, configure custom SMTP and invite redirect URLs, raise the email rate limit as needed.
- [ ] Use asymmetric JWT signing keys; verify tokens in Express (`supabase.auth.getClaims()` or JWKS) for HTTP and at the Socket.IO handshake. Keep the secret key backend-only.
- [ ] Load the `admin_accounts` row on every protected request; reject disabled or missing accounts with 403. Do not trust role or assignment data from token claims.
- [ ] Implement role middleware for non-scoring routes: manager-or-above for tournaments, sports, teams, matches, assignments, and reviews; Super Admin only for manager/Super Admin account administration.
- [ ] Implement invite flows: Super Admin invites managers/Super Admins; managers invite operators only (server rejects any other role). Use `auth.admin.inviteUserByEmail` server-side; audit every account change.
- [ ] Implement the scoring chain from `architecture.md`: token → active account → active assignment → server-time window → SCORE → role-aware match state → device lease. LIVE and REJECTED/OPERATOR use the valid assigned scorer. REJECTED/MANAGER requires a self-assigned Tournament Manager or Super Admin; operators remain locked out. Retain the documented 401/403/409 responses, reasons and audit.
- [ ] Never rely only on hidden UI buttons or room membership.
- [ ] Implement audit helpers storing actor, action, entity, timestamp, request/correlation ID, before/after summary, and reason. Audit assignments, revocations, reassignments, self-assignments, reviews, overrides, and corrections.
- [ ] Add authorization tests (HTTP and sockets):
  - anonymous public GET allowed; anonymous mutation denied;
  - operator scoring an unassigned match → 403; before `valid_from` → 403; after `valid_until` → 403; revoked → 403 on the next command; submitted/approved match → 409; no lease → 409;
  - operator cannot reach tournament, team, match, user, or review routes;
  - manager cannot invite managers or Super Admins; manager can manage every tournament and sport;
  - disabled account denied.
  - rejected OPERATOR route permits the valid assigned scorer; rejected MANAGER route denies operators and permits only a valid self-assigned manager/Super Admin; missing, expired or revoked assignment and missing lease still fail;
  - manager takeover revokes the old assignment and creates the self-assignment in one audited transaction; resubmission and independent approval remain required.
- [ ] Redact tokens, credentials, and unnecessary player personal data from logs.

**Exit criteria:** permission tests cover every role on HTTP and sockets; revocation takes effect on the next request; no sport-scoped admin logic exists; every privileged mutation produces an auditable record.

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

- [ ] Fetch authoritative public snapshot before joining relevant tournament/sport/match Socket.IO rooms.
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
- [ ] Add security checks for public data minimization, RLS deny-all coverage, admin/operator route protection, input validation, CORS/origin, rate limits, secret handling, and log redaction.
- [ ] Add backup/restore rehearsal (Supabase backups on Pro, or scheduled `pg_dump` from CI on Free), health checks, structured logs, error reporting, and an event-day runbook (unpause project if on Free, verify SMTP, verify migrations deployed).
- [ ] Confirm all domain statuses have accessible text/icon labels and do not depend on color alone.
- [ ] Confirm logo integration once asset arrives: header, tournament, sport, match, admin, operator, mobile; no distortion and appropriate contrast.

## Phase 12 — Multi-instance capacity demo and honest reporting

- [ ] Package persistent Node/Socket.IO server and verify WebSocket upgrades through selected load balancer.
- [ ] Add Redis Socket.IO adapter; verify cross-instance room delivery and reconnect behavior. Configure sticky sessions if polling fallback is enabled.
- [ ] Keep normal event deployment able to run on one instance; demonstrate scale-out using multiple stateless Node replicas.
- [ ] Build synthetic viewer harness using the real Socket.IO/Engine.IO protocol; monitor the generator to avoid client-side bottleneck.
- [ ] Run ramp tests (e.g. 100 → 500 → 1,000 → 3,000), stable soak, all-viewers-one-match hotspot, distribution across tournament sports, and reconnect burst.
- [ ] During load, issue representative score events and result approvals; verify delivery ordering, no loss/duplication, and no unauthorized mutation path.
- [ ] Record connect success, p50/p95/p99 update latency, errors, sequence gaps, CPU/memory/event-loop lag, DB pool/slow queries, Redis throughput, outbox lag, and egress.
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
- [ ] HTTP/socket inputs are runtime-validated and authorized; audit records identify actors and transitions, including assignments and overrides.
- [ ] Score event, projections, audit, and outbox are consistent and recoverable.
- [ ] All schema changes are migrations deployed by CI; RLS is enabled on every public table.
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
| End-to-end invitations/recovery | SMTP provider/domain and recovery policy | Blocked; authorized account owner. |
| Production release and capacity claims | Host, plan, credentials/ownership and measured pass thresholds | Blocked; authorized operations/product owner. |

These blocks apply to the dependent behavior, not every independent task. Record decisions in memory and update the existing authoritative contract before implementation. Record failed/untested cases honestly. Keep the handoff and task evidence current after agreed tests pass.
