# Project Memory and Decision Log

**Purpose:** Durable reference for future work in this repository. Update this file when the user makes a decision; do not convert an open question into a default silently.

## Documentation decisions — 9 October 2026

- Canonical docs describe final accepted behavior and contracts. [Requirements](prd.md), [architecture](architecture.md), [design](design.md) and [rules](rules.md) own their contracts. [Handoff](handoff.md) maps current integration points. [Tasks](tasks.md) holds minimal ownership, state and verification evidence.
- Keep failed attempts, scratch HTML/Markdown, reports and machine paths out of shared docs and source. Retain detail only when it explains a current risk, compatibility constraint or security requirement. Keep durable asset sources and licenses in [asset-sources.md](asset-sources.md).
- Final feature completion requires applicable verification and a confirmed remote commit or PR. Local unpushed work is not shared complete. Follow [AGENTS.md](../AGENTS.md) for verification policy; record actual results and limits in [tasks.md](tasks.md).
- Required frontend CI checks run the same install, lint, build and Chromium suite on Ubuntu, Windows and macOS. Each OS reports separately; one failure must not cancel the others. A three-OS pass requires remote job results. This does not cover Safari, Firefox or physical devices.

## Homepage decisions — 8 October 2026

- The React + Vite JavaScript homepage is implemented. Backend, database, authentication and live delivery remain planned. [Handoff](handoff.md) owns the current implementation map; [local-development.md](local-development.md) owns setup.
- Phone users are the priority; tablets, desktops and larger screens remain supported. Preserve the full-width rectangular header, heavy Helvetica/Arial wordmark, icon-only phone menu, six-athlete diagonal gallery and original blue hero dot matrix. Reuse the exact visual language in [design.md](design.md).
- Header Sports links navigate to sport destinations. Homepage sport buttons filter only Live Matches without changing the URL. Sport and tournament detail UI remains unbuilt.
- Keep native horizontal match and tournament rails. Partial cards become smaller and less opaque until they enter the spotlight. Do not add pause controls, View All or scrolling arrows.
- Preserve the approved match texture/color and white-detail shell, and the tournament venue-image/white-detail shell. Competitors, scores, clocks, columns, values, tournament identities and dates are temporary fixtures. Feature teams decide actual fields without redesigning the shell. Do not add public fixture explanations.
- Keep approved artwork, originals, responsive variants and favicon local and portable. Record sources and licenses in [asset-sources.md](asset-sources.md).

## Confirmed direction

The product and service decisions below are confirmed requirements. Scoring, backend, database, authentication and live delivery remain planned; they are not implemented or verified by the homepage.

- Shared repository: `Kush-Saharan/t-lympics`. Each teammate may use a different local checkout path; app and test code must stay portable.
- Event label: **Thaparlympics** for now. Product/site name is undecided.
- Site type: responsive website, not a native app.
- Primary users: public spectators (anonymous), Super Admins, Tournament Managers, and Match Operators. No player login/profile in initial release.
- Public access: anyone can view event scores without an account; privileged tools are protected.
- Primary data entity: tournament; each tournament enables a configurable subset of sports at creation, then tournament sport/match detail. The homepage also has global header sport links and live-match filters as confirmed above.
- Initial selectable sports: football, volleyball, basketball, table tennis, lawn tennis, and badminton. Cricket is not in the current scope.
- Tournament competition: exactly two semifinals and one final per configured tournament sport. A Tournament Manager or Super Admin assigns semifinal teams; only approved semifinal winners fill final slots. Custom matches are separate and never advance the bracket.
- Roles (decided 6 October 2026): four user categories, stored explicitly in `admin_accounts.role` (no `is_admin` flag):
  - `SUPER_ADMIN`: core platform/event team. Full access, including account administration and audited corrections.
  - `TOURNAMENT_MANAGER`: trusted organizer. Manages tournaments, sports configuration, teams/players, matches, operator assignments, and result review. Managers are **global** across all tournaments; there is no tournament-scoped manager table.
  - `MATCH_OPERATOR`: verified person who can score only matches they hold an active assignment for. Cannot create or edit tournaments, matches, sport rules, teams/players, or users, and cannot approve results.
  - Spectator: anonymous, read-only, no account.
  - Each account has exactly one role. Super Admin includes every Tournament Manager capability. There is still no sport-scoped admin role.
