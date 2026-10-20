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
- **Backups:** a nightly encrypted `pg_dump` from GitHub Actions. Neon Free keeps only 6 hours of restore history.
- **Sign-in:** Clerk Free. Anyone can create an account with a verified email or with Google. Clerk challenges suspicious sign-ups. Google is the only social provider. Apple is not implemented: production needs a paid Apple developer account. Facebook is deferred (see Open items).
- **Roles:** an account without an `admin_accounts` row is a Viewer with public read access only. A signed-in Viewer gets nothing extra for now. Watching needs no account and never depends on Clerk. Staff roles come only from invitations recorded in our database. The server reads the role on every request. A Super Admin invites managers and Super Admins; managers invite Match Operators only. Clerk sends the invitation email, so no custom SMTP provider is needed.
- **Domain:** a free GitHub Student Pack domain (Namecheap .me, .TECH or name.com) on Cloudflare DNS. Clerk production does not accept `*.workers.dev` or `*.pages.dev`. Staging uses `workers.dev` with a Clerk development instance. Clerk DNS records stay "DNS only".
- **Abuse limits:** one Cloudflare Free rate-limit rule on API and sign-up paths, counted per IP. Public routes fail closed at the daily request cap. Cloudflare usage notifications are on.
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
3. **Open — rate-limit threshold.** Question: what per-IP threshold avoids blocking many viewers behind one campus Wi-Fi address? Owner: user. Affects: the hardening task. Accept when the threshold is recorded and the rule stays off live-score sockets.
4. **Open — privacy policy owner and contact.** Question: who owns the policy, and which contact email does it publish? Google's consent screen needs it. Owner: user/product owner. Affects: the privacy page and the Google sign-in setup. Accept when the owner and email are recorded.
5. **Closed (19 October 2026) — load-test thresholds.** Decision (user-confirmed): the ramp, hold, room distribution, update rate, reconnect burst and pass criteria for 3,000 simulated clients are recorded, before any run, in [tasks.md](tasks.md#load-test-pass-thresholds); that list is authoritative. The run still needs a staging deploy.
6. **Open — management features.** The current backend plan has no endpoints to create tournaments, teams, rosters or matches. It also has no bracket advancement or standings. Manager result review was superseded by operator final confirmation on 20 October. No admin or manager screen exists for the built invite, assignment, revoke and disable endpoints. Production holds only bootstrap data until a follow-up feature adds them. Owner: user. Affects: event readiness. Accept when the follow-up feature is scoped and claimed; see follow-ups F1 and F2 in [tasks.md](tasks.md#follow-up-tasks).
7. **Open — static pages at the daily cap.** Cloudflare documents that static assets keep loading after the Worker reaches its daily request cap. This is untested; staging cannot reach the cap safely. Owner: implementing team. Affects: event-day risk. Accept when it is tested or accepted as a documented risk.
8. **Closed (18 October 2026) — package details.** The Clerk React SDK is `@clerk/react`, pinned at 6.17.8 in `frontend/package.json`; `@clerk/clerk-react` is deprecated. Sign-in against a real Clerk instance is not yet verified. Earlier part (17 October 2026): `@cloudflare/vitest-pool-workers` is deprecated and renamed to `@cloudflare/vitest-plugin`; the backend pins `@cloudflare/vitest-plugin` and configures it with `cloudflareTest()` in `backend/vitest.config.js`.

## CI while GitHub Actions is unavailable — 20 October 2026

Confirmed by Arnav, 20 October 2026:

- GitHub Actions minutes are exhausted. The workflow files stay unchanged. Each pushed commit has `[skip ci]` in its subject, except a commit that must deploy: `[skip ci]` also skips `deploy.yml`.
- Checks that cannot run are deferred, not skipped. [deferred-tests.md](deferred-tests.md) is their register. They run later in GitHub Actions when minutes return, or in a full local end-to-end run after the product is built. CI verified `integration/matchscorer-scoring` through `6f19182`.
- The CI matrix stays at option A: Windows runs `chromium` and `pixel`; Ubuntu and macOS run Firefox ([Documentation decisions](#documentation-decisions--9-october-2026)).

Rationale: staging and production deploy only through `deploy.yml`, CI applies the hosted migrations, and the backup runs only through `backup.yml`. All three run on GitHub-hosted runners, so they also stop without minutes.

Open items:

1. **Open — deploy path while Actions is unavailable.** Question: wait for the monthly minute reset or set a spending limit, add a self-hosted runner, or deploy manually with Wrangler? Owner: Arnav. Affects: the staging deploy from `develop` (needed to check changes on the staging subdomain before `main`), the production deploy from `main`, CI-only database migrations, the nightly backup (`backup.yml`, 21:30 UTC), publication of PR #2 and rows 5–7 in [deferred-tests.md](deferred-tests.md). A manual Wrangler deploy or a laptop migration changes the confirmed rule that only GitHub Actions deploys and migrates; record that change here if it is chosen. Accept when the path is recorded here and a staging deploy passes its smoke check.
2. **Open — Windows Firefox CI job (option D).** Question: when minutes return, add a separate parallel Windows job that runs only the `firefox` project with `--workers=1`, to restore Windows desktop Firefox coverage? Owner: Arnav. Affects: `frontend.yml`, the PR #2 integration task and row 8 in [deferred-tests.md](deferred-tests.md). Accept when the Windows Firefox job is green on two consecutive runs without retries.

## Documentation decisions — 9 October 2026

- Canonical docs describe final accepted behavior and contracts. [Requirements](prd.md), [architecture](architecture.md), [design](design.md) and [rules](rules.md) own their contracts. [Handoff](handoff.md) maps current integration points. [Tasks](tasks.md) holds minimal ownership, state and verification evidence.
- Keep failed attempts, scratch HTML/Markdown, reports and machine paths out of shared docs and source. Retain detail only when it explains a current risk, compatibility constraint or security requirement. Keep durable asset sources and licenses in [asset-sources.md](asset-sources.md).
- Final feature completion requires applicable verification and a confirmed remote commit or PR. Local unpushed work is not shared complete. Follow [AGENTS.md](../AGENTS.md) for verification policy; record actual results and limits in [tasks.md](tasks.md).
- Required frontend CI checks run the same install, lint and build on Ubuntu, Windows and macOS. Ubuntu and macOS run all six Playwright projects (Chromium, Firefox, WebKit, emulated Pixel, iPhone and iPad). Windows runs Chromium and Pixel; Safari does not exist on Windows. Windows skips Firefox (decided 20 October 2026): users are mainly on phones and tablets, Ubuntu and macOS cover Firefox, and headless Firefox on Windows runners stalls automation calls until tests time out. A separate Windows Firefox job (option D) is Open ([CI while GitHub Actions is unavailable](#ci-while-github-actions-is-unavailable--20-october-2026)). Each OS reports separately; one failure must not cancel the others. A three-OS pass requires remote job results. WebKit is not branded Safari, and emulation does not cover physical devices.

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
- Tournament competition: exactly two semifinals and one final per configured tournament sport. A Tournament Manager or Super Admin assigns semifinal teams; only approved semifinal winners fill final slots. Custom matches are separate and never advance the bracket.
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
- Scoring gate: current-day START for scheduled matches, then live scoring under the frozen format. Preserve account, assignment/window, SCORE and lease checks. Legacy rejected-state compatibility does not authorize new review/reopening endpoints. See [architecture.md](architecture.md#scoring-authorization-chain).
- Match finalization (confirmed 20 October 2026): the assigned operator confirms the final score. It becomes final for viewers immediately and cannot be edited. This replaces manager review, rejection/reopening and the self-approval override. The stored final status remains `APPROVED`. See [rules.md](rules.md) for the current scoring scope.
- My Matches sections (user-confirmed 18 October 2026): the operator dashboard maps match status to its sections. Scheduled = `SCHEDULED`. Live = `LIVE` and `REJECTED/OPERATOR`; a `REJECTED/OPERATOR` card shows the action "Fix and resubmit". Completed (read-only) = `PENDING_APPROVAL`, `APPROVED` and `REJECTED/MANAGER`. `GET /api/operator/matches` returns `status` and `correctionRoute` so the frontend can apply this map. The dashboard reads assigned matches from the Worker; these legacy section mappings stay compatible. New matches use SCHEDULED, LIVE and APPROVED.
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
- Should custom matches be public, count toward player statistics, count toward standings, or be manager-only?
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
