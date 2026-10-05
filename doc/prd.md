# Product Requirements: Thaparlympics Score Website

**Status:** Discovery baseline  
**Product name:** Thaparlympics (working event name; product name undecided)  
**Initial users:** Public spectators and event admins  
**Initial sports:** Football, volleyball, basketball, table tennis, lawn tennis, and badminton  
**Expected live audience:** approximately 50–100 viewers  
**Capacity demonstration target:** 3,000 simulated concurrent viewers, subject to a real load test

## 1. Product summary

Build a responsive website for following Thaparlympics across multiple sports and simultaneous matches. Spectators can browse the event, each sport, match schedules, current scores, results, standings, and player contributions within a match. Authorized admins manage sport-specific teams and rosters and enter detailed live scores. A score update is the source for its match result and sport standings, so dependent public views update together.

The primary product object is a tournament, not a yearly event edition. The home page lists tournaments; each tournament enables its own chosen sports and configuration. Annual editions/archive can be added later without changing this hierarchy.

## 2. Goals

- Give spectators one public tournament index, then tournament pages with only that tournament's configured sports and dedicated pages for each sport.
- Show multiple scheduled, live, and completed matches on sport pages.
- Provide match detail pages with live score, match state, relevant play-by-play, and player contributions.
- Let an organizer create admin accounts; every active admin can administer every enabled sport.
- Let admins manage all enabled sports, create teams identified by branch and year, add players, and assign players between active and substitute roster states. Admin access is not restricted by sport.
- Let an organizer configure the sports and sport-specific rules/settings when creating a tournament.
- Support an admin-authored knockout bracket, initially including semifinals and a final: admins assign teams to semifinal sides, semifinal outcomes determine finalist slots, and the final determines the champion.
- Allow admins to create custom matches outside the bracket; their effect on standings/statistics is configurable and still to be decided.
- Require an admin review/approval before a match result is marked final. Live scoring remains visible as provisional; approval/rejection and corrections are audited.
- Record detailed sport-specific scoring and recalculate match results and sport standings from scoring data.
- Keep the scoring workflow usable on a laptop, with a responsive mobile admin interface as a fallback.
- Queue match scoring actions while offline and synchronize them in order when connectivity returns, making accepted scores visible to spectators.
- Show score corrections to spectators and preserve a trace of changes.
- Keep public pages efficient for 50–100 expected viewers while designing and load-testing the live delivery path for 3,000 simulated concurrent viewers.

## 3. Non-goals for the first release

- Player sign-in, personal profiles, or cross-sport career statistics.
- An app-store mobile app; the product is a responsive website.
- The combined overall branch championship table; sport-level standings are the initial standings scope.
- A public archive or editing of past editions.
- Registration, payments, ticketing, livestreaming, chat, or social feeds.
- Fixed tournament formats, match durations, tie-break procedures, or overall event points before organizers define them.
- Sports beyond the six initial choices, though the data model should allow later additions.

## 4. User types and access

### Spectator

- Visits without signing in.
- Views public event, sport, team, match, score, player contribution, and sport-standing information.
- Sees whether a match is scheduled, live, paused, completed, or otherwise ended according to the configured status model.
- Sees a clear correction marker when a published score is corrected.
- Receives updates without manually refreshing the page when online.

### Overall organizer (superadmin)

- Signs in to a protected admin area.
- Creates and disables admin accounts.
- Manages admin accounts. Admins can operate across all enabled tournament sports; there is no sport-specific admin assignment.
- Creates tournaments and selects/configures their sports.
- Can oversee all sports and resolve administrative access issues.

### Admin / scorer / reviewer

- Signs in and can administer any enabled sport in a tournament.
- Creates sport-specific branch-year teams and manages their rosters.
- Creates a match immediately or selects a pre-created match.
- Scores a match with the applicable sport scoring interface.
- Can correct a score; the system records who changed it and when, and public views show a correction marker.
- Submits completed match result for admin approval. An authorized admin approves or rejects it with a recorded reason; only approval changes result state to final.
- Records admin decisions for ties, abandonments, forfeits, or other exceptional outcomes, with a reason where appropriate.

