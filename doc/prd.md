# Product Requirements: Thaparlympics Score Website

**Status:** Homepage, sport pages, public tournament pages, live delivery, real scoring and the staff area (manager console and Super Admin staff management) are implemented. Validated rosters, bracket advancement, standings and match detail pages remain planned. See `handoff.md` for the current implementation and route boundaries, and `tasks.md` for published state.
**Product name:** Thaparlympics (working event name; product name undecided)  
**Initial users:** Public spectators (anonymous; sign-in is for staff only), Super Admins, Tournament Managers, and Match Operators  
**Initial sports:** Football, volleyball, basketball, table tennis, lawn tennis, and badminton  
**Expected live audience:** approximately 1,000 concurrent viewers

**Capacity demonstration target:** 3,000 simulated concurrent viewers; not yet tested

## 1. Product summary

Build a responsive sports website for phone users first. Support tablets, desktops and larger screens. The first event is Thaparlympics, with the six sports listed above. Spectators can follow tournaments, schedules, live matches and results. Managers set up tournaments, teams, rosters and matches. They assign verified operators to score each match. Accepted score actions update the match and its dependent public views.

**Homepage confirmed 8 October 2026:** the React frontend is implemented. It has a full-width header, Home and Tournaments links, and a Sports dropdown. It also has the approved title, athlete gallery, dot animation, live-match filters and horizontal card rows. Header sport links navigate to the sport pages (added 9 October 2026). Homepage sport buttons filter live matches in place. Tournament cards open the public tournament pages.

Preserve the approved card colors, rounded shape, white details and native horizontal scrolling. Do not add a pause control, scroll arrows or View All. Match names, scores, clocks and columns are temporary display data. Without `VITE_API_BASE`, tournament identities and dates are also temporary display fixtures; with it, the pages show API data.

## 2. Goals

- Give spectators one public tournament index, then tournament pages with only that tournament's configured sports and dedicated pages for each sport.
- Show multiple scheduled, live, and completed matches on sport pages.
- Provide match detail pages.
- Separate administration from ground-level scoring: Super Admins manage accounts and every tournament; Tournament Managers manage only the tournaments they own and the tournament sports where they are a Sport_Manager; Match Operators score only the matches assigned to them, temporarily.
- Let managers create teams with a required name and optional branch, year and players (change 10). Moving players between active and substitute roster states needs validated rosters and remains planned.
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
- Sport-scoped admin roles (Sport_Manager is a scope, not a role); operator permissions beyond `SCORE`.

## 4. User types and access

Roles are explicit (`SUPER_ADMIN`, `TOURNAMENT_MANAGER`, `MATCH_OPERATOR`); spectators need no account. Each account has one role, and Super Admin includes every manager capability.

### Spectator

