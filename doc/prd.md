# Product Requirements: Thaparlympics Score Website

**Status:** Homepage frontend implemented; full scoring application remains planned. See `handoff.md` for the current implementation and route boundaries.
**Product name:** Thaparlympics (working event name; product name undecided)  
**Initial users:** Public spectators (anonymous, or with an optional Viewer account), Super Admins, Tournament Managers, and Match Operators  
**Initial sports:** Football, volleyball, basketball, table tennis, lawn tennis, and badminton  
**Expected live audience:** approximately 1,000 concurrent viewers

**Capacity demonstration target:** 3,000 simulated concurrent viewers; not yet tested

## 1. Product summary

Build a responsive sports website for phone users first. Support tablets, desktops and larger screens. The first event is Thaparlympics, with the six sports listed above. Spectators can follow tournaments, schedules, live matches and results. Managers set up tournaments, teams, rosters and matches. They assign verified operators to score each match. Accepted score actions update the match and its dependent public views.

**Homepage confirmed 8 October 2026:** the React frontend is implemented. It has a full-width header, Home and Tournaments links, and a Sports dropdown. It also has the approved title, athlete gallery, dot animation, live-match filters and horizontal card rows. Header sport links navigate to sport pages that show display fixtures (added 9 October 2026). Homepage sport buttons filter live matches in place. Tournament cards navigate to reserved detail routes.

Preserve the approved card colors, rounded shape, white details and native horizontal scrolling. Do not add a pause control, scroll arrows or View All. Match names, scores, clocks and columns are temporary display data. Tournament identities and dates are also temporary. Feature teams will replace this data after they agree its contract. Detail pages and backend services are not part of the completed homepage.

## 2. Goals

- Give spectators one public tournament index, then tournament pages with only that tournament's configured sports and dedicated pages for each sport.
- Show multiple scheduled, live, and completed matches on sport pages.
- Provide match detail pages.
- Separate administration from ground-level scoring: Super Admins manage accounts and everything else; Tournament Managers manage tournaments across all sports; Match Operators score only the matches assigned to them, temporarily.
- Let managers create teams identified by branch and year, add players, and assign players between active and substitute roster states. Management access is not restricted by sport.
- Let a manager configure the sports and sport-specific rules/settings when creating a tournament.
- Support exactly two semifinals and one final per tournament sport. Managers assign semifinal teams. Only approved semifinal winners advance. The final determines the champion.
- Allow managers to create custom matches outside the bracket; their effect on standings/statistics is configurable and still to be decided.
- Require review/approval by someone other than the submitter before a match result is marked final. Live scoring remains visible as provisional; approval/rejection and corrections are audited.
- Record detailed sport-specific scoring and recalculate match results and sport standings from scoring data.
- Keep the scoring workflow usable on a laptop, with a responsive mobile interface as a fallback.
- Queue match scoring actions while offline and synchronize them in order when connectivity returns, making accepted scores visible to spectators.
- Show post-submission score corrections to spectators and preserve a trace of all changes.
- Design public pages for approximately 1,000 concurrent viewers. Test the future live delivery path with 3,000 simulated clients before making a capacity claim.

## 3. Non-goals for the first release

- Player sign-in, personal profiles, or cross-sport career statistics. Optional Viewer accounts are not player profiles.
- An app-store mobile app; the product is a responsive website.
- The combined overall branch championship table; sport-level standings are the initial standings scope.
- A public archive or editing of past editions.
- Registration, payments, ticketing, livestreaming, chat, or social feeds.
- League/group stages or extra bracket rounds. The initial bracket is fixed to two semifinals and one final.
- Unconfirmed match formats, durations, tie-break procedures or overall event points. Organizers must decide these before implementation.
- Sports beyond the six initial choices, though the data model should allow later additions.
- Tournament-scoped managers or sport-scoped admin roles; operator permissions beyond `SCORE`.

## 4. User types and access

Roles are explicit (`SUPER_ADMIN`, `TOURNAMENT_MANAGER`, `MATCH_OPERATOR`); spectators need no account. Each account has one role, and Super Admin includes every manager capability.

### Spectator

- Visits without signing in. Can optionally create a Viewer account with a verified email or Google. A Viewer account adds no rights for now.
- Views public event, sport, team, match, score, player contribution, and sport-standing information.
- Sees whether a match is scheduled, live, paused, completed, or otherwise ended according to the configured status model.
- Sees a clear correction marker when a submitted or approved score is corrected (not for live undos).
- Receives updates without manually refreshing the page when online.

### Super Admin

- Core platform/event team with full access.
- Invites and disables Super Admins and Tournament Managers.
- Can do everything a Tournament Manager can.
- Can override the no-self-approval rule with a recorded reason (audited).
- Performs audited corrections and resolves administrative access issues.

