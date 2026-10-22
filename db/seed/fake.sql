-- Clearly fake data for CI and staging only. Never run this against production.
-- Explicit IDs make re-runs insert nothing; setval keeps later app inserts clear of these IDs.

INSERT INTO admin_accounts (id, clerk_user_id, role, invited_by, email, name) VALUES
  (1, 'test_super_admin', 'SUPER_ADMIN', NULL, 'test-super-admin@example.test', 'Test Super Admin (fake)'),
  (2, 'test_tournament_manager', 'TOURNAMENT_MANAGER', 1, 'test-manager@example.test', 'Test Manager (fake)'),
  (3, 'test_match_operator', 'MATCH_OPERATOR', 2, 'test-scorer@example.test', 'Test Scorer (fake)')
ON CONFLICT DO NOTHING;

INSERT INTO tournaments (id, slug, name, starts_on, ends_on, status, venue, description, owner_account_id) VALUES
  (1, 'test-fake-cup', 'Test Fake Cup', '2026-01-10', '2026-01-12', 'ONGOING', 'Test Ground (fake)', 'Fake seed tournament for CI and staging.', 2)
ON CONFLICT DO NOTHING;

INSERT INTO tournament_sports (id, tournament_id, sport) VALUES
  (1, 1, 'football'),
  (2, 1, 'badminton')
ON CONFLICT DO NOTHING;

INSERT INTO teams (id, tournament_sport_id, branch, year, label) VALUES
  (1, 1, 'TEST-A', 2027, 'Test Team A (fake)'),
  (2, 1, 'TEST-B', 2027, 'Test Team B (fake)'),
  (3, 1, 'TEST-C', 2028, 'Test Team C (fake)'),
  (4, 1, 'TEST-D', 2028, 'Test Team D (fake)')
ON CONFLICT DO NOTHING;

INSERT INTO matches (id, tournament_sport_id, kind, stage, side_a_team_id, side_b_team_id, scheduled_at, venue, status) VALUES
  (1, 1, 'BRACKET', 'SF1', 1, 2, '2026-01-10 10:00+05:30', 'Test Ground (fake)', 'APPROVED'),
  (2, 1, 'BRACKET', 'SF2', 3, 4, '2026-01-10 14:00+05:30', 'Test Ground (fake)', 'PENDING_APPROVAL'),
  (3, 1, 'BRACKET', 'FINAL', NULL, NULL, '2026-01-12 16:00+05:30', 'Test Ground (fake)', 'SCHEDULED'),
  (4, 1, 'CUSTOM', NULL, 1, 3, '2026-01-11 11:00+05:30', 'Test Ground (fake)', 'SCHEDULED')
ON CONFLICT DO NOTHING;

INSERT INTO match_operator_assignments (id, match_id, account_id, assigned_by) VALUES
  (1, 4, 3, 2)
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('admin_accounts', 'id'), (SELECT max(id) FROM admin_accounts));
SELECT setval(pg_get_serial_sequence('tournaments', 'id'), (SELECT max(id) FROM tournaments));
SELECT setval(pg_get_serial_sequence('tournament_sports', 'id'), (SELECT max(id) FROM tournament_sports));
SELECT setval(pg_get_serial_sequence('teams', 'id'), (SELECT max(id) FROM teams));
SELECT setval(pg_get_serial_sequence('matches', 'id'), (SELECT max(id) FROM matches));
SELECT setval(pg_get_serial_sequence('match_operator_assignments', 'id'), (SELECT max(id) FROM match_operator_assignments));
