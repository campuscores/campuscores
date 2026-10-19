-- migrate:up
-- Accepted score actions, in Server_Sequence order. The unique keys are the idempotency and ordering guards.
CREATE TABLE score_actions (
  id bigserial PRIMARY KEY,
  match_id bigint NOT NULL REFERENCES matches(id),
  action_id uuid NOT NULL,
  seq int NOT NULL CHECK (seq >= 1),
  client_seq int NOT NULL CHECK (client_seq >= 1),
  device_id uuid NOT NULL,
  account_id bigint NOT NULL REFERENCES admin_accounts(id),
  type text NOT NULL,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  reverses_action_id uuid,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, action_id),
  UNIQUE (match_id, seq),
  -- A reversal must name an action of the same match.
  FOREIGN KEY (match_id, reverses_action_id) REFERENCES score_actions (match_id, action_id)
);
-- Current derived state per match; `data` is the public snapshot sent to Live_Rooms.
CREATE TABLE match_snapshots (
  match_id bigint PRIMARY KEY REFERENCES matches(id),
  seq int NOT NULL CHECK (seq >= 1),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Committed changes waiting for publish; the Outbox_Sweep resends undelivered rows in (match_id, seq) order.
CREATE TABLE outbox_events (
  id bigserial PRIMARY KEY,
  match_id bigint NOT NULL REFERENCES matches(id),
  seq int NOT NULL CHECK (seq >= 1),
  room_message jsonb NOT NULL,
  card jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
CREATE INDEX outbox_undelivered ON outbox_events (match_id, seq) WHERE delivered_at IS NULL;
-- migrate:down
DROP TABLE outbox_events;
DROP TABLE match_snapshots;
DROP TABLE score_actions;
