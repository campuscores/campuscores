# Implementation Tasks: Thaparlympics Score Website

**Status:** Detailed implementation backlog; sport formats and selected operating policies remain open inputs.  
**Stack:** React/Vite + JavaScript; Node/Express + Socket.IO; PostgreSQL; Redis Socket.IO adapter for multi-instance mode; Supabase Auth for invited admins.  
**Expected audience:** 50–100 actual viewers. **Capacity demonstration:** 3,000 simulated clients only, pending a measured load test.

## 0. Product decisions agents must preserve

- The top-level public entity is a tournament: tournament index → tournament → enabled sport → matches → match detail.
- On tournament creation, the organizer selects a subset of football, volleyball, basketball, table tennis, lawn tennis, and badminton.
- A tournament sport has its own validated, configurable scoring format and point values. Do not treat unlike sports as a single generic score counter; share configuration/versioning infrastructure but retain sport-specific domain engines.
- Each tournament sport's bracket is exactly two semifinals feeding one final. Admin assigns teams to the two semifinal matches; approved semifinal winners fill the final slots. Do not add other bracket rounds in this release.
- Custom matches are separate from the bracket and do not affect bracket progression.
- A completed score is provisional until an admin approves it. Only an approved result is final. Keep live score updates visible while the match is in progress.
- Admins are not scoped by sport. Any active admin can manage any enabled sport. Do not implement sport-admin assignment tables or filters. Account administration may remain limited to the organizer role if confirmed by the auth requirements.
- Use the Thapar logo site-wide when the user supplies the official asset. Do not fabricate or substitute an unofficial mark. Build a replaceable logo asset slot; logo file is intentionally pending.
- Implement in JavaScript, not TypeScript. PostgreSQL is the durable source of truth; Socket.IO/Redis are transport only.
- Never describe the 3,000 simulated-client goal as actual attendance or tested capacity until the load test is run and reported.

## Agent workflow and implementation conventions

1. Before coding, read `prd.md`, `architecture.md`, `rules.md`, `design.md`, and `memory.md`.
2. Start with the earliest incomplete phase. Record assumptions/questions in `memory.md`; do not resolve an open sports rule by guessing.
3. Keep changes cohesive and reviewable. Every schema change is a migration; every new scoring format gets domain tests before UI work depends on it.
4. Use runtime validation for every API/socket payload. Use JSDoc and linting; never add TypeScript unless the product decision changes.
5. Enforce permissions server-side. Anonymous spectator APIs are read-only and return only approved public fields.
6. Persist an accepted score action, projection update, audit record, and outbox event in a transaction. Broadcast only committed data.
7. Keep all admin sport permissions global. Test that an authenticated active admin can operate across all tournament sports and a spectator cannot mutate anything.
8. Maintain clear states: live/provisional, submitted for approval, approved/final, rejected/requires correction. Rejected or pending results must not be reported as final.
9. Update affected docs and this task list when requirements change; don't silently fork behavior between PRD, architecture, and rules.

## Phase 0 — Resolve implementation-blocking inputs

### Tournament and identity setup

- [ ] Confirm tournament name, dates/timezone, lifecycle/status labels, venue metadata, and whether multiple tournaments can be active concurrently.
- [ ] Confirm branch/year/division categories and team naming conventions.
- [ ] Confirm the invitation/account recovery process and whether only an organizer can create/disable admins. Do not add sport-specific admin scope.
- [ ] Confirm whether result approver must be a different admin from the scorer. Approval must be required either way; prevent self-approval only if that policy is confirmed.

### Sport formats and score configuration

- [ ] For each selected sport, record the tournament's actual format variants and configuration fields in `rules.md` before implementing its production scoring engine:
  - Football: team size, period duration, clock/stoppage handling, substitutions, cards, and tie resolution.
  - Volleyball: set count/target, win-by/cap, deciding set, lineup/rotation and substitution tracking.
  - Basketball: 5v5/3x3, period count/duration, clock/fouls/timeouts, overtime, and configured scoring values.
  - Table tennis: singles/doubles, points per game, win-by rule, games per match, service/end tracking, and optional team-tie format.
  - Lawn tennis: singles/doubles, advantage/no-ad, set count/format, tiebreak and final-set format.
  - Badminton: singles/doubles, games per match, target points, win-by/cap, and any alternate scoring.
