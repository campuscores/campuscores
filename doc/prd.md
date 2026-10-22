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
- Allow managers to create Regular_Matches (display name "Match") outside the bracket. They are public with their tournament and never advance the bracket. Their effect on standings/statistics is still to be decided (change 4, 22 October 2026).
- An assigned operator confirms the final score. It becomes final for viewers immediately and locks editing, with an audited confirmation. No manager review is required (confirmed 20 October 2026).
- Record detailed sport-specific scoring and recalculate match results and sport standings from scoring data.
- Keep the scoring workflow usable on a laptop, with a responsive mobile interface as a fallback.
- Queue match scoring actions while offline and synchronize them in order when connectivity returns, making accepted scores visible to spectators.
- Show accepted live scores as provisional and operator-confirmed results as final and locked.
- Design public pages for approximately 1,000 concurrent viewers. Test the future live delivery path with 3,000 simulated clients before making a capacity claim.

## 3. Non-goals for the first release

- Player sign-in, personal profiles, or cross-sport career statistics. Optional Viewer accounts are not player profiles.
- An app-store mobile app; the product is a responsive website.
- The combined overall branch championship table; sport-level standings are the initial standings scope.
- A public archive or editing of past editions.
- Registration, payments, ticketing, livestreaming, chat, or social feeds.
- League/group stages with their own standings, or extra bracket rounds. The initial bracket is fixed to two semifinals and one final. Managers can add Regular_Matches outside the bracket (change 4); they form no stage.
- Unconfirmed match formats, durations, tie-break procedures or overall event points. Organizers must decide these before implementation.
- Sports beyond the six initial choices, though the data model should allow later additions.
- Tournament-scoped managers or sport-scoped admin roles; operator permissions beyond `SCORE`.

## 4. User types and access

Roles are explicit (`SUPER_ADMIN`, `TOURNAMENT_MANAGER`, `MATCH_OPERATOR`); spectators need no account. Each account has one role, and Super Admin includes every manager capability.

### Spectator

- Visits without signing in. Can optionally create a Viewer account with a verified email or Google. A Viewer account adds no rights for now.
- Views public event, sport, team, match, score, player contribution, and sport-standing information.
- Sees whether a match is scheduled, live, paused, completed, or otherwise ended according to the configured status model.
- Show accepted live scores as provisional and operator-confirmed results as final and locked.
- Receives updates without manually refreshing the page when online.

### Super Admin

