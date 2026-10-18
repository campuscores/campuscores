-- migrate:up
CREATE TABLE admin_accounts (
  id bigserial PRIMARY KEY,
  clerk_user_id text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('SUPER_ADMIN', 'TOURNAMENT_MANAGER', 'MATCH_OPERATOR')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  invited_by bigint REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tournaments (
  id bigserial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  starts_on date,
  ends_on date,
  status text NOT NULL DEFAULT 'DRAFT',
  venue text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

CREATE TABLE tournament_sports (
  id bigserial PRIMARY KEY,
  tournament_id bigint NOT NULL REFERENCES tournaments(id),
  sport text NOT NULL CHECK (sport IN ('football', 'basketball', 'lawn-tennis', 'table-tennis', 'badminton', 'volleyball')),
  config jsonb NOT NULL DEFAULT '{}',
  config_version int NOT NULL DEFAULT 1,
  UNIQUE (tournament_id, sport)
);

CREATE TABLE teams (
  id bigserial PRIMARY KEY,
  tournament_sport_id bigint NOT NULL REFERENCES tournament_sports(id),
  branch text NOT NULL,
  year int NOT NULL,
  label text NOT NULL,
  UNIQUE (tournament_sport_id, branch, year)
);

-- Only the result states confirmed in doc/memory.md; tie, forfeit and abandonment arrive in later migrations.
CREATE TABLE matches (
  id bigserial PRIMARY KEY,
  tournament_sport_id bigint NOT NULL REFERENCES tournament_sports(id),
  kind text NOT NULL CHECK (kind IN ('BRACKET', 'CUSTOM')),
  stage text CHECK (stage IN ('SF1', 'SF2', 'FINAL')),
  side_a_team_id bigint REFERENCES teams(id),
  side_b_team_id bigint REFERENCES teams(id),
  scheduled_at timestamptz,
  venue text,
  status text NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED', 'LIVE', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
  correction_route text CHECK (correction_route IN ('OPERATOR', 'MANAGER')),
  config_snapshot jsonb,
  config_version int,
  last_seq int NOT NULL DEFAULT 0,
  CHECK ((kind = 'BRACKET') = (stage IS NOT NULL)),
  CHECK (side_a_team_id IS NULL OR side_a_team_id <> side_b_team_id),
  CHECK ((status = 'REJECTED') = (correction_route IS NOT NULL))
);
CREATE UNIQUE INDEX matches_one_stage ON matches (tournament_sport_id, stage) WHERE stage IS NOT NULL;

CREATE TABLE match_operator_assignments (
  id bigserial PRIMARY KEY,
  match_id bigint NOT NULL REFERENCES matches(id),
  account_id bigint NOT NULL REFERENCES admin_accounts(id),
  assigned_by bigint NOT NULL REFERENCES admin_accounts(id),
  permission text NOT NULL DEFAULT 'SCORE' CHECK (permission = 'SCORE'),
  valid_from timestamptz,
  valid_until timestamptz,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by bigint REFERENCES admin_accounts(id),
  revoke_reason text,
  CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_until > valid_from),
  CHECK (status = 'ACTIVE' OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL))
);
CREATE UNIQUE INDEX one_active_assignment ON match_operator_assignments (match_id) WHERE status = 'ACTIVE';
CREATE INDEX assignment_lookup ON match_operator_assignments (match_id, account_id, status);

CREATE TABLE admin_audit_log (
  id bigserial PRIMARY KEY,
  actor_account_id bigint REFERENCES admin_accounts(id),
  actor_label text,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  request_id text,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (actor_account_id IS NOT NULL OR actor_label IS NOT NULL)
);

-- migrate:down
DROP TABLE admin_audit_log;
DROP TABLE match_operator_assignments;
DROP TABLE matches;
DROP TABLE teams;
DROP TABLE tournament_sports;
DROP TABLE tournaments;
DROP TABLE admin_accounts;
