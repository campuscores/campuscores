import { env } from 'cloudflare:workers';
import { afterAll, describe, expect, it } from 'vitest';
import { room, sweep } from '../src/outbox.js';
import { parseAction } from '../src/routes/actions.js';
import { canonicalJson, decideAction, payloadHash } from '../src/scoring.js';
import { api, db, one, testCtx } from './helpers.js';

// Example cases; the decision property test is task 9.6.
describe('decideAction', () => {
  const lease = { lastClientSeq: 3 };
  it('accepts the next clientSeq with seq = last_seq + 1', () => {
    expect(decideAction({ existing: null, lease, lastSeq: 7 }, { clientSeq: 4, payloadHash: 'h' })).toEqual({ kind: 'ACCEPT', seq: 8 });
  });
  it('rejects any other clientSeq with SEQUENCE_CONFLICT', () => {
    for (const clientSeq of [3, 5, 1]) {
      expect(decideAction({ existing: null, lease, lastSeq: 7 }, { clientSeq, payloadHash: 'h' })).toMatchObject({ code: 'SEQUENCE_CONFLICT', status: 409 });
    }
  });
  it('replays an existing action with the same hash, whatever its clientSeq, and refuses a changed one', () => {
    const existing = { seq: 2, payloadHash: 'h', result: { snapshot: {} } };
    expect(decideAction({ existing, lease, lastSeq: 7 }, { clientSeq: 1, payloadHash: 'h' })).toEqual({ kind: 'REPLAY', seq: 2, result: { snapshot: {} } });
    expect(decideAction({ existing, lease, lastSeq: 7 }, { clientSeq: 4, payloadHash: 'x' })).toMatchObject({ code: 'IDEMPOTENCY_MISMATCH', status: 409 });
  });
});

describe('payloadHash', () => {
  const base = { clientSeq: 1, type: 'POINT', payload: { side: 0, note: { a: 1, b: [2, 3] } } };
  it('ignores key order and treats a missing reversesActionId as null', async () => {
    const reordered = { type: 'POINT', payload: { note: { b: [2, 3], a: 1 }, side: 0 }, clientSeq: 1, reversesActionId: null };
    expect(await payloadHash(base)).toBe(await payloadHash(reordered));
    expect(await payloadHash(base)).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalJson({ b: 1, a: [null, 'x'] })).toBe('{"a":[null,"x"],"b":1}');
  });
  it('changes when any hashed field changes', async () => {
    const h = await payloadHash(base);
    for (const change of [{ clientSeq: 2 }, { type: 'REVERSE' }, { payload: { side: 1 } }, { reversesActionId: crypto.randomUUID() }]) {
      expect(await payloadHash({ ...base, ...change })).not.toBe(h);
    }
  });
});

describe('parseAction', () => {
  const ok = { actionId: crypto.randomUUID().toUpperCase(), clientSeq: 1, deviceId: crypto.randomUUID(), type: 'POINT', payload: { side: 0 } };
  it('normalizes UUIDs to lower case and defaults reversesActionId to null', () => {
    expect(parseAction(ok)).toMatchObject({ actionId: ok.actionId.toLowerCase(), reversesActionId: null });
  });
  it.each([
    ['actionId', { actionId: 'x' }],
    ['clientSeq 0', { clientSeq: 0 }],
    ['clientSeq fraction', { clientSeq: 1.5 }],
    ['clientSeq over int4', { clientSeq: 2 ** 31 }],
    ['deviceId', { deviceId: 7 }],
    ['type', { type: '' }],
    ['payload array', { payload: [] }],
    ['payload null', { payload: null }],
    ['reversesActionId', { reversesActionId: 'nope' }],
  ])('400 for a bad %s', (_name, change) => {
    expect(() => parseAction({ ...ok, ...change })).toThrow(expect.objectContaining({ status: 400, code: 'BAD_REQUEST' }));
  });
});

describe('POST /api/matches/:id/actions', () => {
  it('returns 401 without a token and 400 for a malformed match ID', async () => {
    expect((await api('POST', '/api/matches/1/actions', { body: {} })).status).toBe(401);
    expect((await api('POST', '/api/matches/01/actions', { user: 'test_match_operator', body: {} })).status).toBe(400);
  });
});