- [ ] Specify which point/rule values an organizer can change at tournament creation and which must remain fixed by the sport engine. Validate configurations so impossible combinations cannot be saved.
- [ ] Decide which match statistics and player contributions must be captured for each sport; avoid collecting unused events.
- [ ] Decide result rules for ties, abandonments, forfeits, walkovers, and official correction after approval.
- [ ] Decide whether custom-match results are public and whether they count toward player statistics or standings. They never fill bracket slots.
- [ ] Decide standings columns, points, tie-break order, and treatment of pending/rejected/custom matches.
- [ ] Confirm roster/team limits, player eligibility, match-day squad rules, and substitute movement after match start.

### Branding and delivery

- [ ] Keep the site-wide Thapar logo component/slot ready, but leave the real image unset until supplied. Then add the approved asset, source/usage note, responsive variants if needed, and verify aspect ratio/contrast on every layout.
- [ ] Confirm host, region, domain, budget, account owner, supported browsers, and event-day support contact.
- [ ] Agree load-test pass thresholds: connection ramp/soak duration, message/update frequency, p95/p99 latency, reconnect profile, and acceptable errors.

## Phase 1 — Repository foundation and shared contracts

- [ ] Inspect repository structure and existing README before adding packages; preserve existing files and user changes.
- [ ] Add `web/` React + Vite JavaScript/JSX app and `server/` Node.js + Express JavaScript service using one documented package-manager/workspace convention.
- [ ] Add scripts for install, dev, lint, test, build, migration, seed, and local service startup; document exact prerequisites and commands in README.
- [ ] Add `.env.example` containing variable names only; validate required variables at server startup and never expose server secrets to Vite/browser code.
- [ ] Add formatting/lint conventions, JSDoc expectations, test runner, and runtime schema validation library.
- [ ] Add API contract conventions: JSON errors, request correlation ID, pagination/filter syntax, date/time handling, and public/private DTO separation.
- [ ] Add `/health` and `/ready` endpoints; readiness must detect required DB connectivity without exposing secrets or internal diagnostics publicly.
- [ ] Add a small smoke test proving web build, API boot, health response, and test database connection.

**Exit criteria:** a clean checkout can install, run, lint, test, and build using documented commands; no secrets or TypeScript have been introduced.

## Phase 2 — Database schema and migration foundation

- [ ] Add migration runner and documented forward/rollback policy. Migrations must be repeatable in CI against an empty database.
- [ ] Create core tables and indexes:
  - `tournaments`: name, slug, dates/timezone, status, venue/description, created/updated metadata.
  - `sports`: stable keys and display labels for the six supported sports.
  - `tournament_sports`: enabled sport per tournament; sport-specific format config, scoring values, rules source/version, roster policy, standings policy, and config version.
  - `teams`: tournament-sport scope, branch/year/division, display label, active/archive state.
  - `roster_players`: sport-team-scoped display name, branch/year as needed, captain marker, optional jersey, active state.
  - `matches`: tournament sport, two sides, schedule/venue, `bracket` or `custom` origin, status, score/result projection, format-config snapshot/version.
  - `match_roster`: selected players and active/substitute state for a match.
  - `tournament_brackets` and `bracket_slots`: exactly two semifinal matches and one final per tournament sport; final participant slots reference the approved semifinal winner.
  - `admin_accounts`: Supabase Auth identity, enabled state, global role. No sport assignment relation.
  - `score_actions`, `match_snapshots`, `player_match_stats`, `sport_standings`, `scorer_leases`, `match_result_reviews`, `admin_audit_log`, and `outbox_events`.
- [ ] Add foreign keys, check constraints, uniqueness rules, timestamps, status constraints, and indexes for tournament/sport/match public reads.
- [ ] Add constraints/tests preventing a custom match from occupying a bracket slot and preventing the bracket from having extra semifinal/final slots.
- [ ] Ensure one team cannot be assigned to both sides of the same semifinal unless an explicitly approved special rule supports it.
- [ ] Store immutable-at-match-start format config snapshots so changing tournament defaults cannot reinterpret an in-progress match.
- [ ] Seed synthetic tournament data only in development/test. Clearly mark seeded users, teams, and scores as fake.

**Exit criteria:** migrations build the schema from scratch, constraints reject invalid bracket/match relationships, and seeds create a tournament with multiple enabled sports and pending/approved sample results.

## Phase 3 — Authentication, global admin authorization, and audit

- [ ] Configure invite-only Supabase Auth; disable public admin sign-up.
- [ ] Implement identity verification middleware for HTTP and Socket.IO, account enabled-state check, secure session handling, and logout/expiry behavior.
- [ ] Define global roles: spectator (anonymous/read-only), active admin (all tournament sports), and optional organizer capability (admin account management). Do not create sport-specific permission or assignment tables.
- [ ] Implement organizer-only invite/disable/reset flows if confirmed; audit account changes.
- [ ] Protect every mutation route and socket command with admin checks; never rely only on hidden UI buttons or room membership.
- [ ] Add authorization tests: anonymous public GET allowed; anonymous mutation denied; active admin can manage every configured sport; disabled admin denied; invalid tournament/match scope denied.
- [ ] Implement audit helpers storing actor, action, entity, timestamp, request/correlation ID, before/after summary, and reason for consequential decisions.
- [ ] Redact tokens, credentials, and unnecessary player personal data from logs.

