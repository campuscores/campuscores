// Lock-order concurrency (Requirement 15.11, task 10.4). The lock order is match rows first then the
// tournament row everywhere (design: START and the match paths take `matches FOR UPDATE` then
// `tournaments FOR SHARE`; the status change takes `tournaments FOR UPDATE` only; the Draft delete
// takes `matches FOR UPDATE` then `tournaments FOR UPDATE`). Because no path ever locks the tournament
// before a match it also needs, there is no ABBA cycle and a deadlock (40P01) cannot surface.
//
// These cases need a live database, so they follow the DB-gated convention of operator-scoring.spec.js:
// `describe.skipIf(!env.HYPERDRIVE_UNCACHED)` runs them in CI with REQUIRE_DB=1 and skips them locally.
// The fixture, `api`/`one`/`db` helpers and the afterAll cleanup mirror that file.
import { env } from 'cloudflare:workers';
import { afterAll, describe, expect, it } from 'vitest';
import { api, db, one } from './helpers.js';
import { DEFAULT_FORMATS } from '../../shared/scoring.mjs';

// Each fixture builds one tournament (status from the option), one sport, two teams and one SCHEDULED
// match with an ACTIVE operator assignment and lease, exactly as operator-scoring.spec.js does, so
// `send('START', { format })` can drive the START path. It also creates a separate ACTIVE SUPER_ADMIN
// account (`manager`) to drive the manager endpoints; a Super_Admin passes scope unconditionally, so it
// need not own the tournament. `scheduledAt` defaults to `now()` so START is at or after the scheduled
// time and inside the match day.
const created = [];
async function fixture({ status = 'ONGOING', scheduledAt = 'now()', sport = 'badminton' } = {}) {
  const suffix = crypto.randomUUID();
  const { id: accountId } = await one("INSERT INTO admin_accounts (clerk_user_id, role) VALUES ($1, 'MATCH_OPERATOR') RETURNING id", [`test_lock_op_${suffix}`]);
  const { id: managerId } = await one("INSERT INTO admin_accounts (clerk_user_id, role) VALUES ($1, 'SUPER_ADMIN') RETURNING id", [`test_lock_admin_${suffix}`]);
  const slug = `test-lock-${suffix}`;
  const { id: tournamentId } = await one("INSERT INTO tournaments (slug, name, status, owner_account_id) VALUES ($1, 'Lock order test', $2, $3) RETURNING id", [slug, status, accountId]);
  const { id: ts } = await one('INSERT INTO tournament_sports (tournament_id, sport) VALUES ($1, $2) RETURNING id', [tournamentId, sport]);
  const { id: alpha } = await one("INSERT INTO teams (tournament_sport_id, branch, year, label) VALUES ($1, 'A', 2026, 'Alpha') RETURNING id", [ts]);
  const { id: bravo } = await one("INSERT INTO teams (tournament_sport_id, branch, year, label) VALUES ($1, 'B', 2026, 'Bravo') RETURNING id", [ts]);
  const { id: matchId } = await one(`INSERT INTO matches (tournament_sport_id, kind, side_a_team_id, side_b_team_id, scheduled_at) VALUES ($1, 'CUSTOM', $2, $3, ${scheduledAt}) RETURNING id`, [ts, alpha, bravo]);
  await one('INSERT INTO match_operator_assignments (match_id, account_id, assigned_by, valid_from, valid_until) VALUES ($1, $2, $2, now() - interval \'1 hour\', now() + interval \'1 hour\') RETURNING id', [matchId, accountId]);
  const deviceId = crypto.randomUUID(), user = `test_lock_op_${suffix}`, manager = `test_lock_admin_${suffix}`;
  await one('INSERT INTO scorer_leases (match_id, account_id, device_id) VALUES ($1, $2, $3) RETURNING match_id', [matchId, accountId, deviceId]);
  const f = { accountId, managerId, tournamentId, ts, matchId, slug, user, manager, deviceId };
  created.push(f);
  // One START attempt. Returns the HTTP status and parsed body so a scenario can assert the outcome.
  f.start = async (format = DEFAULT_FORMATS.badminton) => {
    const body = { actionId: crypto.randomUUID(), deviceId, clientSeq: 1, type: 'START', payload: { format } };
    const res = await api('POST', `/api/matches/${matchId}/actions`, { user, body, env: { ENABLE_TEST_ENGINE: 'false' } });
    return { status: res.status, data: await res.json() };
  };
  // The current match status, or null when the match row no longer exists (e.g. after a delete).
  f.matchStatus = async () => (await one('SELECT status FROM matches WHERE id = $1', [matchId]))?.status ?? null;
  f.tournamentStatus = async () => (await one('SELECT status FROM tournaments WHERE id = $1', [tournamentId]))?.status ?? null;
  // Count every row in the tournament subtree, so a scenario can assert nothing is orphaned.
  f.counts = () => one(
    `SELECT (SELECT count(*)::int FROM tournaments WHERE id = $1) AS tournaments,
            (SELECT count(*)::int FROM tournament_sports WHERE tournament_id = $1) AS sports,
            (SELECT count(*)::int FROM teams WHERE tournament_sport_id = $2) AS teams,
            (SELECT count(*)::int FROM matches WHERE tournament_sport_id = $2) AS matches,
            (SELECT count(*)::int FROM match_operator_assignments WHERE match_id = $3) AS assignments,
            (SELECT count(*)::int FROM scorer_leases WHERE match_id = $3) AS leases,
            (SELECT count(*)::int FROM score_actions WHERE match_id = $3) AS actions`,
    [tournamentId, ts, matchId],
  );
  return f;
}