- Account creation: only a Super Admin creates/invites Super Admins and Tournament Managers. Managers (and Super Admins) can invite `MATCH_OPERATOR` accounts only. Accounts are invite-only through Supabase Auth; public sign-up is disabled.
- Match operator assignments: `match_operator_assignments` rows grant `SCORE` permission for one match. Status stores only `ACTIVE` or `REVOKED`; expiry is derived from `valid_from`/`valid_until`, which are both optional. With no `valid_until`, access lasts until the match is locked (submitted/approved) or the assignment is revoked. Ending a match never deletes the user account.
- Planned scorer concurrency: at most one active assignment per match (partial unique index). The planned `scorer_leases` table identifies the one active device/session. Reassignment revokes the old row and inserts a new one in one audited transaction. Managers assign themselves before scoring. No database table or enforcement exists in the current frontend.
- Authorization: every scoring HTTP request and Socket.IO command checks token → active account → active assignment → time window (server time) → `SCORE` permission → match accepting scores → scorer lease, against the database on every request. An unassigned match returns 403. UI hiding is never the control.
- Planned scoring gate: `LIVE` and `REJECTED/OPERATOR` require a valid assigned scorer. `REJECTED/MANAGER` permits only a self-assigned Tournament Manager or Super Admin. Preserve account, assignment, server-time window, `SCORE`, lease, reason and audit checks. Revoke the old assignment and create the self-assignment in one transaction. Operators remain locked out; corrected results need resubmission and review. See [architecture.md](architecture.md#scoring-authorization-chain).
- Match finalization: the operator submits the result (`LIVE → PENDING_APPROVAL`); a Tournament Manager or Super Admin approves (`APPROVED/FINAL`) or rejects (`REJECTED/CORRECTION`). The submitter can never approve their own result, whatever their role, except through a Super Admin override that requires a reason and is audited. On rejection the reviewer chooses the correction route: `OPERATOR` reopens the assigned operator's scoring access, or `MANAGER` keeps the operator locked out while a manager corrects. Approved results are locked; post-approval corrections create a new audited result version and need another approval.
- Teams: separate team/roster per sport, identified by branch + year.
- Team/roster fields: organizer-configurable; include name, branch, year, captain marker, optional jersey number. Tile-based manager flow to add players and move them between active and substitute states.
- Planned roster records: `roster_players` and `match_roster`; do not create a second `players` table for the same records. See [architecture.md](architecture.md#main-data-records).
- Player statistics: visible as contributions on match/sport views, without an individual profile or login in first release.
- Scoring: detailed sport-specific scoring in the first release; scoring, match outcomes, and sport standings update as dependent data.
- Live undo: while a match is `LIVE`, the assigned operator can undo/correct as many times as needed without extra permission or a reason prompt. Each undo is stored as a linked reversal action with actor and server time; spectators see no correction marker for live undos. Corrections after submission or approval require a reason and show the public correction marker; detailed history is visible to managers/Super Admins.
- Exceptional match outcomes: a Tournament Manager or Super Admin records the decision and reason; result still follows approval before finalization.
- Match creation: both from a schedule and on the spot, by Tournament Managers/Super Admins only.
- Offline behavior: an operator can keep scoring locally; actions sync in order with the same action ID on retry. The server validates each action against the operator's assignment by server receipt time (device clock untrusted). If actions arrive after `valid_until` or after revocation, sync pauses until a manager extends the window or resolves the conflict. One primary scoring device per match.
- Sport formats: each tournament sport has its own configurable format and point/scoring values. Format defaults/limits remain to be confirmed. The bracket itself is fixed to semifinal-semifinal-final in this release.
- Sport standings: in scope. Combined overall branch standings deferred until scoring/placement points are decided.
- Past edition archive: public archive with organizer-only edits is a future option; exclude from initial implementation.
- Branding: approved homepage currently uses the Thaparlympics text wordmark. The official Thapar logo is still pending; use an institute-controlled asset and record the exact source/path when supplied/approved. Homepage colors are approved choices, not official institute branding claims.
- Stack language: JavaScript (not TypeScript).
- Final recommended stack: React + Vite (JavaScript) frontend, Node.js + Express API, Socket.IO live delivery, hosted Supabase Postgres, Supabase Auth for invitation-only privileged accounts, and Redis + Socket.IO adapter when running multiple Node instances. Serve static frontend assets through a CDN. Do not use Supabase Realtime as the score broadcast layer in the selected architecture.
- Database hosting (decided 6 October 2026): no Postgres runs on any team device, including for schema changes. Separate hosted Supabase projects for staging and production. Migrations live in `supabase/migrations/`, are created with `supabase migration new`, and are applied by GitHub Actions with `supabase db push` (develop → staging, main → production). CI applies migrations and runs integration tests against a throwaway Postgres on the runner; no local Docker/Postgres required. Never edit the remote schema through the Supabase Dashboard.
- Database access: the Node backend connects through the Supabase shared pooler in session mode (port 5432, IPv4) with SSL; not transaction mode. All data access goes through Express; every public table has RLS enabled with no policies (deny-all for the Data API). The Supabase secret key stays backend-only.
- Auth setup: custom SMTP provider required for invite emails (built-in SMTP only reaches project team members at ~2 messages/hour). Use asymmetric JWT signing keys so Express verifies tokens locally; account and assignment state is still checked in the database on every request.
- Backend hosting: Express + Socket.IO needs a long-running host while events run; it can be stopped between events. Host is not yet chosen.
- Actual event audience estimate: approximately 1,000 simultaneous viewers.
- Capacity demonstration target: 3,000 simulated concurrent Socket.IO clients. This is not actual attendance and not a verified capacity claim until the benchmark is run and documented.
- Normal operation can start with one Node instance; scale demonstration should run multiple Node replicas behind a WebSocket-capable load balancer with Redis adapter. Configure sticky sessions if Socket.IO polling fallback is enabled.
- PostgreSQL is the score source of truth. Each accepted score action is persisted transactionally with projection/outbox data, then broadcast. Reconnect fetches authoritative state; socket delivery alone is not replay/history.
- Hosting vendor, region, domain, budget, and capacity-test thresholds are not yet chosen.

## Research notes

- TIET's official sports pages describe Thaparlympics as an inter-branch competition. Current user-selected scope is football, volleyball, basketball, table tennis, lawn tennis, and badminton.
- BWF Laws Section 4.1 baseline is best of three to 21 with the specified deuce/cap rules; BWF alternative laws also exist.
- FIBA Official Basketball Rules 2024 lists standard four-quarter play; Thaparlympics duration/format remains unknown.
- IFAB's latest Laws define football match duration, substitutions, and match outcomes; competition conditions and grassroots modifications must be chosen for the event.
- FIVB Official Volleyball Rules 2025–2028; ITTF current statutes/laws and umpire documents; World Tennis/ITF Rules of Tennis (2026) are the primary references recorded in `rules.md`. Tournament-level sport formats still require confirmation.
- CricHeroes inspiration: tournament page, live match score/detail, schedule, standings, player/leader data.
- Playinga inspiration: multisport management, granular roles, scoring permissions, and results feeding standings.
- CricHeroes published an AWS overview naming RDS/Aurora Serverless, EC2/ALB, S3/CloudFront, WAF/SES and operational figures. Its “users per hour” number is not concurrent viewers; do not misstate it. Cricbuzz's public job listings reveal some backend skill requirements, not a verified production architecture.
- Capacity evidence rule: distinguish expected users, simulated clients and measured capacity. Record build, topology, workload, metrics, failures and limits in the capacity section of `tasks.md` before saying “load-tested for 3,000.” Keep raw measurements outside shared source.
- Supabase (checked 6 October 2026): Free plan pauses after 1 week of inactivity, has no automatic backups, 500 MB database, 1-day logs; Pro never pauses, keeps 7-day backups, 8 GB disk. Direct DB connections are IPv6-only without the paid IPv4 add-on; the shared pooler is IPv4 (session mode 5432, transaction mode 6543 without prepared statements or LISTEN/NOTIFY). `auth.admin.inviteUserByEmail` is an admin API requiring the secret key. Custom SMTP starts at 30 messages/hour (adjustable). JWKS signing keys may be cached up to ~20 minutes. Sources: Supabase docs on database migrations, managing environments, connecting to Postgres, pricing, custom SMTP, and JWT signing keys.

## Open questions to resolve

### Competition and rules

- What dates, match schedule, timezone, venue/court labels, and tournament lifecycle apply?
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

- Which custom SMTP provider and sender domain will send invites (for example Resend, AWS SES, Postmark, Brevo), and who owns SPF/DKIM/DMARC setup?
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

### Delivery and operations

- Which Supabase plan for the event period: Pro (no pausing, daily backups), or Free with the project unpaused before the event plus scheduled `pg_dump` backups from CI?
- Which host runs the long-running Express + Socket.IO backend, and in which region relative to the Supabase project?
- Which domain/accounts should own production? What budget and operating constraints apply?
- Is the existing GitHub repository the intended long-term project repository; confirm the develop → staging, main → production branch workflow.
- What expected number of matches, teams and operators should sizing target? The latest viewer estimate is approximately 1,000; confirm any change before capacity work.
- Who owns production backups, privileged account recovery, and event-day support?
- What are acceptable public update latency and availability targets?
- What precise synthetic load profile and pass thresholds define the 3,000-client demonstration (ramp, duration, room distribution, score event rate, reconnect burst, p95/p99 latency, and tolerated errors)?
- Which persistent-WebSocket host/load balancer supports multiple Node replicas and the required session affinity, and what instance sizes will be benchmarked?
- What monitoring/load-generator setup will record CPU, memory, event-loop lag, socket connections, Redis throughput, PostgreSQL pool/slow queries, event-to-screen latency, and sequence gaps?
- Does the chosen React/Vite frontend need server-rendered social link previews/SEO? If yes, reassess UI framework while keeping API/socket/database boundaries.

## Explicitly deferred

- Player sign-in and personal player profiles/long-term statistics.
- Combined cross-sport overall standings and champion points.
- Historical edition archive in the first release.
- Additional sports beyond the six current selectable sports.
- Livestreaming, media uploads, registrations/payments, notifications, or social features.
- Tournament-scoped managers and permissions other than `SCORE` for operators.

## Change-control note

Treat the open questions above as unknown. Before implementing a sport engine or standings calculation, update `rules.md`, `prd.md`, and `tasks.md` with the user's confirmed playing conditions. When decisions change, replace the affected decision and record its date and necessary rationale.

Each open question needs a decision owner, affected tasks and acceptance criteria. Dependent work remains Blocked until the user or authorized product owner confirms the contract. Follow [AGENTS.md](../AGENTS.md) for the shared decision workflow.

Current confirmed decisions take precedence over older proposals. An authorized stack, role or deployment change must update affected contracts, callers, tests and this decision record together before dependent work.
