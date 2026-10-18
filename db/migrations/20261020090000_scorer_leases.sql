-- migrate:up
-- One lease per match: the assignment says who may score, the lease says which device scores now.
CREATE TABLE scorer_leases (
  match_id bigint PRIMARY KEY REFERENCES matches(id),
  account_id bigint NOT NULL REFERENCES admin_accounts(id),
  device_id uuid NOT NULL,
  last_client_seq int NOT NULL DEFAULT 0 CHECK (last_client_seq >= 0),
  acquired_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scorer_leases_account ON scorer_leases (account_id);
-- migrate:down
DROP TABLE scorer_leases;