const code = async (res) => [res.status, (await res.json()).error?.code];

// A room binding whose `publish` and `publishCard` fail for the rooms `fails(name)` picks; others reach the real rooms.
const failingRooms = (fails = () => true) => ({
  idFromName: (name) => name,
  get: (name) =>
    fails(name)
      ? { noteWrite: async () => {}, publish: async () => Promise.reject(new Error('room down')), publishCard: async () => Promise.reject(new Error('room down')) }
      : room(env, name),
});
const runSweep = async (bindings = env) => {
  const ctx = testCtx();
  try {
    await sweep(bindings, ctx);
  } finally {
    await ctx.done();
  }
};

// Committed throwaway scorers: one account and one CUSTOM match each, removed with every row they caused.
// A SUPER_ADMIN scorer reuses the seed test_super_admin: a second committed ACTIVE Super_Admin would
// break the last-Super-Admin cases that other files run in parallel.
function fixtures() {
  const accounts = [];
  const actors = [];
  const matches = [];
  return {
    async scorer(opts = {}) {
      const { role = 'MATCH_OPERATOR', accountStatus = 'ACTIVE', status = 'LIVE', route = null } = opts;
      const { from = null, until = null, assignment = 'ACTIVE', lease = true } = opts;
      const seedAdmin = role === 'SUPER_ADMIN';
      const user = seedAdmin ? 'test_super_admin' : `test_actions_${crypto.randomUUID()}`;
      const deviceId = crypto.randomUUID();
      const { id: accountId } = seedAdmin
        ? await one(`SELECT id FROM admin_accounts WHERE clerk_user_id = $1 AND role = 'SUPER_ADMIN' AND status = 'ACTIVE'`, [user])
        : await one('INSERT INTO admin_accounts (clerk_user_id, role, status) VALUES ($1, $2, $3) RETURNING id', [user, role, accountStatus]);
      if (!seedAdmin) accounts.push(accountId);
      actors.push(accountId);
      const { id: matchId } = await one(
        `INSERT INTO matches (tournament_sport_id, kind, status, correction_route) VALUES (2, 'CUSTOM', $1, $2) RETURNING id`,
        [status, route],
      );
      matches.push(matchId);
      let assignmentId = null;
      if (assignment) {
        // Managers and Super Admins self-assign. null + interval = open bound.
        ({ id: assignmentId } = await one(
          `INSERT INTO match_operator_assignments (match_id, account_id, assigned_by, valid_from, valid_until, status, revoked_at, revoked_by)
           VALUES ($1, $2, $3, now() + $4::interval, now() + $5::interval, $6::text,
                   CASE WHEN $6::text = 'REVOKED' THEN now() END, CASE WHEN $6::text = 'REVOKED' THEN 1 END)
           RETURNING id`,
          [matchId, accountId, role === 'MATCH_OPERATOR' ? 1 : accountId, from, until, assignment],
        ));
      }
      if (lease) await one('INSERT INTO scorer_leases (match_id, account_id, device_id) VALUES ($1, $2, $3)', [matchId, accountId, deviceId]);
      const post = (body = {}, bindings) =>
        api('POST', `/api/matches/${matchId}/actions`, {
          user,
          env: bindings,
          body: { actionId: crypto.randomUUID(), clientSeq: 1, deviceId, type: 'POINT', payload: { side: 0 }, ...body },
        });
      // Every row a score command writes; equal before and after a refused command.
      const rows = () =>
        one(
          `SELECT (SELECT count(*)::int FROM score_actions WHERE match_id = $1) AS actions,
                  (SELECT count(*)::int FROM match_snapshots WHERE match_id = $1) AS snapshots,
                  (SELECT count(*)::int FROM outbox_events WHERE match_id = $1) AS outbox,
                  (SELECT count(*)::int FROM outbox_events WHERE match_id = $1 AND delivered_at IS NULL) AS undelivered,
                  (SELECT count(*)::int FROM admin_audit_log WHERE entity = 'score_actions' AND actor_account_id = $2) AS audits,
                  (SELECT last_seq FROM matches WHERE id = $1) AS last_seq,
                  (SELECT last_client_seq FROM scorer_leases WHERE match_id = $1) AS client_seq`,
          [matchId, accountId],
        );
      return { user, accountId, matchId, assignmentId, deviceId, post, rows };
    },
    cleanup: () =>
      db(async (client) => {
        const { rows } = await client.query('SELECT id::text FROM match_operator_assignments WHERE match_id = ANY($1)', [matches]);
        await client.query(
          `DELETE FROM admin_audit_log WHERE (entity = 'score_actions' AND actor_account_id = ANY($1))
             OR (entity = 'match_operator_assignments' AND entity_id = ANY($2))`,
          [actors, rows.map((r) => r.id)],
        );
        for (const table of ['outbox_events', 'match_snapshots', 'scorer_leases', 'score_actions', 'match_operator_assignments']) {
          await client.query(`DELETE FROM ${table} WHERE match_id = ANY($1)`, [matches]);
        }
        await client.query('DELETE FROM matches WHERE id = ANY($1)', [matches]);
        await client.query('DELETE FROM admin_accounts WHERE id = ANY($1)', [accounts]);
      }),
  };
}

