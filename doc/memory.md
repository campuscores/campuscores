# Project Memory and Decision Log

**Purpose:** Durable reference for future work in this repository. Update this file when the user makes a decision; do not convert an open question into a default silently.

## Confirmed direction

- Project folder/repository: `score_manager`; remote project cloned from `Kush-Saharan/t-lympics`.
- Event label: **Thaparlympics** for now. Product/site name is undecided.
- Site type: responsive website, not a native app.
- Primary users: public spectators and admins. No player login/profile in initial release.
- Public access: anyone can view event scores; admin tools are protected.
- Primary entity/navigation: tournament index first; each tournament enables a configurable subset of sports at creation; then tournament sport page, multiple matches, and match detail.
- Initial selectable sports: football, volleyball, basketball, table tennis, lawn tennis, and badminton. Cricket is not in the current scope.
- Tournament competition: exactly two semifinals and one final per configured tournament sport. Admin assigns semifinal teams; only admin-approved semifinal winners fill final slots. Custom matches are separate and never advance the bracket.
- Match finalization: scorer-submitted result remains provisional until approved by an admin; approval/rejection is audited. Whether approver must differ from scorer is still open.
- Teams: separate team/roster per sport, identified by branch + year.
- Team/roster fields: organizer-configurable; include name, branch, year, captain marker, optional jersey number. Tile-based admin flow to add players and move them between active and substitute states.
- Player statistics: visible as contributions on match/sport views, without an individual profile or login in first release.
- Scoring: detailed sport-specific scoring in the first release; scoring, match outcomes, and sport standings update as dependent data.
- Admins: accounts are invite-only; active admins can operate across every enabled sport. There is no sport-specific admin role/assignment. Account administration can be organizer-only.
- Scoring: admin can correct an entered score; public sees a correction marker; admin history records changes.
- Exceptional match outcomes: an admin records the decision and reason; result still follows approval before finalization.
- Match creation: both from a schedule and on the spot.
- Offline behavior: a match can continue being scored locally; actions sync to the public site after connectivity returns.
- Scorer concurrency: one active scorer per match, with admin handoff.
- Sport formats: each tournament sport has its own configurable format and point/scoring values. Format defaults/limits remain to be confirmed. The bracket itself is fixed to semifinal-semifinal-final in this release.
- Sport standings: in scope. Combined overall branch standings deferred until scoring/placement points are decided.
- Past edition archive: public archive with organizer-only edits is a future option; exclude from initial implementation.
- Branding: official Thapar logo is required site-wide. No confirmed standalone official asset has been added; use an institute-controlled asset and record the exact source/path when supplied/approved. No verified official public color guide found; keep colors configurable.
- Stack language: JavaScript (not TypeScript).
- Final recommended stack: React + Vite (JavaScript) frontend, Node.js + Express API, Socket.IO live delivery, managed PostgreSQL (Supabase Postgres is the current preference), Supabase Auth for invitation-only admin identities, and Redis + Socket.IO adapter when running multiple Node instances. Serve static frontend assets through a CDN. Do not use Supabase Realtime as the score broadcast layer in the selected architecture.
- Actual event audience estimate: 50–100 simultaneous viewers.
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
- Capacity evidence rule: presentation wording must distinguish expected real users, simulated load-test clients, and measured tested capacity. Record test build, topology, workload, metrics, failures, and limits in a load-test report before saying “load-tested for 3,000.”

## Open questions to resolve

### Competition and rules

- What dates, match schedule, timezone, venue/court labels, and tournament lifecycle apply?
- Must the result approver be a different admin than the scorer, or can one admin score and approve?
- Should custom matches be public, count toward player statistics, count toward standings, or be admin-only?
- Are divisions needed (for example men's/women's/mixed), or only branch-year teams?
- What are the exact branch/team names and branch-year category values?
- Football: player count, half duration, substitutions, and knockout tie/shootout rules?
- Volleyball: set count, point thresholds, win-by/cap rules, roster/rotation/libero tracking requirements?
- Basketball: 5-on-5/3-on-3, periods and duration, game clock, fouls, timeouts, overtime, and player-stat detail?
- Table tennis: singles/doubles, games per match, and whether a team-tie format is needed?
- Lawn tennis: singles/doubles, advantage/no-ad, best-of sets, tiebreak and final-set format?
- Badminton: singles/doubles categories, standard or alternate scoring, best-of format, and match-to-tie structure?
- What sport-table columns, win/draw/loss points, bonuses/penalties, and tie-break sequence apply?
- If a match is tied, abandoned, forfeited, or disputed, what exact statuses and data are required from the admin?
- What are the roster/team limits, eligibility rules, match-day squad selection, and permitted roster changes after a match starts?
- Should match pages show ball/rally/clock timestamps, commentary text, and scorer notes, or just structured score events?

### Admin operation and offline reliability

- Supabase Auth is the selected admin identity provider. What exact invite delivery, password reset/account recovery, and Thapar-email restriction policy should be configured?
- Should only an organizer invite/disable admin accounts, while every admin has the same scoring/review rights across sports?
- What is the handoff workflow for the accepted one-scorer-per-match policy?
- How should an admin resolve a queued action if match state changed elsewhere before reconnection?
- What should happen if the scoring device is closed, loses storage, or cannot recover its offline queue?
- Should offline queued scoring survive browser restarts and multiple tabs/devices? Which browsers need support?

### Public data and presentation

- Confirm that public rosters show player names, branch, year, captain marker, and jersey number when set.
- Are player photos, departments/programs, or any other fields needed? Default is not to collect or publish them.
- Add/identify the exact official Thapar logo file/source and any usage guidance; provide color guide/event poster/product name if available.
- Is an English-only first release sufficient?
- Do spectators need search/filter by sport, branch, status, venue, or date?
- Should live status include a displayed score freshness timestamp and correction reason?

### Delivery and operations

- Which hosting/domain/accounts should own production? What budget and operating constraints apply?
- What region should host the database and app?
- Is the existing GitHub repository the intended long-term project repository and should a development branch/workflow be used?
- What expected number of matches, teams, concurrent viewers, and scorers should sizing/monitoring target?
- Who owns production backups, admin account recovery, and event-day support?
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

## Change-control note

Treat the open questions above as unknown. Before implementing a sport engine or standings calculation, update `rules.md`, `prd.md`, and `tasks.md` with the user's confirmed playing conditions. When decisions change, update this log and note the date/context of the change.

The stack recommendation supersedes the earlier Next.js + Supabase Realtime proposal. If an agent proposes a stack change, it must explain the trade-off and update `architecture.md`, `tasks.md`, and this decision log together before implementation.
