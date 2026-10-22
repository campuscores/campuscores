# Project Memory and Decision Log

**Purpose:** Durable reference for future work in this repository. Update this file when the user makes a decision; do not convert an open question into a default silently.

## Backend and hosting decisions — 11 October 2026

These decisions replace the earlier Express, Socket.IO, Redis, Supabase Postgres and Supabase Auth plan. No backend code existed, so no implemented contract changes. [Architecture](architecture.md) owns the technical contract.

- **Budget:** $0, or student credits. Workers Paid ($5/month) is approved for event months only, and only if the measured request gate below requires it.
- **Frontend hosting:** Cloudflare Workers static assets serve `frontend/dist/` with the single-page application (SPA) fallback.
- **API:** one Cloudflare Worker with Hono, in JavaScript. Staff commands, including scoring, use HTTPS.
- **Live delivery:** SQLite-backed Durable Objects with the WebSocket Hibernation API. One room per match plus one `home` room for the homepage live row. Viewer sockets are receive-only. A viewer gets the stored public snapshot on connect, so viewers never wait for the database. Plain WebSockets replace Socket.IO; Redis is not needed.
- **Database:** Neon Postgres Free. One project for staging and one for production. Autoscaling is capped at 0.5 CU (the projects are currently at 2 CU; see [tasks.md](tasks.md#follow-up-tasks)). PostgreSQL stays the score source of truth.
- **Database connection:** Cloudflare Hyperdrive with the `pg` driver. The cached configuration serves public reads only. The uncached configuration serves sign-in, roles, assignments, leases and writes, so a revocation takes effect on the next request.
- **Migrations:** plain SQL files in `db/migrations/`, applied with `dbmate`. Only GitHub Actions applies them: merge to `develop` deploys staging, merge to `main` deploys production. CI tests every migration on a throwaway Postgres on the runner. No team device runs Postgres or Docker.
- **Backups:** a nightly encrypted `pg_dump` from GitHub Actions. Neon Free keeps only 6 hours of restore history. The workflow is disabled until private R2 storage exists ([Public repository and CI](#public-repository-and-ci--20-october-2026)).
- **Sign-in:** Clerk Free. Anyone can create an account with a verified email or with Google. Clerk challenges suspicious sign-ups. Google is the only social provider. Apple is not implemented: production needs a paid Apple developer account. Facebook is deferred (see Open items).
- **Roles:** an account without an `admin_accounts` row is a Viewer with public read access only. A signed-in Viewer gets nothing extra for now. Watching needs no account and never depends on Clerk. Staff roles come only from invitations recorded in our database. The server reads the role on every request. A Super Admin invites managers and Super Admins; managers invite Match Operators only. Clerk sends the invitation email, so no custom SMTP provider is needed.
- **Domain:** a free GitHub Student Pack domain (Namecheap .me, .TECH or name.com) on Cloudflare DNS. Clerk production does not accept `*.workers.dev` or `*.pages.dev`. Staging uses `workers.dev` with a Clerk development instance. Clerk DNS records stay "DNS only".
- **Abuse limits:** one Cloudflare Free rate-limit rule on API and sign-up paths, counted per IP. Public routes fail closed at the daily request cap. The Free plan has no Workers or Durable Objects usage alert, so the operations owner checks usage by hand on event days. Applied in production, confirmed by Arnav on 21 October 2026 ([architecture](architecture.md#rate-limiting-and-quota-failure)).
- **Paid gate:** if the measured peak exceeds about 70,000 Worker or Durable Object requests per day (less than 30% headroom), use Workers Paid during event months.
- **Fallback, not chosen:** Heroku with the GitHub Student credit ($13/month for 24 months) can run a long-lived Node server. It needs a card, works on personal accounts only, ends after 24 months and gives one 512 MB instance.

Rationale the next team needs:

- The outbox sweep runs every minute. It reads the last score-write time from the `home` room first and skips Neon when no score was written in the last 15 minutes. A query every minute would keep Neon awake and exceed its 100 free compute hours per month.
- Durable Object CPU is not the broadcast limit: each request or WebSocket message gets 30 seconds of CPU. Daily request counts are the limit. Outgoing WebSocket messages are free.

### Postgres major version — 20 October 2026

Neon staging and production run Postgres 18. CI service containers (`backend.yml`, `deploy.yml`, `backup.yml`), the backup `PG_MAJOR` and `postgresql-client` are 18. If Neon's major changes, change all of them together; `backup.yml` fails when the client and server majors differ from `PG_MAJOR`.

### Backend open items

Items marked **Open** are deferred for now. Independent backend work continues. Do not build the dependent behavior until the decision is recorded here. Closed items keep their numbers so that references stay valid.

1. **Closed (18 October 2026) — Workers Paid gate.** Decision: Workers Free ($0); no Workers Paid for Event_Months unless the inputs change. User-confirmed peak-day inputs: 1,000 viewers, 10 reconnects per viewer, 12 live matches, 200 score actions per match, 2,000 staff requests, 10 public reads per viewer, 1,440 sweeps. Result: 26,840 Worker requests, 19,640 DO requests, 12,000 DO row writes and 29,840 Hyperdrive queries per day, under the 70,000 gate. Estimate and cost model: [tasks.md](tasks.md). Reopen if a peak input changes materially: for example, about 3,000 viewers gives about 68,840 Worker requests, near the gate.
2. **Open — Facebook sign-in.** Question: add Facebook later? It needs a Meta developer app, a privacy policy, a data-deletion request path with a contact email, and Live mode. Owner: user. Affects: sign-in only; the Clerk dashboard adds it without code. Accept when the user approves it and the Meta app is live.
3. **Closed (21 October 2026) — rate-limit threshold.** Decision (Arnav): rule `api-flood-guard`, 300 requests per 10 s per IP, Block for 10 s, on `/api/` and `/sign-up` paths, not `/live/`. It is a flood guard only. Rationale and settings: [architecture.md](architecture.md#rate-limiting-and-quota-failure). Review Security analytics after the first event day; lower the threshold if abuse appears.
4. **Closed (21 October 2026) — privacy policy owner and contact.** Decision: owner Arnav; contact `bhatiaarnav05@gmail.com`, the same support email as the Google OAuth consent screen. The `/privacy` page shows it as a mailto link.
5. **Closed (19 October 2026) — load-test thresholds.** Decision (user-confirmed): the ramp, hold, room distribution, update rate, reconnect burst and pass criteria for 3,000 simulated clients are recorded, before any run, in [tasks.md](tasks.md#load-test-pass-thresholds); that list is authoritative. The run still needs a staging deploy.
6. **Open — management features.** The current backend plan has no endpoints to create tournaments, teams, rosters or matches. It also has no bracket advancement or standings. Manager result review was superseded by operator final confirmation on 20 October. No admin or manager screen exists for the built invite, assignment, revoke and disable endpoints. Production holds only bootstrap data until a follow-up feature adds them. Owner: user. Affects: event readiness. Accept when the follow-up feature is scoped and claimed; see follow-ups F1 and F2 in [tasks.md](tasks.md#follow-up-tasks).
7. **Open — static pages at the daily cap.** Cloudflare documents that static assets keep loading after the Worker reaches its daily request cap. This is untested; staging cannot reach the cap safely. Owner: implementing team. Affects: event-day risk. Accept when it is tested or accepted as a documented risk.
8. **Closed (18 October 2026) — package details.** The Clerk React SDK is `@clerk/react`, pinned at 6.17.8 in `frontend/package.json`; `@clerk/clerk-react` is deprecated. Sign-in against a real Clerk instance is not yet verified. Earlier part (17 October 2026): `@cloudflare/vitest-pool-workers` is deprecated and renamed to `@cloudflare/vitest-plugin`; the backend pins `@cloudflare/vitest-plugin` and configures it with `cloudflareTest()` in `backend/vitest.config.js`.
9. **Open — campus DNS filter risk (21 October 2026).** The campus Fortinet DNS filter returned its block address for some Clerk hostname lookups, but sign-in on campus Wi-Fi works now. Details: [architecture.md](architecture.md#sign-in-setup). Mitigation: ask campus IT to allow `campuscores.live` and `*.campuscores.live`. Owner: Arnav. Affects: staff and Viewer sign-in on event day; public viewing needs no sign-in. Accept when campus IT allows the domains, or when sign-in passes again on campus Wi-Fi shortly before the event.

## Public repository and CI — 20 October 2026

Confirmed by Arnav, 20 October 2026:

- **Public repository.** `campuscores/campuscores` became public on 20 October 2026. The commit author emails in the history are public. This is accepted; the history is not rewritten.
- **No license.** The repository has no `LICENSE` file, so the code stays "all rights reserved". Do not add a license without a new decision.
- **Fixture names.** The player names in the frontend display fixtures (`frontend/src/features/**/*Matches.js`, `sportFixtures.js`, `sampleMatches.js`, `operatorMatches.js`, `sampleTournaments.js`) are invented sample names. Real API data replaces them. Do not change them.
- **Images.** The hero artwork and sport backgrounds stay as they are, by decision. They are not a blocker.
- **CI.** GitHub Actions runs again: standard GitHub-hosted runners are free for public repositories ([GitHub billing docs](https://docs.github.com/en/actions/concepts/billing-and-usage)). Do not attach a self-hosted runner; on a public repository it can run fork pull request code on that machine. Checks that have not passed yet stay in [deferred-tests.md](deferred-tests.md) until CI clears them. The scoring integration was released to staging (`10a4b34`) and production (`1435628`) on 20 October 2026 ([tasks.md](tasks.md#current-task-claims)).
- **Release flow.** `develop` deploys the staging subdomain and `main` deploys production, both through `deploy.yml`. Arnav checks staging before a change goes to `main`.
- **CI on release only** (confirmed by Arnav, 20 October 2026). The full matrix took 10–15 minutes per change during feature development. `frontend.yml` and `backend.yml` now run only on pull requests to `main` and on manual dispatch. Developers run the local checks in [AGENTS.md](../AGENTS.md#verify-before-marking-complete) and push directly to `develop`. The `deploy.yml` gate still runs on every `develop` and `main` push: lint, backend database tests, Chromium and Pixel tests, migrations, build, deploy and smoke. Production safety is unchanged: `main` needs a pull request, the release pull request runs the full matrix, and Environment `production` needs a reviewer. Trade-off: failures that occur only on macOS, Windows, Firefox, WebKit or emulated iPhone and iPad appear at the release pull request, not at each `develop` commit. The open check is row 9 in [deferred-tests.md](deferred-tests.md).
- **Backup off.** `backup.yml` is disabled in GitHub (state `disabled_manually`), and its one artifact is deleted. In a public repository any signed-in GitHub user can download artifacts. Production has no event data yet.
- **GitHub security settings**, applied 20 October 2026:
  - Secret scanning, push protection and Dependabot alerts are on.
  - Ruleset `protect-main` (ID 25489363) on `main`: a pull request is required (0 approvals), force pushes and deletion are blocked, and no actor can bypass it. Direct pushes to `main` are rejected.
  - Ruleset `protect-develop` (ID 25499533) on `develop`: force pushes and deletion are blocked, and no actor can bypass it. Direct pushes are allowed (changed 20 October 2026; see **CI on release only** below).
  - Environment `production` requires reviewer `arnavbhatia2003`; self-review is allowed. Production still deploys only from `main`.
  - Workflows from fork pull requests need approval for all external contributors.
- **CI matrix:** option A stays. Windows runs `chromium` and `pixel`; Ubuntu and macOS run Firefox ([Documentation decisions](#documentation-decisions--9-october-2026)).

Deferred items (confirmed by Arnav, 20 October 2026). Start each item only on Arnav's explicit command. No team member or agent starts them otherwise.

1. **Deferred — Windows Firefox CI job (option D).** Task: add a separate parallel Windows job that runs only the `firefox` project with `--workers=1`, to restore Windows desktop Firefox coverage. Actions minutes cost is no longer a factor, because the repository is public. Owner: Arnav. Affects: `frontend.yml` and row 8 in [deferred-tests.md](deferred-tests.md). Accept when the Windows Firefox job is green on two consecutive runs without retries.
2. **Deferred — private R2 backups.** Task: store backups in a private Cloudflare R2 bucket and re-enable `backup.yml` with them. Give the backup job its own GitHub Environment (for example `production-backup`, `main` only). `backup.yml` now uses Environment `production`, which has a required reviewer, so each nightly run would wait for approval. Planned timing: after the final feature, before launch, but only when Arnav gives the command. Owner: Arnav. Affects: follow-up F12, row 7 in [deferred-tests.md](deferred-tests.md) and the launch blocker in [tasks.md](tasks.md#current-blockers).

## Staff roles and manager console — Slice 1, 22 October 2026

These decisions replace earlier records, as the spec's "Changes to earlier decisions" lists. Slice 1 delivers the backend (schema, scope, manager API, public read changes and the START rule); the manager and admin screens come in later slices. [architecture.md](architecture.md#staff-roles-and-manager-console--slice-1-22-october-2026) owns the contract; this section records the decisions.

- **Manager scope replaces global managers (change 1).** A Tournament_Manager now manages only the tournaments they own (`tournaments.owner_account_id`) and the Tournament_Sports listed for them in `tournament_sport_managers`. A Super_Admin keeps every capability everywhere. Match_Scorers keep the `SCORE` permission only. This replaces the "Tournament Managers are global, no tournament-scoped manager table" rule in [Confirmed direction](#confirmed-direction) and the product decisions in [tasks.md](tasks.md#0-product-decisions-agents-must-preserve).
- **Assignment scope (change 2).** `POST /api/matches/:id/assignments` and `POST /api/assignments/:id/revoke` now check `requireScope` after the match lock, so a Tournament_Manager can assign or revoke only for matches in their scope (403 `SCOPE_FORBIDDEN`). The manager API (`routes/manage.js`) and the public read changes are the rest of change 2.
- **Tournament statuses (change 3).** `DRAFT`, `PUBLISHED` become `DRAFT`, `ONGOING`, `COMPLETED`, `ARCHIVED` with a CHECK constraint; existing `PUBLISHED` rows become `ONGOING`. `DRAFT` and `ARCHIVED` are private; `ONGOING` and `COMPLETED` are public. Phases are derived, never stored.
- **START rule (change 6).** START is accepted only when the tournament is Ongoing and database time is at or after the scheduled time and before Match_Day_End (the next Event_Time_Zone midnight). A match not started by the end of its scheduled India_Time day becomes Not_Scored and can never start. `startDecision` returns `TOURNAMENT_NOT_ONGOING`, `START_TOO_EARLY` or `MATCH_DAY_OVER`; the retired `NOT_TODAY` code and `requireToday` are gone. Later commands of a Live match have no date check.
- **Event_Time_Zone module (change 6 support).** `shared/time.mjs` is the one place that defines the event zone (`name: 'Asia/Kolkata'`, `label: 'IST'`, `offsetMinutes: 330`). Every zone literal and "IST" label in the backend, frontend and shared code comes from it. A guard test (`backend/test/node/event-time-zone.spec.js`) fails the build on any other zone literal.

### Public phase clock — 21 October 2026

Confirmed by Arnav (Requirements 15.12, 17.6, 17.15, 17.16). Public reads fetch rows on the cached Hyperdrive pool with queries that contain no time function, so the rows stay cacheable; Hyperdrive marks a query that names `now()` or another non-immutable function as uncacheable. The Worker therefore computes every Tournament_Phase and Match_Phase from Worker_Time (`Date.now()`) with `shared/time.mjs` and returns `phase` on each row; no phase is stored or cached, and public responses get no HTTP or edge cache. The Frontend groups by the returned `phase` and never reads device time for a phase. Staff reads, staff writes and START use database `now()` instead, so a scorer and a viewer see the same India_Time day. Recorded here and in [architecture.md](architecture.md#staff-roles-and-manager-console--slice-1-22-october-2026); full rationale in the spec design "Recorded decision: public phase clock".

## Staff roles and manager console — Slice 2, 22 October 2026

Slice 2 delivers the staff entry and the Tournament_Manager screens, frontend only. [architecture.md](architecture.md#staff-roles-and-manager-console--slice-2-22-october-2026) owns the routes and contracts; this section records the decisions.

- **Regular matches are public (change 4).** The non-bracket match kind (stored `CUSTOM`) is a Regular_Match. The UI calls it "Match" and never "custom". Managers create only Bracket_Matches (SF1, SF2, FINAL) and Regular_Matches; there is no separate custom match. Every match of a public tournament is public. Regular_Matches never advance the bracket. This replaces the [rules.md](rules.md#3-shared-matchrules-configuration) statement that no league or group matches are added. Their effect on statistics and standings stays open ([Competition and rules](#competition-and-rules)).
- **Header and sign-in (change 5).** The public header shows no "My Matches" link and no staff navigation. `/sign-in` offers "Continue as guest", "Sign in as Match Scorer" and "Sign in as Tournament Manager", and no Super Admin entry. After either staff choice, `/start` opens the start screen of the role that `GET /api/me` returns, independent of the choice. This replaces the "My Matches nav tab, desktop + mobile" of the My Matches dashboard task in [tasks.md](tasks.md#current-task-claims).
- **Data router.** The app uses `createBrowserRouter` with one splat route around `App`, so the unsaved-changes guard can use `useBlocker`. Routes stay in `App.jsx`.
- **Design decision to confirm with Arnav — Live match editor.** The Match editor of a Live, Final or Not scored match shows a read-only summary with no form and no Primary_Action (spec design "Match editor": "read-only summary, no form"). Requirement 19.6 asks for exactly one Primary_Action per screen. The team follows the design rule; `frontend/tests/staff-layout.spec.js` checks 0 Primary_Actions on that screen. Owner: Arnav. This does not block other work. Accept when Arnav confirms the read-only screen or names its one action.

## Staff roles and manager console — Slice 3, 22 October 2026

Slice 3 delivers scorer assignment by email, the Assign scorer and Invite scorer screens, and the Score_Console side of the START rule. [architecture.md](architecture.md#staff-roles-and-manager-console--slice-3-22-october-2026) owns the contracts; this section records the decisions.

- **START rule in the Score_Console (change 6).** `GET /api/operator/matches` returns `canStart` and `startReason` from the same `startDecision` as START, with database `now()`. "Start match" is on only when `canStart` is true. The console reads `canStart` at page load and does not refresh it automatically; a scorer who opens the page early reloads after the start time. The server still decides every START.
- **Assignment windows in the UI (change 7).** Managers do not set Assignment windows. The Frontend never sends `validFrom` or `validUntil`; the API keeps accepting them for compatibility.
- **Assign by email or self.** A manager assigns a scorer by email or chooses "Score this match myself" (`{ self: true }`, audit action `SELF_ASSIGNED`). An unknown email offers "Invite as Match Scorer"; a pending invitation, another role or a disabled account is refused with a plain message below the email. Body forms and codes: [architecture.md](architecture.md#staff-roles-and-manager-console--slice-3-22-october-2026).
- **Not scored in My Matches (Requirement 15.4).** A `SCHEDULED` match whose day ended (`notScored`) moves from Scheduled to Completed, shows "Not scored" and has no scoring link. This updates the user-confirmed map in [Confirmed direction](#confirmed-direction).
- **Default format first.** The format form offers the Tournament default format first, then the Official_Preset, then "Changed for this match" (Requirement 10.7). A Regular_Match shows the stage "Match".
- **ConfirmDialog late close.** A native `close` event is queued. The `close` of an earlier opening could arrive after the dialog opened again and cancel the new dialog. `ConfirmDialog` now cancels only when the dialog is closed at that moment. This is the likely cause of the 5 flaky `manage-setup.spec.js` and `manage-matches.spec.js` dialog cases on Ubuntu (Slice 2 staging run); in the Slice 3 staging run they passed on the first attempt ([tasks.md](tasks.md#current-task-claims)); the release pull request matrix checks them again.
- **Wording to confirm with Arnav — START reason texts.** The design lists three texts: "You can start this match from 14:30 IST today.", "This match was not started on its day. It is marked Not scored." and "This tournament is not running." The team added two texts for cases the design does not name: "You can start this match from 14:30 IST on <day>." for a later day, and "This match has no start time yet." for a match with no scheduled time (`startReasonText` in [`labels.js`](../frontend/src/features/staff/labels.js)). Owner: Arnav. This does not block other work. Accept when Arnav confirms the two texts or gives other wording.

## Documentation decisions — 9 October 2026

- Canonical docs describe final accepted behavior and contracts. [Requirements](prd.md), [architecture](architecture.md), [design](design.md) and [rules](rules.md) own their contracts. [Handoff](handoff.md) maps current integration points. [Tasks](tasks.md) holds minimal ownership, state and verification evidence.
- Keep failed attempts, scratch HTML/Markdown, reports and machine paths out of shared docs and source. Retain detail only when it explains a current risk, compatibility constraint or security requirement. Keep durable asset sources and licenses in [asset-sources.md](asset-sources.md).
- Final feature completion requires applicable verification and a confirmed remote commit or PR. Local unpushed work is not shared complete. Follow [AGENTS.md](../AGENTS.md) for verification policy; record actual results and limits in [tasks.md](tasks.md).
- Required frontend CI checks run the same install, lint and build on Ubuntu, Windows and macOS. Ubuntu and macOS run all six Playwright projects (Chromium, Firefox, WebKit, emulated Pixel, iPhone and iPad). Windows runs Chromium and Pixel; Safari does not exist on Windows. Windows skips Firefox (decided 20 October 2026): users are mainly on phones and tablets, Ubuntu and macOS cover Firefox, and headless Firefox on Windows runners stalls automation calls until tests time out. A separate Windows Firefox job (option D) is deferred until Arnav's command ([Public repository and CI](#public-repository-and-ci--20-october-2026)). Each OS reports separately; one failure must not cancel the others. A three-OS pass requires remote job results. WebKit is not branded Safari, and emulation does not cover physical devices.

## Sport page decisions — 9 October 2026

- With `VITE_API_BASE`, sport pages read live/final public cards; Upcoming is empty until scheduling reads exist. Without it, pages show official-baseline display fixtures. Match format controls are confirmed in [rules.md](rules.md); coaches choose event defaults.
- Default cards show only the textured match header. Activating a card opens a native modal dialog: full viewport on phones, a centered 760px panel from 768px. Close, Escape and a desktop backdrop click close it and return focus to the card. The dialog does not change the URL.
- Details bold each completed set, game or period's winning score, colour the current one red with a text legend and labelled column, and mark the server with a dot plus screen-reader text. Winners also get a visible Winner tag.
- Upcoming and Past have date chips that filter in place with `aria-pressed`, like homepage sport filters. One shared event calendar supplies the chip days for every sport, so a day can show an empty message (12 Oct has no matches yet).
- One shared page renders every sport: `SportPage`, `SportSection`, `SportMatchCard`, `SportMatchDialog` and `SportPage.css` in `frontend/src/features/sports/`. Each sport has one fixture module that exports `scoring`, `liveMatches`, `upcomingMatches` and `pastMatches`; `sportFixtures.js` maps sport ids to modules. `App.jsx` registers each sport route with `key={sport.id}`, so chips and the dialog reset between sports.
- Two scoring models share one score table. Set sports (badminton, lawn tennis, table tennis, volleyball) bold the set or game winner. Period sports (football, basketball) bold the higher score of each completed half, quarter or overtime; a tied period has no bold score. Legends read `Bold = <unit> winner` / `Red = current <unit>` or `Bold = won the period` / `Red = current period`.
- The header score is games or sets won for set sports and goals or points for period sports; scheduled matches show `VS`. Live state lines are precomputed, for example `Set 3 · 4–3 · 30–15`, `Game 4 · 7–5`, `62′ · Second half` and `Q3 · 04:12`.
- The serving dot marks a player (badminton, tennis, table tennis) or a team label (volleyball). Football and basketball show no serving dot. Live tennis adds a red `Pts` column for the current game; a 7–6 set shows the loser's tiebreak points as a small number.
- Team sports show only the team label in the score table and list a short `Lineups` block below it. Football lists `Goals` and basketball lists `Top scorers` per side.
- Page titles and card meta use the `sports.js` label (lawn tennis shows `Tennis`). The icon colour comes from `sports.js`; textures come from `/assets/<sport>-background.webp` and its `-640` phone variant. Total columns use short labels (`Games`, `Sets`, `Goals` or `T`) with a full accessible name.
- Fixture baselines: BWF best of 3 games to 21; ITF best of 3 advantage sets with a 7-point tiebreak at 6–6; ITTF best of 5 games to 11; FIVB best of 5 sets to 25 (fifth set to 15); IFAB two halves; FIBA four quarters with overtime when tied. Completed football and basketball fixtures are never draws because knockout tie resolution is open.

## Homepage decisions — 8 October 2026

- The React + Vite JavaScript homepage and backend live platform are implemented. See [tasks.md](tasks.md) for deployed scope and the scoring integration status. [Handoff](handoff.md) owns the current implementation map; [local-development.md](local-development.md) owns setup.
- Phone users are the priority; tablets, desktops and larger screens remain supported. Preserve the full-width rectangular header, heavy Helvetica/Arial wordmark, icon-only phone menu, six-athlete diagonal gallery and original blue hero dot matrix. Reuse the exact visual language in [design.md](design.md).
- Header Sports links navigate to sport destinations. Homepage sport buttons filter only Live Matches without changing the URL. Tournament detail UI remains unbuilt. Sport pages follow the sport page decisions above.
- Keep native horizontal match and tournament rails. Partial cards become smaller and less opaque until they enter the spotlight. Do not add pause controls, View All or scrolling arrows.
- Preserve the approved match texture/color and white-detail shell, and the tournament venue-image/white-detail shell. Competitors, scores, clocks, columns, values, tournament identities and dates are temporary fixtures. Feature teams decide actual fields without redesigning the shell. Do not add public fixture explanations.
- Keep approved artwork, originals, responsive variants and favicon local and portable. Record sources and licenses in [asset-sources.md](asset-sources.md).

## Confirmed direction

The product and service decisions below are confirmed requirements. Implementation and verification status are recorded in [tasks.md](tasks.md); a requirement alone is not proof of implementation.

- Shared repository: `campuscores/campuscores`. Each teammate may use a different local checkout path; app and test code must stay portable.
- Event label: **Thaparlympics** for now. Product/site name is undecided.
- Site type: responsive website, not a native app.
- Primary users: public spectators (anonymous or with an optional Viewer account), Super Admins, Tournament Managers, and Match Operators. No player login/profile in initial release.
- Public access: anyone can view event scores without an account; an optional Viewer account adds no rights for now; privileged tools are protected.
- Primary data entity: tournament; each tournament enables a configurable subset of sports at creation, then tournament sport/match detail. The homepage also has global header sport links and live-match filters as confirmed above.
- Initial selectable sports: football, volleyball, basketball, table tennis, lawn tennis, and badminton. Cricket is not in the current scope.
- Tournament competition: exactly two semifinals and one final per configured tournament sport. A Tournament Manager or Super Admin assigns semifinal teams; only approved semifinal winners fill final slots. Regular_Matches (stored kind `CUSTOM`, shown as "Match") are separate, public with their tournament, and never advance the bracket (change 4, 22 October 2026).
- Roles (decided 6 October 2026): four user categories, stored explicitly in `admin_accounts.role` (no `is_admin` flag):
  - `SUPER_ADMIN`: core platform/event team. Full access, including account administration and audited corrections.
  - `TOURNAMENT_MANAGER`: trusted organizer. Manages tournaments, sports configuration, teams/players, matches, operator assignments; finalized results cannot be edited. Managers are **global** across all tournaments; there is no tournament-scoped manager table.
  - `MATCH_OPERATOR`: verified person who can score only matches they hold an active assignment for. Cannot create or edit tournaments, matches, teams/players or users. May choose the match format before scoring and confirm the final result.
  - Spectator: anonymous, read-only, no account.
  - Each account has exactly one role. Super Admin includes every Tournament Manager capability. There is still no sport-scoped admin role.
- Account creation: only a Super Admin invites Super Admins and Tournament Managers. Managers (and Super Admins) invite `MATCH_OPERATOR` accounts only. Staff roles come only from invitations recorded in our database. Anyone can sign up through Clerk, but sign-up alone gives only the Viewer role (decided 11 October 2026; replaces invite-only Supabase Auth).
- Match operator assignments: `match_operator_assignments` rows grant `SCORE` permission for one match. Status stores only `ACTIVE` or `REVOKED`; expiry is derived from `valid_from`/`valid_until`, which are both optional. With no `valid_until`, access lasts until the match is locked (submitted/approved) or the assignment is revoked. Ending a match never deletes the user account.
- Scorer concurrency: at most one active assignment per match (partial unique index). The `scorer_leases` table identifies the one active device/session. Reassignment revokes the old row and inserts a new one in one audited transaction. Managers assign themselves before scoring. The Worker enforces these database records.
- Authorization: every scoring HTTP command checks token → active account → active assignment → time window (server time) → `SCORE` permission → match accepting scores → scorer lease, against the database on every request. An unassigned match returns 403. UI hiding is never the control. Viewer sockets are receive-only and accept no commands.
- Scoring gate: START from the scheduled time until the end of that India_Time day in an Ongoing tournament (change 6, [Slice 1](#staff-roles-and-manager-console--slice-1-22-october-2026)), then live scoring under the frozen format. Preserve account, assignment/window, SCORE and lease checks. Legacy rejected-state compatibility does not authorize new review/reopening endpoints. See [architecture.md](architecture.md#scoring-authorization-chain).
- Match finalization (confirmed 20 October 2026): the assigned operator confirms the final score. It becomes final for viewers immediately and cannot be edited. This replaces manager review, rejection/reopening and the self-approval override. The stored final status remains `APPROVED`. See [rules.md](rules.md) for the current scoring scope.
- My Matches sections (user-confirmed 18 October 2026): the operator dashboard maps match status to its sections. Scheduled = `SCHEDULED`. Live = `LIVE` and `REJECTED/OPERATOR`; a `REJECTED/OPERATOR` card shows the action "Fix and resubmit". Completed (read-only) = `PENDING_APPROVAL`, `APPROVED` and `REJECTED/MANAGER`. Since 22 October 2026 (Requirement 15.4, [Slice 3](#staff-roles-and-manager-console--slice-3-22-october-2026)), Scheduled holds only a `SCHEDULED` match that is not Not_Scored; a Not_Scored `SCHEDULED` match (`notScored: true`) is in Completed as "Not scored", with no scoring link. `GET /api/operator/matches` returns `status`, `correctionRoute` and `notScored` so the frontend can apply this map. The dashboard reads assigned matches from the Worker; these legacy section mappings stay compatible. New matches use SCHEDULED, LIVE and APPROVED.
- Teams: separate team/roster per sport, identified by branch + year.
- Team/roster fields: organizer-configurable; include name, branch, year, captain marker, optional jersey number. Tile-based manager flow to add players and move them between active and substitute states.
- Planned roster records: `roster_players` and `match_roster`; do not create a second `players` table for the same records. See [architecture.md](architecture.md#main-data-records).
- Player statistics: visible as contributions on match/sport views, without an individual profile or login in first release.
- Scoring: detailed sport-specific scoring in the first release; scoring, match outcomes, and sport standings update as dependent data.
- Live undo: while a match is `LIVE`, the assigned operator can undo/correct as many times as needed without extra permission or a reason prompt. Each undo is stored as a linked reversal action with actor and server time; spectators see no correction marker for live undos. Operator final confirmation permanently locks further edits.
- Exceptional whole-match outcomes beyond early set endings remain Open with Arnav/coaches. No outcome may bypass the final lock.
- Match creation: both from a schedule and on the spot, by Tournament Managers/Super Admins only.
- Offline behavior: an operator can keep scoring locally; actions sync in order with the same action ID on retry. The server validates each action against the operator's assignment by server receipt time (device clock untrusted). If actions arrive after `valid_until` or after revocation, sync pauses until a manager extends the window or resolves the conflict. One primary scoring device per match.
- Sport formats: each tournament sport has its own configurable format and point/scoring values. Format defaults/limits remain to be confirmed. The bracket itself is fixed to semifinal-semifinal-final in this release.
- Sport standings: in scope. Combined overall branch standings deferred until scoring/placement points are decided.
- Past edition archive: public archive with organizer-only edits is a future option; exclude from initial implementation.
- Branding: approved homepage currently uses the Thaparlympics text wordmark. The official Thapar logo is still pending; use an institute-controlled asset and record the exact source/path when supplied/approved. Homepage colors are approved choices, not official institute branding claims.
- Stack language: JavaScript (not TypeScript).
- Final stack (decided 11 October 2026): React + Vite (JavaScript) frontend and Hono API on Cloudflare Workers, Durable Object WebSocket rooms for live delivery, Neon Postgres through Hyperdrive, Clerk sign-in. See [Backend and hosting decisions](#backend-and-hosting-decisions--11-october-2026).
- Database hosting: no Postgres runs on any team device, including for schema changes. Separate hosted Neon projects for staging and production. `dbmate` migrations in `db/migrations/` are applied only by GitHub Actions (develop → staging, main → production). CI tests them on a throwaway Postgres on the runner. Never change a hosted schema outside a CI migration.
- Database access: the Worker connects through Hyperdrive with SSL. Public reads use the cached configuration; sign-in, roles, assignments, leases and writes use the uncached one. All data access goes through the Worker; browsers never connect to the database.
- Auth setup: Clerk verifies email and challenges suspicious sign-ups. The Worker verifies Clerk session tokens with `@clerk/backend` and an `authorizedParties` allow-list. Account and assignment state is still read from the database on every request; token claims never grant a role.
- Backend hosting: Cloudflare Workers and Durable Objects. They have no idle shutdown, so nothing needs a manual restart between events.
- Actual event audience estimate: approximately 1,000 simultaneous viewers.
- Capacity demonstration target: 3,000 simulated concurrent WebSocket clients. This is not actual attendance and not a verified capacity claim until the benchmark is run and documented.
- Live rooms: one Durable Object room per match plus the `home` room. Split a room across several objects only if a measurement shows it is needed.
- PostgreSQL is the score source of truth. Each accepted score action is persisted transactionally with projection/outbox data, then published to its room. Reconnect delivers the stored snapshot; socket delivery alone is not replay/history.
- Hosting: Cloudflare and Neon, with a free Student Pack domain. Production account ownership is not yet chosen. Capacity-test thresholds: [tasks.md](tasks.md#load-test-pass-thresholds).

## Research notes

- TIET's official sports pages describe Thaparlympics as an inter-branch competition. Current user-selected scope is football, volleyball, basketball, table tennis, lawn tennis, and badminton.
- BWF Laws Section 4.1 baseline is best of three to 21 with the specified deuce/cap rules; BWF alternative laws also exist.
- FIBA Official Basketball Rules 2026, valid from 1 October 2026, is the four-quarter/team-point baseline. This product does not run a clock.
- IFAB's latest Laws define football match duration, substitutions, and match outcomes; competition conditions and grassroots modifications must be chosen for the event.
- FIVB Official Volleyball Rules 2025–2028; ITTF current statutes/laws and umpire documents; World Tennis/ITF Rules of Tennis (2026) are the primary references recorded in `rules.md`. Tournament-level sport formats still require confirmation.
- CricHeroes inspiration: tournament page, live match score/detail, schedule, standings, player/leader data.
- Playinga inspiration: multisport management, granular roles, scoring permissions, and results feeding standings.
- CricHeroes published an AWS overview naming RDS/Aurora Serverless, EC2/ALB, S3/CloudFront, WAF/SES and operational figures. Its “users per hour” number is not concurrent viewers; do not misstate it. Cricbuzz's public job listings reveal some backend skill requirements, not a verified production architecture.
- Capacity evidence rule: distinguish expected users, simulated clients and measured capacity. Record build, topology, workload, metrics, failures and limits in the capacity section of `tasks.md` before saying “load-tested for 3,000.” Keep raw measurements outside shared source.
- Platform limits (checked 11 October 2026): Cloudflare Workers Free gives 100,000 requests/day and 10 ms CPU per request, and returns error 1027 at the cap. Durable Objects Free gives 100,000 requests/day, 13,000 GB-s/day, 5 GB storage and 100,000 row writes/day. Each request or WebSocket message gets 30 s of CPU. Outgoing WebSocket messages are free; incoming messages bill at 20:1. Hyperdrive Free gives 100,000 queries/day. Cloudflare Free allows one rate-limit rule on your own zone. Neon Free gives 1 GB per project, 100 CU-hours per month and 5 GB egress; it sleeps after 5 minutes idle and wakes on the next query. Clerk Free gives 50,000 retained users and 3 social providers, supports open or invite-only sign-up and email verification, and needs an owned domain for production. Facebook Login needs no app review for name and email, but needs a privacy policy and data-deletion path. Sources: Cloudflare Workers limits, Durable Objects limits and pricing, Hyperdrive pricing and WAF rate-limiting rules pages; Neon plans page; Clerk pricing, restricting access, bot protection and production deployment guides; Meta Facebook Login overview; Heroku for GitHub Students page.
- The earlier Supabase research (6 October 2026) no longer applies; Supabase is not used.

## Open questions to resolve

### Competition and rules

- What dates, match schedule, venue/court labels and tournament lifecycle apply? Event scoring and operator schedule display use Asia/Kolkata (confirmed 20 October 2026).
- Should Regular_Matches count toward player statistics or standings? (Their public visibility is decided: they are public with their tournament, change 4.)
- Are divisions needed (for example men's/women's/mixed), or only branch-year teams?
- What are the exact branch/team names and branch-year category values?
- Football: player count, half duration, substitutions, and knockout tie/shootout rules?
- Volleyball: set count, point thresholds, win-by/cap rules, roster/rotation/libero tracking requirements?
- Basketball: 5-on-5/3-on-3, periods and duration, game clock, fouls, timeouts, overtime, and player-stat detail?
- Table tennis: singles/doubles, games per match, and whether a team-tie format is needed?
- Lawn tennis: singles/doubles, advantage/no-ad, best-of sets, tiebreak and final-set format?
- Badminton: singles/doubles categories, standard or alternate scoring, best-of format, and match-to-tie structure?
- What sport-table columns, win/draw/loss points, bonuses/penalties, and tie-break sequence apply?
- If a match is tied, abandoned, forfeited, or disputed, what exact statuses and data are required from the manager?
- What are the roster/team limits, eligibility rules, match-day squad selection, and permitted roster changes after a match starts?
- Should match pages show ball/rally/clock timestamps, commentary text, and scorer notes, or just structured score events?

### Access and offline reliability

- Must operator (and manager) emails be Thapar addresses, or can any verified email be invited?
- What password reset/account recovery policy applies to privileged accounts?
- Should the Assign Scorer form suggest a default time window (for example 30 minutes before to 2 hours after the scheduled start), or leave it empty by default?
- How should a manager resolve a queued action if match state changed elsewhere before reconnection?
- What should happen if the scoring device is closed, loses storage, or cannot recover its offline queue?
- Should offline queued scoring survive browser restarts? Which browsers need support?

### Public data and presentation

- Confirm that public rosters show player names, branch, year, captain marker, and jersey number when set.
- Are player photos, departments/programs, or any other fields needed? Default is not to collect or publish them.
- Add/identify the exact official Thapar logo file/source and any usage guidance; provide color guide/event poster/product name if available.
- Is an English-only first release sufficient?
- Do spectators need search/filter by sport, branch, status, venue, or date?
- Should live status include a displayed score freshness timestamp and correction reason?
- **Closed — 20 October 2026:** a computed winner stays provisional/live until the assigned operator confirms. Acceptance publishes a locked final result, moves the sport card to Past and shows it in homepage Final Results.
- **Open** — match detail URL: the sport page detail dialog has no URL, so Back leaves the page and details cannot be shared. Decision owner: user/product owner. Affects: all six sport pages, PRD match routes. Accept when a route or dialog-only rule is confirmed. `frontend/tests/sport-edge-cases.spec.js` pins the current Back behaviour.

### Delivery and operations

- Who owns the production Cloudflare, Neon and Clerk accounts and the domain?
- Is the existing GitHub repository the intended long-term project repository? The develop → staging, main → production workflow is confirmed; keep their environment values separate.
- What expected number of matches, teams and operators should sizing target? The latest viewer estimate is approximately 1,000; confirm any change before capacity work.
- Who owns production backups, privileged account recovery, and event-day support?
- What are acceptable public update latency and availability targets?
- What monitoring/load-generator setup will record Worker and Durable Object request counts and errors, socket connections, Neon compute and query time, event-to-screen latency, and sequence gaps?
- Does the chosen React/Vite frontend need server-rendered social link previews/SEO? If yes, reassess UI framework while keeping API/socket/database boundaries.

## Explicitly deferred

- Player sign-in and personal player profiles/long-term statistics.
- Combined cross-sport overall standings and champion points.
- Historical edition archive in the first release.
- Additional sports beyond the six current selectable sports.
- Livestreaming, media uploads, registrations/payments, notifications, or social features.
- Tournament-scoped managers and permissions other than `SCORE` for operators.
- Sign in with Apple (needs a paid Apple developer account).

## Change-control note

Treat the open questions above as unknown. Before implementing a sport engine or standings calculation, update `rules.md`, `prd.md`, and `tasks.md` with the user's confirmed playing conditions. When decisions change, replace the affected decision and record its date and necessary rationale.

Each open question needs a decision owner, affected tasks and acceptance criteria. Dependent work remains Blocked until the user or authorized product owner confirms the contract. Follow [AGENTS.md](../AGENTS.md) for the shared decision workflow.

Current confirmed decisions take precedence over older proposals. An authorized stack, role or deployment change must update affected contracts, callers, tests and this decision record together before dependent work.

## Operator scoring decisions — 20 October 2026

- Arnav confirmed real scoring, not a fixture preview. Preserve the existing sign-in, assignment, device lease, persistent queue, transactional acceptance and live delivery. Develop/staging is the integration target; main/production stays untouched.
- Operators choose an official scoring preset or a validated custom format before the first score. Freeze that format when the match starts. They can end a set early and explicitly choose its winner. Derive normal set wins and the match winner from the selected format. Live undo remains unlimited.
- Publish set/period scores, set winners and the final winner. Goals and baskets are attributed to the side/team, not a player; doubles use team labels. Retain cards and substitutions. Do not show or run a match clock.
- Operator final confirmation publishes and permanently locks the result, without manager approval. Keep actor/time/action records. An automatic match-winning point remains correctable until final confirmation.
- Current-day eligibility uses Asia/Kolkata and database time, in addition to the existing assignment window. Missing dates are not eligible to start.
- Coaches/admins still own tournament/match creation and assignment. Their management screens, rosters, standings and automatic bracket advancement are separate scope. The assignment API already exists.
- Open: football shoot-out/draw policies and exceptional whole-match awards beyond an early set end. No tied or undecided match may be finalized by inventing a winner. Decision owner: Arnav/coaches; affects tied-match finalization only. Acceptance: a recorded event policy before enabling that result.

Publication naming and authorship, confirmed by Arnav on 20 October 2026: use neutral branch/commit descriptions and the requesting contributor’s verified Git identity. Follow [AGENTS.md](../AGENTS.md#git-naming-and-authorship).

## Stage 1 layout approval — 21 October 2026

Arnav approved the Stage 1 staff layout preview on 21 October 2026. Approved commit `27db57d` on `develop`, the Slice 0 staging tip, served at `https://thaparlympics-staging.bhatiaarnav05.workers.dev/preview`. The approval covers the Staff_Style and the Manager, Super Admin, public and sign-in Views as the approved layout direction. This records Layout_Approval and unblocks Slice 1 to Slice 6 of the staff-roles-manager-console feature (Requirement 1.8).