// Removes every row each fixture created, children before parents, ignoring already-deleted rows.
afterAll(async () => {
  if (!created.length) return;
  await db(async (c) => {
    for (const f of created) {
      await c.query('DELETE FROM admin_audit_log WHERE actor_account_id IN ($1, $2)', [f.accountId, f.managerId]);
      for (const table of ['outbox_events', 'match_snapshots', 'score_actions', 'scorer_leases', 'match_operator_assignments']) await c.query(`DELETE FROM ${table} WHERE match_id = $1`, [f.matchId]);
      await c.query('DELETE FROM matches WHERE id = $1', [f.matchId]);
      await c.query('DELETE FROM teams WHERE tournament_sport_id = $1', [f.ts]);
      await c.query('DELETE FROM tournament_sport_managers WHERE tournament_sport_id = $1', [f.ts]);
      await c.query('DELETE FROM tournament_sports WHERE id = $1', [f.ts]);
      await c.query('DELETE FROM tournaments WHERE id = $1', [f.tournamentId]);
      await c.query('DELETE FROM admin_accounts WHERE id IN ($1, $2)', [f.accountId, f.managerId]);
    }
  });
});

const codeOf = (res) => res.data?.error?.code ?? null;
const deadlocked = (res) => res.status === 500 && codeOf(res) === '40P01';

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('lock order under concurrency', () => {
  // Scenario A: START of the match races a change of the tournament to COMPLETED.
  // START locks the match then reads the tournament FOR SHARE; the status change locks the tournament
  // FOR UPDATE then reads the LIVE count. The incompatible tournament locks serialize the two, so one
  // of exactly two coherent outcomes results, with no deadlock and no partial write:
  //   A1 START won  -> match LIVE (200); the completion re-reads a LIVE match and is refused
  //                    409 LIVE_MATCHES; the tournament stays ONGOING.
  //   A2 completion won -> tournament COMPLETED (200); START re-reads a non-ONGOING tournament under
  //                    its share lock and is refused 409 TOURNAMENT_NOT_ONGOING; the match stays SCHEDULED.
  it('concurrent START and change to Completed finish without deadlock and leave a consistent state', async () => {
    const f = await fixture({ status: 'ONGOING', scheduledAt: 'now()' });
    const [start, complete] = await Promise.all([
      f.start(),
      api('POST', `/api/manage/tournaments/${f.slug}/status`, { user: f.manager, body: { status: 'COMPLETED' } }).then(async (r) => ({ status: r.status, data: await r.json() })),
    ]);

    expect(deadlocked(start), `START deadlocked: ${JSON.stringify(start.data)}`).toBe(false);
    expect(deadlocked(complete), `status change deadlocked: ${JSON.stringify(complete.data)}`).toBe(false);

    const matchStatus = await f.matchStatus();
    const tournamentStatus = await f.tournamentStatus();

    if (start.status === 200) {
      // A1: START won. The match is LIVE and the completion was refused with no status write.
      expect(matchStatus).toBe('LIVE');
      expect(complete.status).toBe(409);
      expect(codeOf(complete)).toBe('LIVE_MATCHES');
      expect(tournamentStatus).toBe('ONGOING');
    } else {
      // A2: the completion won. START was refused and nothing was scored.
      expect(complete.status).toBe(200);
      expect(tournamentStatus).toBe('COMPLETED');
      expect(start.status).toBe(409);
      expect(codeOf(start)).toBe('TOURNAMENT_NOT_ONGOING');
      expect(matchStatus).toBe('SCHEDULED');
      expect((await f.counts()).actions).toBe(0);
    }
  });

  // Scenario B: START races a delete of the DRAFT tournament.
  // A DRAFT tournament never allows START (it is not ONGOING), so START cannot succeed here. Both paths
  // lock the match before the tournament (START: FOR UPDATE then FOR SHARE; delete: FOR UPDATE then
  // FOR UPDATE), so they serialize on the match row with no ABBA deadlock. The delete is valid for a
  // Draft, so it completes and removes the whole subtree. START is refused either way:
  //   - 404 NOT_FOUND when its match lock runs after the delete removed the match row, or
  //   - 409 TOURNAMENT_NOT_ONGOING when it reads the still-Draft tournament before the delete commits.
  // The end state is the deleted tournament with no orphaned child rows and no score action written.
  it('concurrent START and Draft delete finish without deadlock and leave a consistent state', async () => {
    const f = await fixture({ status: 'DRAFT', scheduledAt: 'now()' });
    const [start, remove] = await Promise.all([
      f.start(),
      api('DELETE', `/api/manage/tournaments/${f.slug}`, { user: f.manager }).then(async (r) => ({ status: r.status, data: await r.json() })),
    ]);

    expect(deadlocked(start), `START deadlocked: ${JSON.stringify(start.data)}`).toBe(false);
    expect(deadlocked(remove), `delete deadlocked: ${JSON.stringify(remove.data)}`).toBe(false);

    // The Draft delete always succeeds and removes the subtree.
    expect(remove.status).toBe(200);
    expect(remove.data.removed).toMatchObject({ sports: 1, teams: 2, matches: 1, assignments: 1 });

    // START never started the match: it was refused with a documented code (404 or 409).
    expect(start.status).not.toBe(200);
    expect([404, 409]).toContain(start.status);
    expect(['NOT_FOUND', 'TOURNAMENT_NOT_ONGOING']).toContain(codeOf(start));

    // No orphaned rows remain and no score action was written.
    const counts = await f.counts();
    expect(counts).toMatchObject({ tournaments: 0, sports: 0, teams: 0, matches: 0, assignments: 0, leases: 0, actions: 0 });
  });
});
