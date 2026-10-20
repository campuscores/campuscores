import { env } from 'cloudflare:workers';
import { afterAll, describe, expect, it } from 'vitest';
import { sweep } from '../src/outbox.js';
import { api, db, one, testCtx } from './helpers.js';
import { DEFAULT_FORMATS } from '../../shared/scoring.mjs';
import { evaluateChain } from '../src/scoring.js';

it('real scoring requires today; a locked result only permits an explicitly authorized replay', () => {
  const ctx = { userId: 'u', account: { id: '1', status: 'ACTIVE' }, assignment: { permission: 'SCORE' }, now: new Date(), deviceId: 'd', match: { status: 'LIVE', isToday: false }, lease: { accountId: '1', deviceId: 'd' } };
  expect(evaluateChain(ctx, { requireToday: true })).toEqual([403, 'NOT_TODAY']);
  ctx.match.status = 'APPROVED';
  expect(evaluateChain(ctx)).toEqual([409, 'SCORING_LOCKED']);
  expect(evaluateChain(ctx, { finalReplay: true })).toBeNull();
  ctx.account.status = 'DISABLED';
  expect(evaluateChain(ctx, { finalReplay: true })).toEqual([403, 'ACCOUNT_DISABLED']);
});

// This graph exists only in the throwaway CI database. No hosted schema/data is changed by local tests.
const created = [];
async function fixture(sport = 'badminton', { past = false, kind = 'BRACKET' } = {}) {
  const suffix = crypto.randomUUID();
  const { id: accountId } = await one("INSERT INTO admin_accounts (clerk_user_id, role) VALUES ($1, 'MATCH_OPERATOR') RETURNING id", [`test_real_${suffix}`]);
  const { id: tournamentId } = await one("INSERT INTO tournaments (slug, name, status) VALUES ($1, 'Scoring test', 'PUBLISHED') RETURNING id", [`test-real-${suffix}`]);
  const { id: ts } = await one('INSERT INTO tournament_sports (tournament_id, sport) VALUES ($1, $2) RETURNING id', [tournamentId, sport]);
  const { id: alpha } = await one("INSERT INTO teams (tournament_sport_id, branch, year, label) VALUES ($1, 'A', 2026, 'Alpha') RETURNING id", [ts]);
  const { id: bravo } = await one("INSERT INTO teams (tournament_sport_id, branch, year, label) VALUES ($1, 'B', 2026, 'Bravo') RETURNING id", [ts]);
  const { id: matchId } = await one("INSERT INTO matches (tournament_sport_id, kind, stage, side_a_team_id, side_b_team_id, scheduled_at) VALUES ($1, $2, $3, $4, $5, now() - $6::interval) RETURNING id", [ts, kind, kind === 'BRACKET' ? 'SF1' : null, alpha, bravo, past ? '2 days' : '0 seconds']);
  const { id: assignmentId } = await one('INSERT INTO match_operator_assignments (match_id, account_id, assigned_by, valid_from, valid_until) VALUES ($1, $2, $2, now() - interval \'1 hour\', now() + interval \'1 hour\') RETURNING id', [matchId, accountId]);
  const deviceId = crypto.randomUUID(), user = `test_real_${suffix}`;
  await one('INSERT INTO scorer_leases (match_id, account_id, device_id) VALUES ($1, $2, $3) RETURNING match_id', [matchId, accountId, deviceId]);
  const f = { accountId, tournamentId, ts, matchId, assignmentId, user, deviceId, clientSeq: 0 };
  created.push(f);
  f.send = async (type, payload = {}, override = {}, bindings = {}) => {
    const body = { actionId: crypto.randomUUID(), deviceId, clientSeq: f.clientSeq + 1, type, payload, ...override };
    const res = await api('POST', `/api/matches/${matchId}/actions`, { user, body, env: { ENABLE_TEST_ENGINE: 'false', ...bindings } });
    const data = await res.json();
    if (res.status === 200) f.clientSeq = Math.max(f.clientSeq, body.clientSeq);
    return { status: res.status, body, data };
  };
  f.rows = () => one('SELECT m.status, m.last_seq, m.config_snapshot, (SELECT count(*)::int FROM score_actions WHERE match_id = m.id) AS actions, (SELECT count(*)::int FROM outbox_events WHERE match_id = m.id) AS outbox, (SELECT count(*)::int FROM admin_audit_log WHERE actor_account_id = $2) AS audits FROM matches m WHERE m.id = $1', [matchId, accountId]);
  return f;
}
afterAll(async () => {
  if (!created.length) return;
  await db(async c => {
    for (const f of created) {
      await c.query('DELETE FROM admin_audit_log WHERE actor_account_id = $1', [f.accountId]);
      for (const table of ['outbox_events', 'match_snapshots', 'score_actions', 'scorer_leases', 'match_operator_assignments']) await c.query(`DELETE FROM ${table} WHERE match_id = $1`, [f.matchId]);
      await c.query('DELETE FROM matches WHERE id = $1', [f.matchId]); await c.query('DELETE FROM teams WHERE tournament_sport_id = $1', [f.ts]); await c.query('DELETE FROM tournament_sports WHERE id = $1', [f.ts]); await c.query('DELETE FROM tournaments WHERE id = $1', [f.tournamentId]); await c.query('DELETE FROM admin_accounts WHERE id = $1', [f.accountId]);
    }
  });
});

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('real sport scoring transactions', () => {
  it.each(Object.keys(DEFAULT_FORMATS))('%s starts, derives a winner and finalizes atomically without the test engine', async sport => {
    const f = await fixture(sport);
    const base = DEFAULT_FORMATS[sport];
    const format = base.model === 'sets' ? { ...base, bestOf: 1, target: 1, decidingTarget: 1, winBy: 1 }
      : base.model === 'tennis' ? { ...base, bestOf: 1, gamesPerSet: 1, gameWinBy: 1, tiebreakAt: 1 } : { ...base, periodCount: 1 };
    const start = await f.send('START', { format }); expect(start.status).toBe(200); expect(start.data.snapshot.status).toBe('LIVE');
    const n = base.model === 'tennis' ? 4 : 1;
    for (let i = 0; i < n; i++) expect((await f.send('POINT', { side: 0 })).status).toBe(200);
    if (base.model === 'periods') expect((await f.send('END_PERIOD')).status).toBe(200);
    const final = await f.send('FINALIZE'); expect(final.status).toBe(200); expect(final.data.snapshot).toMatchObject({ status: 'APPROVED', finalized: true, winner: 0 });
    const rows = await f.rows(); expect(rows.status).toBe('APPROVED'); expect(rows.last_seq).toBe(f.clientSeq); expect(rows.actions).toBe(f.clientSeq); expect(rows.outbox).toBe(f.clientSeq); expect(rows.audits).toBe(f.clientSeq);
    const replay = await f.send('FINALIZE', {}, final.body); expect(replay.status).toBe(200); expect(replay.data).toEqual(final.data); expect(await f.rows()).toEqual(rows);
    const publicRead = await api('GET', `/api/matches/${f.matchId}`); expect(publicRead.status).toBe(200); const view = (await publicRead.json()).match.snapshot; expect(view.winner).toBe(0); expect(view.periods[0].winner).toBe(0); expect(view).not.toHaveProperty('actions');
    for (const [type, payload] of [['POINT', { side: 1 }], ['START', { format }], ['REVERSE', {}]]) {
      const rejected = await f.send(type, payload, type === 'REVERSE' ? { reversesActionId: final.body.actionId } : {}); expect(rejected.status).toBe(409); expect(rejected.data.error.code).toBe('SCORING_LOCKED'); expect(await f.rows()).toEqual(rows);
    }
  });
  it('India-day boundaries use the database timezone rather than the UTC date', async () => {
    const r = await one("SELECT ('2026-10-20T18:29:59Z'::timestamptz AT TIME ZONE 'Asia/Kolkata')::date::text AS before, ('2026-10-20T18:30:00Z'::timestamptz AT TIME ZONE 'Asia/Kolkata')::date::text AS after");
    expect(r).toEqual({ before: '2026-10-20', after: '2026-10-21' });
  });
  it('simultaneous commands cannot both consume the same client sequence', async () => {
    const f = await fixture(); await f.send('START', { format: DEFAULT_FORMATS.badminton });
    const clientSeq = f.clientSeq + 1;
    const results = await Promise.all([f.send('POINT', { side: 0 }, { clientSeq }), f.send('POINT', { side: 1 }, { clientSeq })]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect(await f.rows()).toMatchObject({ last_seq: 2, actions: 2, outbox: 2, audits: 2 });
  });
  it('rejects an invalid format, a wrong date and invalid score input without partial writes', async () => {
    const f = await fixture(); let before = await f.rows();
    expect((await f.send('START', { format: { bestOf: 2 } })).status).toBe(400); expect(await f.rows()).toEqual(before);
    expect((await f.send('START', { format: DEFAULT_FORMATS.badminton })).status).toBe(200); before = await f.rows();
    expect((await f.send('POINT', { side: 9 })).status).toBe(422); expect(await f.rows()).toEqual(before);
    expect((await f.send('START', { format: DEFAULT_FORMATS.badminton })).data.error.code).toBe('FORMAT_LOCKED'); expect(await f.rows()).toEqual(before);
    const past = await fixture('badminton', { past: true }); const unchanged = await past.rows(); const denied = await past.send('START', { format: DEFAULT_FORMATS.badminton }); expect(denied.status).toBe(403); expect(denied.data.error.code).toBe('NOT_TODAY'); expect(await past.rows()).toEqual(unchanged);
  });
  it('unassigned users cannot read the private action log and revocation blocks final replay', async () => {
    const f = await fixture(); const format = { ...DEFAULT_FORMATS.badminton, bestOf: 1, target: 1, decidingTarget: 1, winBy: 1 };
    await f.send('START', { format }); await f.send('POINT', { side: 0 }); const final = await f.send('FINALIZE');
    const read = await api('GET', `/api/operator/matches/${f.matchId}/scoring`, { user: f.user }); expect(read.status).toBe(200); expect((await read.json()).actions).toHaveLength(3);
    expect((await api('GET', `/api/operator/matches/${f.matchId}/scoring`)).status).toBe(401);
    const other = await fixture(); expect((await api('GET', `/api/operator/matches/${f.matchId}/scoring`, { user: other.user })).status).toBe(403);
    await one("UPDATE match_operator_assignments SET status = 'REVOKED', revoked_at = now(), revoked_by = $2 WHERE id = $1 RETURNING id", [f.assignmentId, f.accountId]);
    expect((await f.send('FINALIZE', {}, final.body)).data.error.code).toBe('NOT_ASSIGNED');
  });
  it('real private CUSTOM matches never publish into anonymous rooms, including on sweep retry', async () => {
    const f = await fixture('badminton', { kind: 'CUSTOM' });
    const binding = { idFromName: name => name, get: () => ({ noteWrite: async () => {}, lastWriteAt: async () => Date.now(), publish: async () => { throw new Error('private publish'); }, publishCard: async () => { throw new Error('private publish'); } }) };
    expect((await f.send('START', { format: DEFAULT_FORMATS.badminton }, {}, { ROOMS: binding })).status).toBe(200);
    const outbox = await one('SELECT delivered_at, room_message FROM outbox_events WHERE match_id = $1', [f.matchId]); expect(outbox.room_message.private).toBe(true); expect(outbox.delivered_at).not.toBeNull();
    await one('UPDATE outbox_events SET delivered_at = NULL WHERE match_id = $1 RETURNING id', [f.matchId]);
    const ctx = testCtx(); await sweep({ ...env, ROOMS: binding }, ctx); await ctx.done();
    expect((await one('SELECT delivered_at FROM outbox_events WHERE match_id = $1', [f.matchId])).delivered_at).not.toBeNull();
    expect((await api('GET', `/api/matches/${f.matchId}`)).status).toBe(404);
  });
});