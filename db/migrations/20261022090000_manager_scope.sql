-- migrate:up
ALTER TABLE admin_accounts ADD COLUMN email text CHECK (email = lower(email)), ADD COLUMN name text;
UPDATE admin_accounts a SET email = i.email
  FROM staff_invitations i WHERE i.accepted_account_id = a.id AND a.email IS NULL;
CREATE UNIQUE INDEX one_active_account_email ON admin_accounts (email) WHERE status = 'ACTIVE';

UPDATE tournaments SET status = 'ONGOING' WHERE status = 'PUBLISHED';
ALTER TABLE tournaments
  ADD CONSTRAINT tournaments_status CHECK (status IN ('DRAFT', 'ONGOING', 'COMPLETED', 'ARCHIVED')),
  ADD CONSTRAINT tournaments_slug CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND slug ~ '[a-z]'),
  ADD COLUMN image_key text CHECK (image_key IN ('field', 'stadium', 'court', 'tennis', 'track')),
  ADD COLUMN owner_account_id bigint REFERENCES admin_accounts(id);
UPDATE tournaments SET owner_account_id =
  (SELECT min(id) FROM admin_accounts WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE');
ALTER TABLE tournaments ALTER COLUMN owner_account_id SET NOT NULL;  -- fails loudly if a tournament has no owner

CREATE TABLE tournament_sport_managers (
  tournament_sport_id bigint NOT NULL REFERENCES tournament_sports(id),
  account_id bigint NOT NULL REFERENCES admin_accounts(id),
  added_by bigint NOT NULL REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_sport_id, account_id)
);
CREATE INDEX sport_managers_account ON tournament_sport_managers (account_id);

ALTER TABLE teams ALTER COLUMN branch DROP NOT NULL, ALTER COLUMN year DROP NOT NULL,
  DROP CONSTRAINT teams_tournament_sport_id_branch_year_key,
  ADD CONSTRAINT teams_year CHECK (year BETWEEN 2000 AND 2099),
  ADD COLUMN players jsonb NOT NULL DEFAULT '[]'
    CHECK (jsonb_typeof(players) = 'array' AND jsonb_array_length(players) <= 30);
CREATE UNIQUE INDEX teams_unique_name ON teams (tournament_sport_id, lower(btrim(label)));

-- migrate:down
DROP INDEX teams_unique_name;
ALTER TABLE teams DROP COLUMN players, DROP CONSTRAINT teams_year;  -- branch/year NOT NULL and the old unique key are not restored if NULL rows exist
DROP TABLE tournament_sport_managers;
ALTER TABLE tournaments DROP COLUMN owner_account_id, DROP COLUMN image_key,
  DROP CONSTRAINT tournaments_slug, DROP CONSTRAINT tournaments_status;
UPDATE tournaments SET status = 'PUBLISHED' WHERE status = 'ONGOING';
DROP INDEX one_active_account_email;
ALTER TABLE admin_accounts DROP COLUMN name, DROP COLUMN email;