### Tournament Manager

- Trusted organizer with access to every tournament (not tournament-scoped) and every enabled sport.
- Creates and manages tournaments, enables sports, and configures each sport's scoring/format.
- Creates sport-specific branch-year teams, players, and rosters.
- Creates scheduled or on-the-spot matches and assigns bracket teams.
- Assigns, revokes, and reassigns Match Operators; can invite `MATCH_OPERATOR` accounts only.
- Reviews results: approves, or rejects with a reason and a correction route. Cannot approve a result they submitted.
- Records decisions for ties, abandonments, forfeits, or other exceptional outcomes, with a reason.
- To score a match personally, assigns themselves first (audited).

### Match Operator

- Verified person invited by email and signed in through Clerk, by email or Google.
- Sees only matches with an active assignment ("My Matches").
- Can view the assigned match, start scoring, enter live scores, undo live actions freely, finish the match, and submit the result.
- Cannot create/edit tournaments or matches, change sport rules, modify teams/players, manage users, access unrelated matches, or approve results.
- Access is temporary and match-scoped. It ends when the assignment is revoked, `valid_until` passes, the result is submitted, or the result is approved and locked. If a reviewer rejects with the `OPERATOR` correction route, access reopens until resubmission. The account itself is never deleted when a match ends.

Operating rule: one active assignment per match and one primary scoring device per match (scorer lease). If the operator is unavailable, a manager revokes the assignment and assigns someone else.

## 5. Information architecture and core journeys

### Public routes (proposed)

- `/` — implemented homepage: hero, live-match sport filters, live cards and tournament cards.
- `/sports/{sport}` — implemented global sport pages from the header: Live, Upcoming and Past matches with display fixtures and a match detail dialog.
- `/tournaments/{tournament}` — tournament summary, enabled sports, live/upcoming matches, and results.
- `/tournaments/{tournament}/sports/{sport}` — that tournament sport's matches, schedule, standings, and configured leaders.
- `/matches/{match}` — detailed live/final score, score progression, player contributions, status, and correction notes.
- `/teams/{team}` — sport-specific roster and match results, if useful for the first edition.

### Manager / Super Admin routes (proposed)

- `/admin` — event operations overview and live-match status.
- `/admin/tournaments` — create/manage tournaments and choose enabled sports at creation.
- `/admin/tournaments/{tournament}/sports/{sport}` — sport-specific settings, teams, matches, bracket, and standings.
- `/admin/teams` — create teams; add and edit players; tile-based roster management; move players between active roster and substitutes.
- `/admin/matches` — create, schedule, assign participants, and manage match state.
- `/admin/matches/{match}/scorers` — assign, revoke, and reassign the match's scorer.
- `/admin/reviews` — result review queue.
- `/admin/access` — Super Admin only: invite/disable managers and Super Admins; view operator accounts.
- `/admin/settings` — tournament details, playing conditions, standings settings, and public event details.

### Match Operator routes (proposed)

- `/operator/matches` — My Matches: only matches with an active assignment.
- `/operator/matches/{match}/score` — sport-specific scoring console with connection/sync state.

The homepage, global sport pages and reserved tournament routes are registered in `frontend/src/app/App.jsx`; see `handoff.md`. Other routes above remain proposed. Coordinate route changes across teams and preserve existing navigation. Route visibility is a convenience; the server enforces every permission once protected features are implemented.

### Main journeys

1. Spectator opens the tournament index, chooses a tournament, chooses one of its configured sports, opens a live match, and follows the changing score and player contributions.
2. Super Admin invites Tournament Managers. A manager creates a tournament, selects its sports, and configures each sport.
3. Manager creates a branch-year team, adds players, and marks match-eligible players as active or substitutes.
4. Manager creates a match (scheduled or on the spot).
5. Manager opens the match, chooses Assign Scorer, enters the operator's email and an optional time window (for example Football SF1 → Rahul → SCORE → 09:30–12:30). The operator receives an invite, signs in, and sees only Football SF1 in My Matches.
6. Operator starts scoring and records sport events, undoing mistakes freely while live. Score events update the score, match state, player contributions, and sport standings; connected spectators receive the accepted update.
7. If the operator loses connectivity, queued events remain visibly pending and are submitted in their original order after reconnection, validated against the assignment by server time.
8. Operator finishes the match and submits the result; scoring locks. A different manager or Super Admin approves or rejects it. Approval finalizes the result and advances a semifinal winner. Rejection records a reason and either reopens the operator's access or routes correction to a manager. All transitions are audited.
9. If the operator is unavailable, the manager revokes the assignment and assigns a different operator; the change is audited.
10. A manager corrects an approved result; the system creates a new result version requiring another approval, recalculates dependent values, and displays a public correction marker.