**Exit criteria:** permission tests cover both HTTP and sockets; no sport-admin assignment logic exists; every admin mutation produces an auditable record.

## Phase 4 — Tournament creation and sports configuration

- [ ] Implement organizer/admin tournament create, edit, publish/archive, and status transitions with validation.
- [ ] At tournament creation, require selection of one or more supported sports; reject unknown/duplicate sports.
- [ ] Build a configuration wizard that opens a sport-specific settings form for every selected sport.
- [ ] Make configurable values explicit, typed, bounded, and versioned (for example points per scoring action, periods/sets/games, target score, win-by margin, cap, and tie resolution as appropriate to that sport).
- [ ] Provide a readable rules/config summary and confirmation before publishing; show defaults as proposed defaults, not as event-confirmed rules.
- [ ] Reject config edits that would invalidate a live match. For safe changes, increment config version and preserve existing match snapshots.
- [ ] Build tournament index/detail pages and sport sub-navigation based on the enabled-sport list; hide disabled sports.
- [ ] Add empty, draft, published, ongoing, completed, and archived states only where the lifecycle decision supports them.

**Exit criteria:** an admin can create a tournament, enable a subset of sports, set distinct sport formats/points, and see only those sports publicly; invalid configuration cannot be published.

## Phase 5 — Teams, roster and match setup

- [ ] Implement teams per tournament sport, including branch/year/division values and duplicate detection.
- [ ] Implement roster create/edit/archive with display name, captain marker, optional jersey number, and agreed eligibility fields.
- [ ] Implement tile-based roster UI with keyboard/touch-accessible actions for available, match-active, and substitute states; drag-and-drop must not be the only interaction.
- [ ] Implement match-day squad selection and enforce configured roster/substitute constraints.
- [ ] Prevent destructive deletion of a player/team referenced by match history; use archived/inactive state instead.
- [ ] Implement scheduled match creation and custom match creation outside the bracket. Require sport, teams/sides, format snapshot, match label/type, date/time/venue as applicable.
- [ ] Clearly mark custom matches in admin and public UI; guarantee no custom match triggers bracket progression.
- [ ] Add match lifecycle transitions (scheduled → live → submitted/pending review → approved/final, or rejected/correction) with server-side validation.
- [ ] Add duplicate fixture warnings, unavailable-team validation, missing roster warnings, and schedule overlap warnings without blocking intentional overlaps across sports.

**Exit criteria:** admin can set up teams/rosters, select match squads, create scheduled and custom matches, and invalid lifecycle transitions are rejected.

## Phase 6 — Fixed semifinal/final bracket

- [ ] Implement bracket setup per tournament sport with exactly semifinal A, semifinal B, and final.
- [ ] Allow admin to assign four eligible teams to semifinal sides and preview the full bracket before publishing.
- [ ] Prevent duplicate/missing team assignments; support an explicit TBD slot only if organizer confirms byes/late assignment are needed.
- [ ] Create the two semifinal match records and the final with participant slots linked to semifinal winners.
- [ ] Keep final slots unresolved until the corresponding semifinal result is approved; a merely live or submitted result must not advance a team.
- [ ] On semifinal approval, transactionally set the corresponding final participant and write an audit/outbox event.
- [ ] On rejection, keep the bracket unchanged and return the semifinal result to correction workflow.
- [ ] On correction/reversal of an already approved semifinal, mark downstream final slot/match as requiring admin review; never silently swap participants in a live or finalized final.
- [ ] Lock bracket team assignment once a semifinal starts. Provide audited admin correction/reopen flow for exceptional cases.
- [ ] Build accessible bracket UI for public and admin, including empty, pending, approved, rejected, live, and final states.

**Exit criteria:** only the approved winner of each semifinal fills the final; the bracket contains no other rounds and custom matches remain separate.

## Phase 7 — Sport scoring engines and configurable point systems

### Shared score-command infrastructure