Initial operating rule: one active scorer per match at a time. An authorized admin can hand scoring over. This limits conflicting writes, especially when offline actions later synchronize.

## 5. Information architecture and core journeys

### Public routes (proposed)

- `/` — tournament index and featured live matches.
- `/tournaments/{tournament}` — tournament summary, enabled sports, live/upcoming matches, and results.
- `/tournaments/{tournament}/sports/{sport}` — that tournament sport's matches, schedule, standings, and configured leaders.
- `/matches/{match}` — detailed live/final score, score progression, player contributions, status, and correction notes.
- `/teams/{team}` — sport-specific roster and match results, if useful for the first edition.

### Admin routes (proposed)

- `/admin` — event operations overview and live-match status.
- `/admin/teams` — create teams; add and edit players; tile-based roster management; move players between active roster and substitutes.
- `/admin/matches` — create, schedule, assign participants, and manage match state.
- `/admin/matches/{match}/score` — sport-specific scoring console with connection/sync state.
- `/admin/access` — organizer account administration; no sport assignment controls.
- `/admin/tournaments` — create/manage tournaments and choose enabled sports at creation.
- `/admin/tournaments/{tournament}/sports/{sport}` — sport-specific settings, teams, matches, bracket, and standings.
- `/admin/settings` — tournament details, playing conditions, standings settings, and public event details.

Routes are suggestions for information architecture, not a frozen URL contract.

### Main journeys

1. Spectator opens the tournament index, chooses a tournament, chooses one of its configured sports, opens a live match, and follows the changing score and player contributions.
2. Organizer creates a tournament, selects its sports, configures each sport, and invites admins with global sports access.
3. Admin creates a branch-year team, adds players, and marks match-eligible players as active or substitutes.
4. Admin creates or opens a match, starts scoring, and records sport events.
5. Score events update the score, match state, player contributions, and sport standings; connected spectators receive the accepted update.
6. If a scorer loses connectivity, queued events remain visibly pending and are submitted in their original order after reconnection.
7. Scoring admin submits a completed result for review; an admin approves or rejects it. Approval finalizes the result; rejection returns it for correction. All transitions are audited.
8. Admin corrects an event or result; the system recalculates dependent values, records the change, and displays a public correction marker.

## 6. Functional requirements

### Tournaments and sports

- Tournament is the primary public and admin navigation entity, with name, dates/status, venue/description, branding, and lifecycle.
- At tournament creation, select any subset of football, volleyball, basketball, table tennis, lawn tennis, and badminton. Do not assume every tournament contains every sport.
- Each enabled sport has independent settings, ruleset/version, team roster, bracket/matches, scoring model, and standings configuration.
- Use a shared tournament/bracket framework with sport-specific match and scoring engines; sport settings must not be flattened into generic score fields. Admins can configure the sport-specific format and scoring values for each tournament.
- The bracket is exactly two semifinal matches feeding one final for each configured tournament sport. Admin assigns teams to semifinal sides; approved semifinal winners advance to the final slots. No configurable additional bracket rounds in the initial release.
- Permit custom matches outside the bracket. Mark their origin/type clearly and do not include them in bracket progression; whether they affect standings/player statistics remains configurable/open.
- Support future tournament seasons/archives as separate tournament records; historical archive UX is not required for the first release.

### Teams and players

- Teams are separate per sport and identified by branch + year.
- Each sport has its own roster; players are not assumed to share one cross-sport identity record.
- Admin can add, edit, and remove/unassign roster entries before or during event operations, subject to match-history safeguards.
- Store at least player display name, branch, year, captain marker, and optional jersey number.
- Support active/substitute assignment in a tile-based interface. Match-day selection behavior and squad-size limits remain configurable/open.
- Publicly show the agreed basic player details and match-specific contributions. Do not expose contact details, student IDs, or other sensitive personal information.

### Matches and schedules