- Visits without signing in. Spectators do not sign in; an account without staff access sees only the no-access page ([decision](memory.md#staff-only-sign-in--24-october-2026)).
- Views public event, sport, team, match, score, player contribution, and sport-standing information.
- Sees whether a match is scheduled, live, paused, completed, or otherwise ended according to the configured status model.
- Show accepted live scores as provisional and operator-confirmed results as final and locked.
- Receives updates without manually refreshing the page when online.

### Super Admin

- Core platform/event team with full access.
- Invites every staff role. Lists staff, cancels pending invitations, disables and re-enables accounts, changes roles and transfers tournament ownership ([staff management](#staff-management)).
- Can do everything a Tournament Manager can.
- Cannot edit a finalized result.
- Performs audited corrections and resolves administrative access issues.

### Tournament Manager

- Trusted organizer (organizers, sports coaches, head coaches). Works only inside their Manager_Scope: the tournaments they own (the creator becomes the owner) and the tournament sports where an owner or a Super Admin added them as a Sport_Manager.
- Creates tournaments. As owner, edits them, changes their status, adds and removes sports and Sport_Managers, and deletes a Draft.
- In scope, sets each sport's Default_Format, creates teams (name required; branch, year and players optional) and creates scheduled matches and bracket stages.
- In scope, assigns, revokes, and reassigns Match Scorers; can invite `MATCH_OPERATOR` accounts only.
- Does not review results in the current operator-finalization workflow.
- Records decisions for ties, abandonments, forfeits, or other exceptional outcomes, with a reason.
- To score a match personally, assigns themselves first (audited).

### Match Operator

- Verified person invited by email and signed in through Clerk, by email or Google.
- Sees only matches with an active assignment ("My Matches").
- Can view the assigned match, start scoring, enter live scores, undo live actions freely, finish the match, and submit the result.
- Cannot create/edit tournaments or matches, modify teams/players, manage users or access unrelated matches. May select a validated scoring format before the first score.
- Access is temporary and match-scoped. Scoring ends at revocation, assignment expiry or final confirmation. START is allowed only from the scheduled time until the end of that India_Time day, by database time, in an Ongoing tournament ([rules.md](rules.md#1-rule-governance)). The account itself remains.

Operating rule: one active assignment per match and one primary scoring device per match (scorer lease). If the operator is unavailable, a manager revokes the assignment and assigns someone else.

## 5. Information architecture and core journeys

### Public routes

- `/` — implemented homepage: hero, live-match sport filters, live cards and tournament cards.
- `/sports/{sport}` — implemented global sport pages from the header: Live, Upcoming and Past matches of that sport across every public tournament, date chips and a match detail dialog ([public pages](#public-tournament-pages)).
- `/tournaments`, `/tournaments/{slug}` and `/tournaments/{slug}/{sport}` — implemented public tournament pages ([public pages](#public-tournament-pages)). Standings and configured leaders on the tournament sport page remain planned.
- `/matches/{match}` (planned; the match detail URL is Open) — detailed live/final score, score progression, player contributions, status, and correction notes.
- `/teams/{team}` (planned) — sport-specific roster and match results, if useful for the first edition.

Routes are registered in `frontend/src/app/App.jsx`; see `handoff.md`. Coordinate route changes across teams and preserve existing navigation. Route visibility is a convenience; the server enforces every permission.

### Public tournament pages

Implemented 22 October 2026 (change 9). Contract: [architecture.md](architecture.md#public-tournament-pages).

- The header "Tournaments" link opens `/tournaments`. The homepage `/#tournaments` anchor still scrolls to the homepage tournament row.
- `/tournaments` shows Live, Upcoming and Past tournaments. `/tournaments/{slug}` shows the tournament's name, dates, venue, description and sport tiles. `/tournaments/{slug}/{sport}` shows that sport's matches of the tournament in Live, Upcoming and Past, with date chips and the match detail dialog.
- Every match of an Ongoing or Completed tournament is public, including Regular_Matches (change 4). Draft and Archived tournaments are not public.
- The homepage tournament row shows only Live tournaments. With none, it keeps the heading and shows "No tournaments are live right now."
- A header Sports page shows that sport's matches from every public tournament: Live from the live feed, Upcoming and Past from the API, with date chips from the matches' India_Time dates.
- Grouping follows the phase that the API returns; device time never decides a phase. Every public date and time shows in India_Time with "IST". An empty final side shows "To be decided"; a Past match with no result shows "Not scored".
- Each page reads the API once on entry and on "Try again" only. While a read runs, each section keeps its heading and shows a text status. A failed read shows "Scores are unavailable right now." in the affected sections only. A missing tournament, a malformed key or a sport the tournament lacks shows "Tournament not found" with a link home.
- Live and Final scores from the live feed update the cards in place, also for a match that the cached read does not contain yet.
- Without `VITE_API_BASE` the pages show the display fixtures.
- Current limits: the public pages do not move focus to the heading on route entry. A live card stored before cards carried `tournamentId` applies on a tournament sport page only when the read contains its match.

### Staff area

Implemented 22–23 October 2026 (changes 1–8 and 10 in [memory.md](memory.md#staff-roles-and-manager-console--decisions)). Routes, API and limits: [architecture.md](architecture.md#staff-roles-and-manager-console).

#### Sign-in and staff entry

- The public header shows no "My Matches" link and no staff navigation. Public pages load no Clerk code.
- `/sign-in` is a choice page with three options: "Continue as guest" (opens Home with no account), "Sign in as Match Scorer" (`/sign-in/scorer`) and "Sign in as Tournament Manager" (`/sign-in/manager`). There is no separate Super Admin entry. A signed-in user who opens `/sign-in` goes to the start screen of their role.
- After sign-in through either staff choice, `/start` accepts a pending invitation once, reads the role from `GET /api/me` and opens the start screen of that role, independent of the choice used: Match Scorer → My Matches (`/operator/matches`), Tournament Manager → Manager home (`/manage`), Super Admin → Admin home (`/admin`). An account with no staff role sees "This account has no staff access" and a Home link.
- Staff screens show the role's navigation (2 to 5 items, one marked current) and a "Back" link except on the start screen. A screen of another role, or a tournament outside the caller's scope, shows "You do not have access to this page".
- Messages are plain sentences. No error code or request ID shows. Staff screens load data on entry and on "Try again" only.

#### Match Scorer

- My Matches (`/operator/matches`) lists only matches with an active assignment, in Live, Scheduled and Completed. A match whose day ended without a start is in Completed as "Not scored", with no scoring link.
- Score console (`/operator/matches/{match}/score`): the format form offers the tournament's default format first, then the official preset, then "Changed for this match". "Start match" is available only from the scheduled time until the end of that India_Time day in an Ongoing tournament; otherwise the console names the reason.

#### Manager console

A Super Admin sees every screen for every tournament. A Tournament Manager sees only their Manager_Scope; a Sport_Manager sees only their sports and no tournament controls.

- Manager home (`/manage`): today's matches in Live, Scheduled, Final and Not scored; matches of the next 7 days that need a scorer; the caller's tournaments with an "Owner" label. Primary action "Create tournament".
- Create tournament (`/manage/tournaments/new`, then `/setup/{step}`): five guided steps — details, sports (each with its default format summary), teams, matches and scorers (optional). A new tournament is a Draft. Reopening a Draft opens its first incomplete step.
- Tournament overview (`/manage/tournaments/{slug}`): status and dates, sports with format summary and team and match counts, Sport_Managers per sport (owner only), and the owner actions: edit details, change status, delete a Draft.
- Tournament statuses: Draft → Ongoing ("Publish", needs at least one sport) → Completed (no Live match) → Archived, and back from Archived to Completed and from Completed to Ongoing. Ongoing and Completed are public. Completed and Archived accept no change except a status change.
- Tournament details: name, dates, venue, description and a photo from the five venue photos or "Automatic". Dates that would leave matches outside them are refused with the count.
- Sport setup (`.../sports/{sport}`): the sport's default format, the Teams link and its Sport_Managers (owner only). A format change applies to matches that start later; a started match keeps its frozen format.
- Teams (`.../sports/{sport}/teams`): name required; branch, year and players optional ("Players" with jersey number and captain for team sports; "Player names" for badminton, table tennis and lawn tennis). A team used by a Live, Final or Not scored match cannot be edited; a team used by any match cannot be deleted. Player entries are never public.
- Matches (`/manage/matches`): every match in scope, filtered by tournament, sport, date and phase, with its scorer or "No scorer". Match editor: date and time (IST), stage (Match, SF1, SF2, Final), two sides (optional for the Final) and venue. A Live, Final or Not scored match shows a read-only summary. A match with no score action can be deleted while it is upcoming.
- Assign scorer (`/manage/matches/{match}/scorer`): by email, or "Score this match myself". An unknown email offers "Invite as Match Scorer". Reassigning or removing a scorer needs a reason. Managers set no time window. Invite scorer (`/manage/invite`) invites a Match Scorer; the invitation expires after 7 days.

#### Staff management

Implemented 23 October 2026 (change 8). Before this change, a Super Admin could only disable an account.

- Admin home (`/admin`) shows the Manager home sections across all tournaments and a "Pending invitations: N" link. Pending invitations is a child of Admin home.
- All tournaments (`/admin/tournaments`) lists every tournament with its owner and its Sport_Managers per sport. "Transfer ownership" asks for the new owner's email in a confirmation dialog. The new owner must be an active Tournament Manager. The previous owner keeps no scope in that tournament.
- Staff list (`/admin/staff`) lists every staff account: active first, then by email, 50 at a time with "Load more". The Role and Status filters stay in the URL, so reload, a shared link and Back keep them.
- Invite staff (`/admin/staff/invite`) invites a Super Admin, Tournament Manager or Match Scorer.
- Staff member detail (`/admin/staff/{id}`) shows the account, its owned tournaments, its sport scope and its active scorer assignments. An active account offers "Change role" and "Disable account"; a disabled account offers "Re-enable account". Each change opens a confirmation dialog that lists its effects.
- Pending invitations (`/admin/invitations`) lists waiting invitations, soonest expiry first, with the expiry in IST. "Cancel invitation" stops the invitation link.
- Rules:
  - A role change or a disable removes the account's active scorer assignments, its scoring device leases and its Sport_Manager scope. Re-enable keeps the role and restores none of them.
  - An owner of a tournament cannot change role, be disabled or delete their account until a Super Admin transfers ownership. The screen shows "Transfer ownership of <tournament> first."
  - The last active Super Admin cannot be disabled or change role, also under two requests at the same time.
  - A repeated disable or re-enable is refused with a plain message.
- Current limit: if the sign-in service reports a failure other than "not found" when an invitation is cancelled, the invitation stays pending and the screen says the sign-in service is unavailable. This includes a reply that means the invitation was already revoked in the sign-in service. Such a row stays pending until it expires ([Open item 4](memory.md#open-items-for-arnav)).

### Main journeys

1. Spectator opens the tournament index, chooses a tournament, chooses one of its configured sports, opens a live match, and follows the changing score and player contributions.
2. Super Admin invites Tournament Managers. A manager creates a tournament, selects its sports, and configures each sport.
3. Manager adds teams to a tournament sport: a name, and optional branch, year and players. (Marking match-eligible players as active or substitutes needs validated rosters and remains planned.)
4. Manager creates a match (scheduled or on the spot).
5. Manager opens the match, chooses Assign scorer and enters the scorer's email (for example Football SF1 → `rahul@example.test` → SCORE). An email with no account offers "Invite as Match Scorer"; the scorer accepts the invitation, signs in, the manager assigns the match, and the scorer sees only Football SF1 in My Matches.
6. Operator starts scoring and records sport events, undoing mistakes freely while live. Score events update the score, match state, player contributions, and sport standings; connected spectators receive the accepted update.
7. If the operator loses connectivity, queued events remain visibly pending and are submitted in their original order after reconnection, validated against the assignment by server time.
8. Operator checks the computed or manually selected early winner, corrects any live mistake, then confirms the final result. The server atomically finalizes and locks it. Viewers receive the final result; no manager review is required.
9. If the operator is unavailable, the manager revokes the assignment and assigns a different operator; the change is audited.
10. A finalized result cannot be edited or reopened. Bracket advancement and standings remain separate work.

## 6. Functional requirements

### Tournaments and sports

- Tournament is the primary public and admin navigation entity, with name, slug, dates, status, venue, description and a venue photo. Its owner and Sport_Managers form the Manager_Scope.
- Tournament status (change 3): Draft (private setup), Ongoing, Completed and Archived, with the changes in [Manager console](#manager-console). Ongoing and Completed are public; Draft and Archived are not.
- At tournament creation, select any subset of football, volleyball, basketball, table tennis, lawn tennis, and badminton. Do not assume every tournament contains every sport.
- Each enabled sport has independent settings, ruleset/version, team roster, bracket/matches, scoring model, and standings configuration.
- Use a shared tournament/bracket framework with sport-specific match and scoring engines; sport settings must not be flattened into generic score fields. Managers can configure the sport-specific format and scoring values for each tournament.
- The bracket is exactly two semifinal matches feeding one final for each configured tournament sport. A manager assigns teams to semifinal sides; approved semifinal winners advance to the final slots. No configurable additional bracket rounds in the initial release.
- Permit Regular_Matches outside the bracket (stored kind `CUSTOM`). The UI calls each one "Match" and never "custom". A Regular_Match is public with its tournament and is never part of bracket progression. Whether it affects standings/player statistics remains open.
- Support future tournament seasons/archives as separate tournament records; historical archive UX is not required for the first release.

### Teams and players

- Teams are separate per tournament sport. Only the name is required and unique per sport (ignoring case and outer spaces); branch and year are optional (change 10).
- Each sport has its own roster; players are not assumed to share one cross-sport identity record.
- Managers can add, edit, and remove/unassign roster entries before or during event operations, subject to match-history safeguards. Operators cannot modify teams or players.
- Implemented now: optional Player_Entries per team (name, and for team sports an optional jersey number and captain marker), never public. Planned: validated rosters with player display name, branch, year, captain marker and optional jersey number.
- Planned with validated rosters: active/substitute assignment in a tile-based interface. Match-day selection behavior and squad-size limits remain configurable/open.
- Publicly show the agreed basic player details and match-specific contributions. Do not expose contact details, student IDs, or other sensitive personal information.

### Matches and schedules

- Support both scheduled matches and creating a match on the spot. Only managers and Super Admins create matches.
- Managers create only two kinds of match: a Bracket_Match (stage SF1, SF2 or FINAL; automatic progression is planned) and a Regular_Match (no stage, no bracket slot, shown as "Match"). There is no separate custom match in the UI (change 4).
- Allow a manager to build/edit the fixed bracket before affected matches start, assign eligible teams, and preview progression. Once scoring begins, team/format changes stay locked; exceptional bracket conflicts need a separate agreed policy.
- Permit overlapping matches across sports.
- Allow managers to configure date/time, venue/court/ground, participants, format, and status.
- Keep schedule and match state synchronized with the scoring record.
- Model results that are played, tied, abandoned, forfeited, or otherwise decided by a manager; detailed policies remain tournament/sport configuration.

### Scorer assignments

- A manager in scope assigns one Match Operator per match with `SCORE` permission, by email or to themselves. Managers set no time window; the API still accepts the optional `valid_from`/`valid_until` bounds for compatibility (change 7).
- Only one assignment per match can be active at a time. Reassigning revokes the current assignment (with reason) and creates a new one in one audited step.
- Assignment status is `ACTIVE` or `REVOKED`; expiry is derived from the window. With no `valid_until`, access lasts until the match is locked or the assignment is revoked.
- Scoring access ends at revocation, assignment expiry or final confirmation. START also requires an Ongoing tournament and database time from the scheduled time until the end of that India_Time day (change 6). A match not started by then is Not scored and can never start.
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

- Sign-in is for staff (Arnav, 24 October 2026; [decision](memory.md#staff-only-sign-in--24-october-2026)). After sign-in, `/start` accepts a pending invitation. An account without an `ACTIVE` staff role (`GET /api/me` Viewer) stays signed in and sees "This account has no staff access" with **Check again** (accepts a later invitation) and **Sign out**. Every staff screen has a Sign out button in the staff navigation.
- Staff roles come only from invitations recorded in our database. Super Admins invite managers and Super Admins. Managers and Super Admins invite Match Operators. The backend sends invitations through the Clerk Invitations API.
- Spectator endpoints and data are read-only and need no account.
- Every protected request verifies the token and reads the active account and role from the database. Every scoring request also checks the match assignment, server-time window, `SCORE` permission, match state and device lease.
- A valid assigned scorer can start a scheduled match under the START rule and score it while live. Final matches reject all new writes; an exact final-confirmation retry is idempotent after current authorization checks. Legacy rejected states remain compatible with the existing gate, but the new flow does not create them.
- An operator attempting to score an unassigned match receives 403 Forbidden. Never rely only on hiding UI buttons.
- Revocation and expiry take effect on the next request; the server does not rely on token claims for assignment state.
- Manager requests also check the Manager_Scope (403 when out of scope). There are no sport-scoped admin roles. Audit every privileged mutation, including assignments, revocations, reassignments, self-assignments, reversals and final confirmations.
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
- The assigned operator can confirm the computed or manually selected early winner once; duplicate retries do not create another result.
- A Tournament Manager cannot create Tournament Managers or Super Admins.
- Every new scoring, undo and format command is refused after final confirmation, including after reload and from another device.
- A complete first edition can be configured without code changes for its team list, match schedule, and chosen formats.
- Staging load test reaches 3,000 simulated WebSocket clients under the agreed test profile without score-action loss/duplication; the pass thresholds are in [tasks.md](tasks.md#load-test-pass-thresholds).
- Load-test report distinguishes test clients from actual event viewers and captures Worker and Durable Object request counts, database, network, reconnect, and latency measurements.

## 9. Decisions still open

See `memory.md` for the complete question register. The bracket is decided: exactly two semifinals and one final. Per-match format controls are confirmed in rules.md; coaches still decide event defaults. Football tie/shoot-out policy, exceptional whole-match awards, standings and Regular_Match statistics remain open. Other open items include roster limits, squad rules, schedule, venue, brand assets and the match detail URL. Backend open items (Facebook sign-in, static pages at the daily cap, campus DNS filter) and the staff-area items for Arnav are in `memory.md`.

Before work that depends on an open item, record the user's decision in `memory.md`. Update the affected requirement, rule or architecture contract and task acceptance checks. Do not infer a rule from the homepage's sample data. Independent work can continue when it does not depend on that decision. Record a feature as verified only after its required checks pass; name untested cases and limits in `tasks.md`.

### Scoring finish and public result clarity — 24 October 2026

An assigned scorer can end an ongoing match early, choose its winner and review completed sets/periods only. The unfinished unit and unplayed slots do not count or display. Ending play can be undone before a separate permanent lock. Final review names the winner, shows the recorded score, explains the loss of scoring/Undo and requires acknowledgement. Show distinct queued and accepted lock states. Public card headers centre the match stage between sport and tournament; centre “<winner> won” below the score without a Final prefix. Preserve readable long names, keyboard focus, 44px controls and layouts from 320px phones to large screens. See the [decision](memory.md#early-match-finish-and-result-clarity--24-october-2026).
