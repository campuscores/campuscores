-- migrate:up
-- A team's year is its college year, 1st to 4th, not a calendar year. Calendar years (such as the old fake
-- seed's 2027) become NULL first, so the new check never fails. Expand-safe: the running Worker reads year as
-- optional; only a save with a calendar year fails until the new Worker is deployed right after this migration.
UPDATE teams SET year = NULL WHERE year IS NOT NULL AND year NOT BETWEEN 1 AND 4;
ALTER TABLE teams DROP CONSTRAINT teams_year,
  ADD CONSTRAINT teams_year CHECK (year IS NULL OR year BETWEEN 1 AND 4);

-- migrate:down
UPDATE teams SET year = NULL WHERE year IS NOT NULL AND year NOT BETWEEN 2000 AND 2099;
ALTER TABLE teams DROP CONSTRAINT teams_year,
  ADD CONSTRAINT teams_year CHECK (year BETWEEN 2000 AND 2099);
