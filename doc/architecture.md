# Architecture

## Overview

Responsive website for tournaments and live sports scores. Public navigation is:

`Tournament list → Tournament → Enabled sport → Match → Scorecard`

Admins manage all enabled sports. Each tournament can enable any subset of football, volleyball, basketball, table tennis, lawn tennis, and badminton. Each sport has its own configurable match format and scoring rules.

## Technology

- Frontend: React + Vite
- Backend: Node.js + Express
- Live updates: Socket.IO
- Database: PostgreSQL (Supabase Postgres is the current preference)
- Admin sign-in: Supabase Auth, invite-only
- Multi-server Socket.IO delivery: Redis adapter, only when running more than one backend instance

PostgreSQL is the source of truth. Socket.IO sends committed updates to connected viewers; it is not the score database.

## Repository structure

Keep frontend and backend independent. Put shared UI in components and shared business logic in services; sport-specific UI and scoring behavior belongs in that sport's module.

```text
frontend/
  src/
    app/                         # app setup and shared layouts
    routes/                      # route definitions and navigation
    pages/                       # tournament, sport, match, and admin pages
    components/                  # reusable buttons, cards, tables, dialogs, status UI
    features/
      tournaments/               # tournament list, detail, and setup UI
      teams/                     # teams and roster management UI
      matches/                   # match list, detail, and result review UI
      sports/
        football/
          components/
          scoring/               # sport-specific score input and display
        volleyball/
          components/
          scoring/
        basketball/
          components/
          scoring/
        table-tennis/
          components/
          scoring/
        lawn-tennis/
          components/
          scoring/
        badminton/
          components/
          scoring/
    services/                    # HTTP API and Socket.IO clients
    state/                       # shared client state where needed

backend/
  src/
    app.js                       # Express app setup
    routes/                      # URL/method mapping to controllers
    controllers/                 # HTTP request/response handling
    middleware/                  # authentication, validation, error handling
    services/                    # tournament, team, match, review, and score workflows
    sports/
      football/                  # rules, score validation, result calculation
      volleyball/
      basketball/
      table-tennis/
      lawn-tennis/
      badminton/
    sockets/                     # Socket.IO setup, rooms, and live events
    database/                    # PostgreSQL connection and queries
    jobs/                        # outbox delivery and queued background work

database/
  migrations/
  seeds/

docs/                            # project documentation
```

Keep each backend sport module responsible for validating that sport's score actions and calculating its score/result. Shared services can call a sport module through a small common interface; avoid putting sport rules in controllers or UI components. Frontend sport folders contain sport-specific scoring controls and scorecards; reusable layout and form elements stay in `components/`.

## Main backend request flow

1. A route sends the request to a controller.
2. Middleware verifies the admin session when the action is protected and validates request data.
3. The service applies tournament/match workflow and calls the appropriate sport module for scoring rules.
4. The database transaction saves the score action, updated match state, audit entry, and live-update outbox record.
5. After commit, Socket.IO broadcasts the public update to the match/tournament room.

Public routes are read-only. All active admins can manage every enabled sport; authorization is not sport-specific.

## Tournament, bracket, and result rules

- A tournament stores its enabled sports and each sport's validated format/scoring configuration.
- Each tournament sport has exactly two semifinal matches and one final. Admins assign teams to the semifinal sides.
- A semifinal winner advances to the final only after that semifinal result is approved by an admin.
- Custom matches are separate from the bracket and never advance bracket slots.
- A completed score moves through `live → pending approval → approved/final` or `pending approval → rejected/correction`. Live score updates can be visible before approval, but only approved results are final.
- An approval records the reviewer, time, result version, and decision. Changes to an approved result require an audited correction and another approval.

## Main data records

- `tournaments`: name, dates, status, and event details.
- `tournament_sports`: enabled sport, format/rules configuration, configuration version, and standings options.
- `teams` and `players`: teams and rosters scoped to a tournament sport.
- `matches`: participants, schedule, sport configuration snapshot, status, result, and bracket/custom type.
- `bracket_slots`: the two semifinal assignments and final slots linked to approved semifinal winners.
- `score_actions`: ordered, auditable sport-specific scoring events.
- `match_result_reviews`: submitted result version and admin decision.
- `match_snapshots` and `sport_standings`: derived current match and standings views.
- `admin_accounts` and `admin_audit_log`: active admin identities and administrative changes.
- `outbox_events`: committed changes waiting to be broadcast.

Use database constraints for relationships and uniqueness. Save the sport configuration version with each match so later tournament setting changes do not alter a match already in progress.

## Live updates and offline scoring

- Viewers load an HTTP snapshot, then subscribe to the relevant match or tournament Socket.IO room.
- Broadcast only public fields. Admin identities, audit details, and private roster data are not sent to public rooms.
- Publish from the database outbox after transaction commit. On reconnect or a missed update, fetch a fresh snapshot from PostgreSQL-backed APIs.
- Scoring clients store offline actions locally, send them in order after reconnect, and retry with the same action ID to prevent duplicate scoring.
- Mark offline actions as pending until the server confirms them. Pause sync and request admin resolution if match state or score sequence conflicts.
- Use Redis only if multiple backend instances need to share Socket.IO room broadcasts. A single backend instance needs no Redis adapter.

## Security basics

- Spectators can view public tournament and match data without signing in; they cannot change data.
- Admins sign in through invite-only authentication. Every protected API request and score command checks that the admin account is active.
- Keep database credentials and auth service secrets on the backend.
- Validate input on the backend, use HTTPS/WSS in deployed environments, and record admin score corrections and result approvals in the audit log.