- [ ] Define a common versioned score-action envelope: action ID, match ID, sport key, rules/config version, client sequence, action type/payload, actor/device metadata, and server acceptance metadata.
- [ ] Validate action payload against the specific sport's runtime schema and the match's frozen configuration.
- [ ] Enforce idempotency, monotonic server sequence per match, legal state transitions, and atomic action/projection/audit/outbox persistence.
- [ ] Implement deterministic rebuild of score snapshot and player-match contributions from accepted actions.
- [ ] Implement correction as linked compensating/replacement actions with reason and actor; never erase accepted history.

### Sport-specific engines (build only after rules are confirmed)

- [ ] Football: configurable team size/periods/clock; goals, own goals if required, cards, substitutions, optional scorer/assist, configured tie procedure; derive score and result.
- [ ] Volleyball: rally points by set; configured sets-to-win, target/win-by/cap and deciding set; optional lineup/rotation, substitutions, timeout/fault detail as agreed.
- [ ] Basketball: configurable periods/clock; configurable scoring values (e.g. 1/2/3 as confirmed), player attribution, team/player fouls and timeouts only if required; overtime/tie rule.
- [ ] Table tennis: point/rally and game progression; configured target/win-by, games-to-win, singles/doubles; server/end tracking and team-tie orchestration only if selected.
- [ ] Lawn tennis: point → game → set → match progression; configurable advantage/no-ad, set and tiebreak/final-set variants; singles/doubles participants.
- [ ] Badminton: rally scoring; configured game target, win-by/cap, games-to-win; singles/doubles and alternative scoring when explicitly selected.
- [ ] For each configured scoring value, validate allowed values and derive results from actions; do not allow manual total edits to bypass the event log.
- [ ] Add boundary tests for deuce/win-by/cap, period/set transitions, tiebreaks, tied outcomes, invalid player/team/action, correction/replay, and config-version mismatch.
- [ ] Build sport-specific scorer consoles with laptop-first controls and responsive mobile fallback; make rapid input touch-safe and keyboard-operable.
- [ ] Show local pending/offline score separately from server-accepted live score.

**Exit criteria:** each enabled sport has a tested scoring engine for the organizer-confirmed format; score totals, match result, and match-only player stats are reproducible from action history.

## Phase 8 — Result submission and admin approval

- [ ] Add “submit result for approval” action after the scorer marks the match complete; persist the result version and freeze ordinary scoring edits while pending.
- [ ] Build admin review queue with tournament/sport/match, teams, final scorecard, event summary, corrections, and relevant match metadata.
- [ ] Implement approve and reject actions. Require a reason for rejection; approval records reviewer and timestamp.
- [ ] Ensure only approval moves a result to `final` and enables final-result-dependent standings/bracket progression.
- [ ] Ensure pending/rejected results remain visibly non-final to spectators and do not populate final bracket outcomes.
- [ ] On rejection, reopen the score for correction or require a correction submission; retain previous submission and review decision in history.
- [ ] On changes after approval, require explicit reopen/correction and a new approval; display a public corrected/reviewed indicator as appropriate.
- [ ] Make approval idempotent and transaction-safe; concurrent approve/reject attempts must not both succeed.
- [ ] Add tests for approved advancement, rejected no-advancement, pending visibility, duplicate review requests, correction after approval, and reviewer audit data.

**Exit criteria:** no result becomes final, advances the bracket, or enters confirmed standings before approval.

## Phase 9 — Public spectator experience

- [ ] Build public tournament index with status/date and live/upcoming/recent match summaries.
- [ ] Build tournament detail with enabled sports, bracket summary, and tournament matches.
- [ ] Build one page per enabled sport with match filters, custom-match labeling, bracket, and configured standings.
- [ ] Build match detail with sport-specific scorecard, provisional/final/review status, timeline, approved player contributions, and correction marker.
- [ ] Ensure pending/rejected result states are unambiguous and never styled as final.
- [ ] Keep player data to approved display fields; no personal profiles or login in this release.
- [ ] Add responsive mobile viewing, keyboard navigation, accessible labels, contrast, loading/empty/error states, and freshness/reconnecting indicator.
- [ ] Add site-wide brand header/footer/logo component with a replaceable official-logo asset path; before the file is supplied, use a neutral text placeholder and do not invent a Thapar mark.
- [ ] Serve immutable built assets from CDN where hosting permits; set correct cache/revalidation policy for live snapshots.

**Exit criteria:** a spectator can navigate tournament-first on desktop/mobile and distinguish live provisional scores from admin-approved finals.

## Phase 10 — Realtime delivery and offline scoring