const EMPTY = { actions: 0, snapshots: 0, outbox: 0, undelivered: 0, audits: 0, last_seq: 0, client_seq: 0 };

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('POST /api/matches/:id/actions against Postgres', () => {
  const f = fixtures();
  afterAll(() => f.cleanup());

  it('stores action, snapshot, audit and outbox in one transaction with seq = last_seq + 1, then delivers', async () => {
    const s = await f.scorer();
    const first = await s.post({ payload: { side: 1 } });
    expect(first.status).toBe(200);
    const accepted = await first.json();
    expect(accepted).toMatchObject({ seq: 1, snapshot: { matchId: s.matchId, status: 'LIVE', corrected: false } });
    expect(accepted.snapshot.sides.map((x) => x.points)).toEqual([0, 1]);

    await one('UPDATE matches SET last_seq = 6 WHERE id = $1', [s.matchId]); // "previous" need not be 1
    const actionId = crypto.randomUUID();
    const second = await (await s.post({ actionId, clientSeq: 2 })).json();
    expect(second).toMatchObject({ actionId, seq: 7 });
    expect(second.snapshot.sides.map((x) => x.points)).toEqual([1, 1]);
    expect(await s.rows()).toEqual({ actions: 2, snapshots: 1, outbox: 2, undelivered: 0, audits: 2, last_seq: 7, client_seq: 2 });

    // now() is fixed per transaction, so equal timestamps prove one transaction.
    const stored = await one(
      `SELECT a.seq, a.client_seq, a.type, a.result, s.seq AS snapshot_seq, s.data AS snapshot, o.room_message, o.card,
              au.action AS audit_action, au.after AS audit_after,
              a.created_at = o.created_at AND o.created_at = au.created_at AND s.updated_at = o.created_at AS same_tx
       FROM score_actions a
       JOIN match_snapshots s ON s.match_id = a.match_id
       JOIN outbox_events o ON o.match_id = a.match_id AND o.seq = a.seq
       JOIN admin_audit_log au ON au.entity = 'score_actions' AND au.entity_id = a.action_id::text
       WHERE a.match_id = $1 AND a.action_id = $2`,
      [s.matchId, actionId],
    );
    expect(stored).toMatchObject({
      seq: 7,
      client_seq: 2,
      type: 'POINT',
      result: { snapshot: second.snapshot },
      snapshot_seq: 7,
      snapshot: second.snapshot,
      room_message: { type: 'snapshot', room: `match:${s.matchId}`, seq: 7, data: second.snapshot },
      card: { id: s.matchId, status: 'LIVE', score: [1, 1] },
      audit_action: 'SCORE_ACTION',
      audit_after: { seq: 7, clientSeq: 2, deviceId: s.deviceId, type: 'POINT', payload: { side: 0 }, reversesActionId: null },
      same_tx: true,
    });
    // The card carries its tournament ID as text, so a tournament page can scope a card its read lacks (Req 17.13).
    const { id: tournamentId } = await one('SELECT tournament_id::text AS id FROM tournament_sports WHERE id = 2');
    expect(stored.card.tournamentId).toBe(tournamentId);
    // The Match_Room holds seq 7, so a resend of it is refused.
    expect(await room(env, `match:${s.matchId}`).publish(second.snapshot, 7)).toBe(false);
  });

  it('replays the same payload with its seq, and refuses a changed payload or a wrong clientSeq without storing rows', async () => {
    const s = await f.scorer();
    const point = { actionId: crypto.randomUUID(), clientSeq: 1, type: 'POINT', payload: { side: 1 } };
    const accepted = await (await s.post(point)).json();
    const after = await s.rows();

    const replay = await s.post(point);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(accepted);
    expect(await code(await s.post({ ...point, payload: { side: 0 } }))).toEqual([409, 'IDEMPOTENCY_MISMATCH']);
    expect(await code(await s.post({ clientSeq: 3 }))).toEqual([409, 'SEQUENCE_CONFLICT']);
    expect(await code(await s.post({ clientSeq: 1 }))).toEqual([409, 'SEQUENCE_CONFLICT']);
    expect(await s.rows()).toEqual(after);

    const undo = await (await s.post({ clientSeq: 2, type: 'REVERSE', reversesActionId: point.actionId })).json();
    expect(undo).toMatchObject({ seq: 2, snapshot: { corrected: false } });
    expect(undo.snapshot.sides.map((x) => x.points)).toEqual([0, 0]);
    expect(await one(`SELECT action FROM admin_audit_log WHERE entity = 'score_actions' AND entity_id = $1`, [undo.actionId])).toEqual({
      action: 'SCORE_ACTION_REVERSED',
    });
  });

  it('422 ACTION_INVALID for an engine rejection and 409 SPORT_RULES_OPEN without the Test_Engine; no rows stored', async () => {
    const s = await f.scorer();
    const bad = await s.post({ payload: { side: 2 } });
    expect(bad.status).toBe(422);
    expect((await bad.json()).error).toMatchObject({ code: 'ACTION_INVALID', message: expect.any(String) });
    expect(await code(await s.post({ type: 'REVERSE', reversesActionId: crypto.randomUUID() }))).toEqual([422, 'ACTION_INVALID']);
    expect(await code(await s.post({}, { ENABLE_TEST_ENGINE: undefined }))).toEqual([409, 'SPORT_RULES_OPEN']);
    expect(await s.rows()).toEqual(EMPTY);
  });

  it('returns the accepted result when publish fails and leaves the outbox row for the sweep', async () => {
    const [a, b] = [await f.scorer(), await f.scorer()];
    for (const s of [a, b]) {
      const res = await s.post({}, { ROOMS: failingRooms() });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ seq: 1 });
      expect(await s.rows()).toMatchObject({ actions: 1, outbox: 1, undelivered: 1 });
    }
    await room(env, 'home').noteWrite(); // a recent Write_Signal; the failing stub did not record one

    // A failed publish leaves that match undelivered and the sweep continues with the other match.
    await runSweep({ ...env, ROOMS: failingRooms((name) => name === `match:${a.matchId}`) });
    expect(await a.rows()).toMatchObject({ undelivered: 1 });
    expect(await b.rows()).toMatchObject({ undelivered: 0 });

    await runSweep();
    expect(await a.rows()).toMatchObject({ undelivered: 0 });
    expect(await room(env, `match:${a.matchId}`).publish({}, 1)).toBe(false); // the sweep delivered seq 1
  });
});