## 6. Functional requirements

### Tournaments and sports

- Tournament is the primary public and admin navigation entity, with name, dates/status, venue/description, branding, and lifecycle.
- At tournament creation, select any subset of football, volleyball, basketball, table tennis, lawn tennis, and badminton. Do not assume every tournament contains every sport.
- Each enabled sport has independent settings, ruleset/version, team roster, bracket/matches, scoring model, and standings configuration.
- Use a shared tournament/bracket framework with sport-specific match and scoring engines; sport settings must not be flattened into generic score fields. Managers can configure the sport-specific format and scoring values for each tournament.
- The bracket is exactly two semifinal matches feeding one final for each configured tournament sport. A manager assigns teams to semifinal sides; approved semifinal winners advance to the final slots. No configurable additional bracket rounds in the initial release.
- Permit custom matches outside the bracket. Mark their origin/type clearly and do not include them in bracket progression; whether they affect standings/player statistics remains configurable/open.
- Support future tournament seasons/archives as separate tournament records; historical archive UX is not required for the first release.

### Teams and players

- Teams are separate per sport and identified by branch + year.
- Each sport has its own roster; players are not assumed to share one cross-sport identity record.
- Managers can add, edit, and remove/unassign roster entries before or during event operations, subject to match-history safeguards. Operators cannot modify teams or players.
- Store at least player display name, branch, year, captain marker, and optional jersey number.
- Support active/substitute assignment in a tile-based interface. Match-day selection behavior and squad-size limits remain configurable/open.
- Publicly show the agreed basic player details and match-specific contributions. Do not expose contact details, student IDs, or other sensitive personal information.

### Matches and schedules

- Support both scheduled matches and creating a match on the spot. Only managers and Super Admins create matches.
- Distinguish bracket matches from custom matches. Bracket matches have stage/slot and progression links; custom matches have no bracket slot.
- Allow a manager to build/edit the fixed bracket before affected matches start, assign eligible teams, and preview progression. Once scoring begins, changes require an audited correction/reopen flow.
- Permit overlapping matches across sports.
- Allow managers to configure date/time, venue/court/ground, participants, format, and status.
- Keep schedule and match state synchronized with the scoring record.
- Model results that are played, tied, abandoned, forfeited, or otherwise decided by a manager; detailed policies remain tournament/sport configuration.

### Scorer assignments

- A manager assigns one Match Operator per match with `SCORE` permission and an optional `valid_from`/`valid_until` window.
- Only one assignment per match can be active at a time. Reassigning revokes the current assignment (with reason) and creates a new one in one audited step.
- Assignment status is `ACTIVE` or `REVOKED`; expiry is derived from the window. With no `valid_until`, access lasts until the match is locked or the assignment is revoked.
- Access becomes invalid when the assignment is revoked, `valid_until` is reached, the result is submitted, or the result is approved and locked.
- Managers who score personally assign themselves first.

### Scoring, results, and standings

- Use separate sport-specific scoring interfaces and validated scoring rules.
- Store scoring as ordered actions/events, not just a manually overwritten total.
- Derive scorecards, player contributions, match outcome, and sport standings from accepted scoring records and configured rules.
- While a match is `LIVE`, the assigned operator can undo/correct any number of actions without extra permission or a reason. Each undo is a stored reversal action with actor and time; no public correction marker is shown.
- Corrections after submission or approval require a reason, are audited, and show a public correction marker. Recalculate dependent data after any correction.
- Surface validation errors before accepting invalid state transitions.
- Result workflow: `LIVE → PENDING_APPROVAL → APPROVED/FINAL`, or `PENDING_APPROVAL → REJECTED/CORRECTION`.
- The reviewer must differ from the submitter. A Super Admin can override this with a recorded reason (audited).
- On rejection, the reviewer records a reason and chooses `OPERATOR` or `MANAGER` correction.
- `OPERATOR` reopens scoring for the assigned scorer only while the assignment remains active and within its time window.
- `MANAGER` keeps Match Operators locked out. A Tournament Manager or Super Admin revokes the old assignment and assigns themselves in one audited transaction before correction. The same account, assignment, time-window, `SCORE` and device-lease checks still apply.
- Approved results are locked. Changing one creates a new audited result version and requires another approval.
- Result approval gates finalization, bracket advancement, and final-result-dependent standings. Combined cross-sport championship standings are not part of initial release.

### Live updates and offline entry