- [ ] Fetch authoritative public snapshot before joining relevant tournament/sport/match Socket.IO rooms.
- [ ] Keep room subscriptions narrow and public payloads free of admin identity/audit detail.
- [ ] Publish committed changes from PostgreSQL outbox only; include event ID, sequence, schema version, and timestamp.
- [ ] Make clients deduplicate old events, detect sequence gaps, fetch a fresh snapshot, and recover after reconnect.
- [ ] Add visible realtime connected/stale/reconnecting states and low-frequency snapshot fallback.
- [ ] Persist scorer actions to IndexedDB before showing local queued acknowledgement; distinguish local queue from published score.
- [ ] Sync actions sequentially per match with same idempotency key on retry; pause on sequence/config/review conflicts and require admin resolution.
- [ ] Test network loss, browser refresh/restart, duplicate delivery, stale client, and action rejection; document storage quota/device-loss limitations.
- [ ] Verify score updates, result submissions, approvals, bracket advancement, and standings all propagate consistently to active spectators.

**Exit criteria:** connected clients converge on the authoritative approved state; offline retries do not duplicate score actions or falsely mark results finalized.

## Phase 11 — Quality, security, and operational readiness

- [ ] Add unit tests for all six configured score engines and bracket/result state transitions.
- [ ] Add integration tests for DB constraints, transactions, authorization, review workflow, idempotency, outbox retries, and projection rebuild.
- [ ] Add browser tests for tournament create, sport config, roster/match setup, scoring, approval/rejection, public updates, mobile layouts, and offline recovery.
- [ ] Add security checks for public data minimization, admin route protection, input validation, CORS/origin, rate limits, secret handling, and log redaction.
- [ ] Add backup/restore rehearsal, health checks, structured logs, error reporting, and an event-day runbook.
- [ ] Confirm all domain statuses have accessible text/icon labels and do not depend on color alone.
- [ ] Confirm logo integration once asset arrives: header, tournament, sport, match, admin, mobile; no distortion and appropriate contrast.

## Phase 12 — Multi-instance capacity demo and honest reporting

- [ ] Package persistent Node/Socket.IO server and verify WebSocket upgrades through selected load balancer.
- [ ] Add Redis Socket.IO adapter; verify cross-instance room delivery and reconnect behavior. Configure sticky sessions if polling fallback is enabled.
- [ ] Keep normal event deployment able to run on one instance; demonstrate scale-out using multiple stateless Node replicas.
- [ ] Build synthetic viewer harness using the real Socket.IO/Engine.IO protocol; monitor the generator to avoid client-side bottleneck.
- [ ] Run ramp tests (e.g. 100 → 500 → 1,000 → 3,000), stable soak, all-viewers-one-match hotspot, distribution across tournament sports, and reconnect burst.
- [ ] During load, issue representative score events and result approvals; verify delivery ordering, no loss/duplication, and no unauthorized mutation path.
- [ ] Record connect success, p50/p95/p99 update latency, errors, sequence gaps, CPU/memory/event-loop lag, DB pool/slow queries, Redis throughput, outbox lag, and egress.
- [ ] Record build SHA, topology, region, instance sizes, test profile, duration, findings, and limitations in `doc/load-test-report.md` after the run.
- [ ] Do not claim 3,000-viewer capacity until results and thresholds are measured and reported; keep synthetic clients separate from actual audience figures.

## Cross-feature acceptance checklist

- [ ] Requirement traces to PRD/rules and the user decision log.
- [ ] No TypeScript, sport-specific admin access, or extra bracket rounds have been introduced.
- [ ] Match sport config is validated, versioned, and frozen into the match at start.
- [ ] Bracket contains exactly two semifinals and one final; only approved semifinal results advance.
- [ ] Custom matches never affect bracket progression.
- [ ] Final result requires admin approval; pending/rejected results are not final standings inputs.
- [ ] HTTP/socket inputs are runtime-validated and authorized; audit records identify actors and transitions.
- [ ] Score event, projections, audit, and outbox are consistent and recoverable.
- [ ] UI covers loading, empty, error, pending review, rejected, approved, stale, and responsive states.
- [ ] Tests cover scoring boundaries, approvals, bracket progression, reconnects, and idempotent retries.
- [ ] Documentation and `memory.md` match implemented behavior.

## Deferred scope

- Player accounts, cross-sport player profiles, and long-term personal statistics.
- Combined cross-sport champion table/points formula.
- Historical tournament archive UX unless separately prioritized.
- Sports beyond the six initially selectable choices.
- Livestreaming, media uploads, registration/payments, chat, social feeds, or notifications.
- Thapar logo asset integration until the user supplies the official file/source.

## Current blockers

The shared foundation, tournament configuration UI, teams/rosters, generic result-approval workflow, and bracket scaffolding can proceed. Do not finish a sport's production scoring engine, standings policy, or custom-match aggregate behavior until `rules.md` records the event-specific format and data policy.