- Core platform/event team with full access.
- Invites every staff role. Lists staff, cancels pending invitations, disables and re-enables accounts, changes roles and transfers tournament ownership ([staff management](#staff-management-change-8-implemented-23-october-2026)).
- Can do everything a Tournament Manager can.
- Cannot edit a finalized result.
- Performs audited corrections and resolves administrative access issues.

### Tournament Manager

- Trusted organizer with access to every tournament (not tournament-scoped) and every enabled sport.
- Creates and manages tournaments, enables sports, and configures each sport's scoring/format.
- Creates sport-specific branch-year teams, players, and rosters.
- Creates scheduled or on-the-spot matches and assigns bracket teams.
- Assigns, revokes, and reassigns Match Operators; can invite `MATCH_OPERATOR` accounts only.
- Does not review results in the current operator-finalization workflow.
- Records decisions for ties, abandonments, forfeits, or other exceptional outcomes, with a reason.
- To score a match personally, assigns themselves first (audited).

### Match Operator

- Verified person invited by email and signed in through Clerk, by email or Google.
- Sees only matches with an active assignment ("My Matches").
- Can view the assigned match, start scoring, enter live scores, undo live actions freely, finish the match, and submit the result.
- Cannot create/edit tournaments or matches, modify teams/players, manage users or access unrelated matches. May select a validated scoring format before the first score.
- Access is temporary and match-scoped. Scoring ends at revocation, assignment expiry or final confirmation. Current-day eligibility uses Asia/Kolkata and database time. The account itself remains.

Operating rule: one active assignment per match and one primary scoring device per match (scorer lease). If the operator is unavailable, a manager revokes the assignment and assigns someone else.

## 5. Information architecture and core journeys

### Public routes (proposed)

- `/` — implemented homepage: hero, live-match sport filters, live cards and tournament cards.
- `/sports/{sport}` — implemented global sport pages from the header: Live, Upcoming and Past matches of that sport across every public tournament, date chips and a match detail dialog ([public pages](#public-tournament-pages-change-9-implemented-22-october-2026)).
- `/tournaments`, `/tournaments/{slug}` and `/tournaments/{slug}/{sport}` — implemented public tournament pages ([public pages](#public-tournament-pages-change-9-implemented-22-october-2026)). Standings and configured leaders on the tournament sport page remain planned.
- `/matches/{match}` — detailed live/final score, score progression, player contributions, status, and correction notes.
- `/teams/{team}` — sport-specific roster and match results, if useful for the first edition.

### Manager / Super Admin routes (proposed)

- `/admin` — event operations overview and live-match status.
- `/admin/tournaments` — create/manage tournaments and choose enabled sports at creation.
- `/admin/tournaments/{tournament}/sports/{sport}` — sport-specific settings, teams, matches, bracket, and standings.
- `/admin/teams` — create teams; add and edit players; tile-based roster management; move players between active roster and substitutes.
- `/admin/matches` — create, schedule, assign participants, and manage match state.
- `/admin/matches/{match}/scorers` — assign, revoke, and reassign the match's scorer.
- `/admin/access` — replaced by the implemented Super Admin routes ([staff management](#staff-management-change-8-implemented-23-october-2026)).
- `/admin/settings` — tournament details, playing conditions, standings settings, and public event details.

### Match Operator routes (proposed)

- `/operator/matches` — My Matches: only matches with an active assignment.
- `/operator/matches/{match}/score` — sport-specific scoring console with connection/sync state.

The homepage, global sport pages and public tournament pages are registered in `frontend/src/app/App.jsx`; see `handoff.md`. Other routes above remain proposed. Coordinate route changes across teams and preserve existing navigation. Route visibility is a convenience; the server enforces every permission once protected features are implemented.

### Sign-in and staff entry (change 5, implemented 22 October 2026)

- The public header shows no "My Matches" link and no staff navigation. Public pages load no Clerk code.
- `/sign-in` is a choice page with three options: "Continue as guest" (opens Home with no account), "Sign in as Match Scorer" (`/sign-in/scorer`) and "Sign in as Tournament Manager" (`/sign-in/manager`). There is no separate Super Admin entry. A signed-in user who opens `/sign-in` goes to the start screen of their role.
- After sign-in through either staff choice, `/start` accepts a pending invitation once, reads the role from `GET /api/me` and opens the start screen of that role, independent of the choice used: Match Scorer → My Matches (`/operator/matches`), Tournament Manager → Manager home (`/manage`), Super Admin → Admin home (`/admin`). An account with no staff role sees "This account has no staff access" and a Home link.
- Staff screens show the role's navigation (1 to 5 items, one marked current) and a "Back" link except on the start screen. A screen of another role shows "You do not have access to this page".
- The implemented Tournament Manager routes are `/manage`, `/manage/tournaments/new`, `/manage/tournaments/{slug}` (with `/setup/{step}`, `/details`, `/sports/{sport}` and `/sports/{sport}/teams`), `/manage/matches`, `/manage/matches/new` and `/manage/matches/{match}`. They replace the proposed `/admin/...` manager routes above. The route list is in [architecture.md](architecture.md#staff-roles-and-manager-console--slice-2-22-october-2026).

### Public tournament pages (change 9, implemented 22 October 2026)

- The header "Tournaments" link opens `/tournaments`. The homepage `/#tournaments` anchor still scrolls to the homepage tournament row.
- `/tournaments` shows Live, Upcoming and Past tournaments. `/tournaments/{slug}` shows the tournament's name, dates, venue, description and sport tiles. `/tournaments/{slug}/{sport}` shows that sport's matches of the tournament in Live, Upcoming and Past, with date chips and the match detail dialog. These pages replace the intentionally blank `/tournaments/{tournament}` route.
- Every match of an Ongoing or Completed tournament is public, including Regular_Matches (change 4). Draft and Archived tournaments are not public.
- The homepage tournament row shows only Live tournaments. With none, it keeps the heading and shows "No tournaments are live right now."
- A header Sports page shows that sport's matches from every public tournament: Live from the live feed, Upcoming and Past from the API, with date chips from the matches' India_Time dates.
- Grouping follows the phase that the API returns; device time never decides a phase. Every public date and time shows in India_Time with "IST". An empty final side shows "To be decided"; a Past match with no result shows "Not scored".
- Each page reads the API once on entry and on "Try again" only. While a read runs, each section keeps its heading and shows a text status. A failed read shows "Scores are unavailable right now." in the affected sections only. A missing tournament, a malformed key or a sport the tournament lacks shows "Tournament not found" with a link home.
- Live and Final scores from the live feed update the cards in place, also for a match that the cached read does not contain yet.
- Without `VITE_API_BASE` the pages show the display fixtures.
- Current limits: the public pages do not move focus to the heading on route entry. A live card stored before cards carried `tournamentId` applies on a tournament sport page only when the read contains its match.

### Staff management (change 8, implemented 23 October 2026)

Before this change, a Super Admin could only disable an account. A Super Admin now has six screens. API contracts are in [architecture.md](architecture.md#staff-roles-and-manager-console--slice-5-23-october-2026).

- Admin home (`/admin`) shows the Manager home sections across all tournaments and a "Pending invitations: N" link. Pending invitations is a child of Admin home.
- All tournaments (`/admin/tournaments`) lists every tournament with its owner and its Sport_Managers per sport. "Transfer ownership" asks for the new owner's email in a confirmation dialog. The new owner must be an active Tournament Manager. The previous owner keeps no scope in that tournament.
- Staff list (`/admin/staff`) lists every staff account: active first, then by email, 50 at a time with "Load more". The Role and Status filters stay in the URL, so reload, a shared link and Back keep them.
- Invite staff (`/admin/staff/invite`) invites a Super Admin, Tournament Manager or Match Scorer.
- Staff member detail (`/admin/staff/{id}`) shows the account, its owned tournaments, its sport scope and its active scorer assignments. An active account offers "Change role" and "Disable account"; a disabled account offers "Re-enable account". Each change opens a confirmation dialog that lists its effects.
- Pending invitations (`/admin/invitations`) lists waiting invitations, soonest expiry first, with the expiry in IST. "Cancel invitation" stops the invitation link.
- Rules:
  - A role change or a disable removes the account's active scorer assignments, its scoring device leases and its Sport_Manager scope. Re-enable keeps the role and restores none of them.
  - An owner of a tournament cannot change role or be disabled until a Super Admin transfers ownership. The screen shows "Transfer ownership of <tournament> first."
  - The last active Super Admin cannot be disabled or change role, also under two requests at the same time.
  - A repeated disable is refused with a plain message (409 `ALREADY_DISABLED`); a repeated re-enable is refused the same way.
  - Messages are plain sentences. No error code or request ID shows.
- Current limit: if the sign-in service reports a failure other than "not found" when an invitation is cancelled, the invitation stays pending and the screen says the sign-in service is unavailable. This includes a reply that means the invitation was already revoked in the sign-in service. Such a row stays pending until it expires ([memory.md](memory.md#staff-roles-and-manager-console--slice-5-23-october-2026)).

### Main journeys

1. Spectator opens the tournament index, chooses a tournament, chooses one of its configured sports, opens a live match, and follows the changing score and player contributions.
2. Super Admin invites Tournament Managers. A manager creates a tournament, selects its sports, and configures each sport.
3. Manager creates a branch-year team, adds players, and marks match-eligible players as active or substitutes.
4. Manager creates a match (scheduled or on the spot).
5. Manager opens the match, chooses Assign Scorer, enters the operator's email and an optional time window (for example Football SF1 → Rahul → SCORE → 09:30–12:30). The operator receives an invite, signs in, and sees only Football SF1 in My Matches.
6. Operator starts scoring and records sport events, undoing mistakes freely while live. Score events update the score, match state, player contributions, and sport standings; connected spectators receive the accepted update.
7. If the operator loses connectivity, queued events remain visibly pending and are submitted in their original order after reconnection, validated against the assignment by server time.
8. Operator checks the computed winner, corrects any live mistake, then confirms the final result. The server atomically finalizes and locks it. Viewers receive the final result; no manager review is required.
9. If the operator is unavailable, the manager revokes the assignment and assigns a different operator; the change is audited.
10. A finalized result cannot be edited or reopened. Bracket advancement and standings remain separate work.

## 6. Functional requirements

### Tournaments and sports

- Tournament is the primary public and admin navigation entity, with name, dates/status, venue/description, branding, and lifecycle.
- At tournament creation, select any subset of football, volleyball, basketball, table tennis, lawn tennis, and badminton. Do not assume every tournament contains every sport.
- Each enabled sport has independent settings, ruleset/version, team roster, bracket/matches, scoring model, and standings configuration.
- Use a shared tournament/bracket framework with sport-specific match and scoring engines; sport settings must not be flattened into generic score fields. Managers can configure the sport-specific format and scoring values for each tournament.
- The bracket is exactly two semifinal matches feeding one final for each configured tournament sport. A manager assigns teams to semifinal sides; approved semifinal winners advance to the final slots. No configurable additional bracket rounds in the initial release.
- Permit Regular_Matches outside the bracket (stored kind `CUSTOM`). The UI calls each one "Match" and never "custom". A Regular_Match is public with its tournament and is never part of bracket progression. Whether it affects standings/player statistics remains open.
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
- Managers create only two kinds of match: a Bracket_Match (stage SF1, SF2 or FINAL, with progression links) and a Regular_Match (no stage, no bracket slot, shown as "Match"). There is no separate custom match in the UI (change 4).
- Allow a manager to build/edit the fixed bracket before affected matches start, assign eligible teams, and preview progression. Once scoring begins, team/format changes stay locked; exceptional bracket conflicts need a separate agreed policy.
- Permit overlapping matches across sports.
- Allow managers to configure date/time, venue/court/ground, participants, format, and status.
- Keep schedule and match state synchronized with the scoring record.
- Model results that are played, tied, abandoned, forfeited, or otherwise decided by a manager; detailed policies remain tournament/sport configuration.

### Scorer assignments

- A manager assigns one Match Operator per match with `SCORE` permission and an optional `valid_from`/`valid_until` window.
- Only one assignment per match can be active at a time. Reassigning revokes the current assignment (with reason) and creates a new one in one audited step.
- Assignment status is `ACTIVE` or `REVOKED`; expiry is derived from the window. With no `valid_until`, access lasts until the match is locked or the assignment is revoked.
- Scoring access ends at revocation, assignment expiry or final confirmation. It also requires the match scheduled date to equal today in Asia/Kolkata.
- Managers who score personally assign themselves first.

### Scoring, results, and standings

- Use separate sport-specific scoring interfaces and validated scoring rules.
- Store scoring as ordered actions/events, not just a manually overwritten total.
- Derive scorecards, player contributions, match outcome, and sport standings from accepted scoring records and configured rules.
- While a match is `LIVE`, the assigned operator can undo/correct any number of actions without extra permission or a reason. Each undo is a stored reversal action with actor and time; no public correction marker is shown.
- Surface validation errors before accepting invalid state transitions.
- Result workflow: `SCHEDULED → LIVE → APPROVED/FINAL`. Start freezes the selected format. Operator final confirmation publishes the calculated winner and permanently locks edits. See [rules.md](rules.md#6-score-corrections-and-final-results).
- Bracket advancement and standings consume final results when those features are implemented. Combined standings remain deferred.

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
- A valid assigned scorer can start a current-day scheduled match and score it while live. Final matches reject all new writes; an exact final-confirmation retry is idempotent after current authorization checks. Legacy rejected states remain compatible with the existing gate, but the new flow does not create them.
- An operator attempting to score an unassigned match receives 403 Forbidden. Never rely only on hiding UI buttons.
- Revocation and expiry take effect on the next request; the server does not rely on token claims for assignment state.
- There are no sport-scoped admin roles. Audit every privileged mutation, including assignments, revocations, reassignments, self-assignments, reversals and final confirmations.
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
- The assigned operator can confirm the computed winner once; duplicate retries do not create another result.
- A Tournament Manager cannot create Tournament Managers or Super Admins.
- Every new scoring, undo and format command is refused after final confirmation, including after reload and from another device.
- A complete first edition can be configured without code changes for its team list, match schedule, and chosen formats.
- Staging load test reaches 3,000 simulated WebSocket clients under the agreed test profile without score-action loss/duplication; the pass thresholds are in [tasks.md](tasks.md#load-test-pass-thresholds).
- Load-test report distinguishes test clients from actual event viewers and captures Worker and Durable Object request counts, database, network, reconnect, and latency measurements.

## 9. Decisions still open

See `memory.md` for the complete question register. The bracket is decided: exactly two semifinals and one final. Per-match format controls are confirmed in rules.md; coaches still decide event defaults. Football tie/shoot-out policy, exceptional whole-match awards, standings and custom-match statistics remain open. Other open items include roster limits, squad rules, schedule, venue and brand assets. Backend open items (Facebook sign-in, static pages at the daily cap, management features) are in `memory.md`.

Before work that depends on an open item, record the user's decision in `memory.md`. Update the affected requirement, rule or architecture contract and task acceptance checks. Do not infer a rule from the homepage's sample data. Independent work can continue when it does not depend on that decision. Record a feature as verified only after its required checks pass; name untested cases and limits in `tasks.md`.