- Support both scheduled matches and creating a match on the spot.
- Distinguish bracket matches from custom matches. Bracket matches have stage/slot and progression links; custom matches have no bracket slot.
- Allow an admin to build/edit the fixed bracket before affected matches start, assign eligible teams, and preview progression. Once scoring begins, changes require an audited correction/reopen flow.
- Permit overlapping matches across sports.
- Allow organizers to configure date/time, venue/court/ground, participants, format, and status.
- Keep schedule and match state synchronized with the scoring record.
- Model results that are played, tied, abandoned, forfeited, or otherwise decided by an admin; detailed policies remain tournament/sport configuration.

### Scoring, results, and standings

- Use separate sport-specific scoring interfaces and validated scoring rules.
- Store scoring as ordered actions/events, not just a manually overwritten total.
- Derive scorecards, player contributions, match outcome, and sport standings from accepted scoring records and configured rules.
- Recalculate dependent data after an edit, deletion, or correction.
- Surface validation errors before accepting invalid state transitions.
- Provide an explicit correction marker in public match views and a detailed admin audit trail.
- Admin decisions handle exceptional match outcomes. A result approval state gates finalization and final-result-dependent standings. Combined cross-sport championship standings are not part of initial release.

### Live updates and offline entry

- Public viewers receive updates automatically while connected.
- Admin scoring view clearly distinguishes online, offline, queued, syncing, synced, and failed/requires-attention states.
- Persist an ordered local queue of scoring actions on the scoring device.
- Each action has a stable idempotency identifier and client sequence so retries do not double-score.
- On reconnect, submit actions in order and confirm authoritative server acceptance before presenting them as published.
- Handle rejected/stale actions visibly; never silently apply last-write-wins to scoring actions.
- Display pending/offline score state to the scorer, so local unsynced values are not mistaken for public scores.
- Browser storage limits, device failure behavior, multi-tab behavior, and offline conflict recovery require technical decisions during implementation planning.

### Admin authentication and authorization

- No public admin self-registration in initial release.
- Organizer creates admin accounts; all active admins can manage every enabled sport.
- Spectator endpoints and data are read-only.
- Enforce authorization in server/database policies for every mutation and private record.
- Admins are authorized across all enabled sports; do not implement sport-specific assignment checks. Keep public spectators read-only and audit every admin mutation.
- Keep service credentials server-side and restrict public database reads to intentionally public data.

## 7. Quality attributes

- Responsive laptop and mobile layouts; admin scoring optimized for laptop with viable mobile fallback.
- Scores and match state remain internally consistent when standings are recalculated.
- Real-time updates recover from disconnect/reconnect and refresh from authoritative state.
- Every scoring action and correction is traceable to an admin and time.
- Public pages should load without login and should not expose private admin data.
- Use accessible labels, keyboard-operable scoring controls, visible contrast, and clear status text.
- Keep scoring flows low-friction under event conditions, where rapid repeated input and interrupted networks are expected.
- Capacity target and evidence must be reported separately: expected actual audience is 50–100; 3,000 is only a synthetic load-test target. Do not claim verified 3,000-viewer capacity until a staging test report records the tested build, topology, workload, and results.
- Live score delivery should be room-scoped by match/sport, recover from reconnect by fetching an authoritative snapshot, and not issue one database query per connected spectator for every update.

## 8. Success measures (to confirm)

- A spectator can reach a live match from the landing page in a few taps/clicks.
- A scorer can enter a valid scoring action and observe it reflected in the match view and derived standings after server acceptance.
- Reconnection synchronizes queued actions in order without duplication.
- Unauthorized users cannot mutate a score or access admin routes.
- Admin can correct a score and the corrected state, audit record, and public correction marker agree.
- A complete first edition can be configured without code changes for its team list, match schedule, and chosen formats.
- Staging load test reaches 3,000 simulated Socket.IO clients under the agreed test profile without score-action loss/duplication; event-to-screen latency/error thresholds must be selected before the test.
- Load-test report distinguishes test clients from actual event viewers and captures server, database, Redis, network, reconnect, and latency measurements.

## 9. Decisions still open

See `doc/memory.md` for the complete question register. The most consequential open items are exact competition formats/playing conditions, standing points and tie-breaks, roster and match-day squad rules, schedule/venue details, and public brand assets.