- Public viewers receive updates automatically while connected.
- The scoring view clearly distinguishes online, offline, queued, syncing, synced, and failed/requires-attention states.
- Persist an ordered local queue of scoring actions on the scoring device.
- Each action has a stable idempotency identifier and client sequence so retries do not double-score.
- On reconnect, submit actions in order and confirm authoritative server acceptance before presenting them as published.
- The server validates synced actions against the operator's assignment using server receipt time. If the window has ended or the assignment was revoked, sync pauses for manager resolution (extend the window or resolve).
- Handle rejected/stale actions visibly; never silently apply last-write-wins to scoring actions.
- Display pending/offline score state to the scorer, so local unsynced values are not mistaken for public scores.
- Browser storage limits, device failure behavior, multi-tab behavior, and offline conflict recovery require technical decisions during implementation planning.

### Authentication and authorization

- Anyone can create an account through Clerk with a verified email or Google. Clerk challenges suspicious sign-ups. Sign-up alone gives only the Viewer role, with public read access.
- Staff roles come only from invitations recorded in our database. Super Admins invite managers and Super Admins. Managers and Super Admins invite Match Operators. The backend sends invitations through the Clerk Invitations API.
- Spectator endpoints and data are read-only and need no account.
- Every protected request verifies the token and reads the active account and role from the database. Every scoring request also checks the match assignment, server-time window, `SCORE` permission, match state and device lease.
- A valid assigned scorer can score a `LIVE` match or a `REJECTED` match with `OPERATOR` correction. A `REJECTED` match with `MANAGER` correction accepts scores only from a self-assigned Tournament Manager or Super Admin. Other states remain locked. See the acceptance rule in `architecture.md`.
- An operator attempting to score an unassigned match receives 403 Forbidden. Never rely only on hiding UI buttons.
- Revocation and expiry take effect on the next request; the server does not rely on token claims for assignment state.
- There are no sport-scoped admin roles. Audit every privileged mutation, including assignments, revocations, reassignments, self-assignments, reviews, and overrides.
- Keep service credentials server-side. Browsers never connect to the database; all data flows through the backend.

## 7. Quality attributes

- Responsive laptop and mobile layouts; scoring optimized for laptop with viable mobile fallback.
- Scores and match state remain internally consistent when standings are recalculated.
- Real-time updates recover from disconnect/reconnect and refresh from authoritative state.
- Every scoring action, undo, and correction is traceable to an account and time.
- Public pages should load without login and should not expose private account, assignment, or audit data.
- Use accessible labels, keyboard-operable scoring controls, visible contrast, and clear status text.
- Keep scoring flows low-friction under event conditions, where rapid repeated input and interrupted networks are expected.
- Keep audience estimates separate from test evidence. The expected audience is approximately 1,000 concurrent viewers. The 3,000-client target is a synthetic test, not measured capacity. Record the tested build, topology, workload and results in `tasks.md` before claiming capacity.
- Live score delivery should be room-scoped by match/sport, recover from reconnect by fetching an authoritative snapshot, and not issue one database query per connected spectator for every update.
- No team device needs to keep a database running; all environments are hosted and schema changes deploy from CI.

## 8. Success measures (to confirm)

- A spectator can reach a live match from the landing page in a few taps/clicks.
- An operator can enter a valid scoring action and observe it reflected in the match view and derived standings after server acceptance.
- Reconnection synchronizes queued actions in order without duplication.
- Unauthorized users cannot mutate a score or access admin routes.
- An operator receives 403 when scoring or opening an unassigned match.
- A revoked or expired operator is blocked on their next scoring command.
- A submitter cannot approve their own result unless a Super Admin override with a reason is recorded.
- A Tournament Manager cannot create Tournament Managers or Super Admins.
- A manager can correct an approved result and the new result version, audit record, re-approval, and public correction marker agree.
- A complete first edition can be configured without code changes for its team list, match schedule, and chosen formats.
- Staging load test reaches 3,000 simulated WebSocket clients under the agreed test profile without score-action loss/duplication; event-to-screen latency/error thresholds must be selected before the test.
- Load-test report distinguishes test clients from actual event viewers and captures Worker and Durable Object request counts, database, network, reconnect, and latency measurements.

## 9. Decisions still open

See `memory.md` for the complete question register. The bracket is decided: exactly two semifinals and one final. Match formats, scoring values, standings and custom-match statistics remain open. Other open items include roster limits, squad rules, schedule, venue and brand assets. Backend open items (paid gate, Facebook sign-in, rate-limit threshold, privacy contact, load-test thresholds, management features) are in `memory.md`.

Before work that depends on an open item, record the user's decision in `memory.md`. Update the affected requirement, rule or architecture contract and task acceptance checks. Do not infer a rule from the homepage's sample data. Independent work can continue when it does not depend on that decision. Record a feature as verified only after its required checks pass; name untested cases and limits in `tasks.md`.