// Holds the match row lock in `tx` until `count` commands queue behind it (directly or behind each other).
async function waitForWaiters(tx, count) {
  for (let i = 0; i < 200; i++) {
    await tx.query('SELECT pg_stat_clear_snapshot()'); // pg_stat_activity is otherwise frozen for the whole transaction
    const { rows } = await tx.query(
      `WITH RECURSIVE w AS (
         SELECT pid FROM pg_stat_activity WHERE pg_backend_pid() = ANY (pg_blocking_pids(pid))
         UNION SELECT a.pid FROM pg_stat_activity a JOIN w ON w.pid = ANY (pg_blocking_pids(a.pid)))
       SELECT count(*)::int AS n FROM w`,
    );
    if (rows[0].n >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`fewer than ${count} commands waited on the match lock`);
}

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('concurrent revoke and score action', () => {
  const f = fixtures();
  afterAll(() => f.cleanup());
  const revoke = (s) => api('POST', `/api/assignments/${s.assignmentId}/revoke`, { user: 'test_tournament_manager', body: { reason: 'swap' } });

  // Postgres grants the row lock in arrival order, so the first queued command commits first.
  it.each([
    ['action before revoke', ['action', 'revoke'], 200],
    ['revoke before action', ['revoke', 'action'], 403],
  ])('%s', async (_name, order, actionStatus) => {
    const s = await f.scorer();
    const results = await db(async (tx) => {
      await tx.query('BEGIN');
      try {
        await tx.query('SELECT 1 FROM matches WHERE id = $1 FOR UPDATE', [s.matchId]);
        const pending = {};
        for (const [i, name] of order.entries()) {
          pending[name] = name === 'action' ? s.post() : revoke(s);
          await waitForWaiters(tx, i + 1);
        }
        await tx.query('COMMIT');
        return { action: await pending.action, revoke: await pending.revoke };
      } catch (err) {
        await tx.query('ROLLBACK');
        throw err;
      }
    });
    expect(results.revoke.status).toBe(200);
    if (actionStatus === 200) {
      expect(results.action.status).toBe(200);
      expect(await s.rows()).toMatchObject({ actions: 1, outbox: 1, last_seq: 1, client_seq: null }); // revoke then deleted the lease
    } else {
      expect(await code(results.action)).toEqual([403, 'NOT_ASSIGNED']);
      expect(await s.rows()).toEqual({ ...EMPTY, client_seq: null });
    }
  }, 15000);
});

// The 8.4 matrix (authz-matrix.spec.js) over HTTP on the scoring route. "At valid_until" here means the bound
// equals the fixture insert time, so the request is at or after it; the exact-instant case is in authz-matrix.spec.js.
describe.skipIf(!env.HYPERDRIVE_UNCACHED)('scoring authorization matrix on POST /api/matches/:id/actions', () => {
  const f = fixtures();
  afterAll(() => f.cleanup());
  const OK = [200, undefined];
  it.each([
    ['unassigned', { assignment: null }, [403, 'NOT_ASSIGNED']],
    ['before valid_from', { from: '1 hour' }, [403, 'OUTSIDE_WINDOW']],
    ['at valid_until', { until: '0 seconds' }, [403, 'OUTSIDE_WINDOW']],
    ['revoked assignment', { assignment: 'REVOKED' }, [403, 'NOT_ASSIGNED']],
    ['disabled account', { accountStatus: 'DISABLED' }, [403, 'ACCOUNT_DISABLED']],
    ['PENDING_APPROVAL', { status: 'PENDING_APPROVAL' }, [409, 'SCORING_LOCKED']],
    ['APPROVED', { status: 'APPROVED' }, [409, 'SCORING_LOCKED']],
    ['no lease', { lease: false }, [409, 'LEASE_REQUIRED']],
    ['LIVE operator', {}, OK],
    ['REJECTED/OPERATOR operator', { status: 'REJECTED', route: 'OPERATOR' }, OK],
    ['REJECTED/MANAGER operator', { status: 'REJECTED', route: 'MANAGER' }, [409, 'SCORING_LOCKED']],
    ['REJECTED/MANAGER self-assigned manager', { status: 'REJECTED', route: 'MANAGER', role: 'TOURNAMENT_MANAGER' }, OK],
    ['REJECTED/MANAGER self-assigned Super Admin', { status: 'REJECTED', route: 'MANAGER', role: 'SUPER_ADMIN' }, OK],
  ])('%s', async (_name, opts, expected) => {
    const s = await f.scorer(opts);
    expect(await code(await s.post())).toEqual(expected);
    const leaseSeq = opts.lease === false ? null : expected[0] === 200 ? 1 : 0;
    expect(await s.rows()).toMatchObject(expected[0] === 200 ? { actions: 1, outbox: 1, audits: 1, last_seq: 1, client_seq: leaseSeq } : { ...EMPTY, client_seq: leaseSeq });
  });
});
