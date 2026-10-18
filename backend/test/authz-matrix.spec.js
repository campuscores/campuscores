// Phase-3 authorization matrix (task 8.4). Cases already in scoring.spec.js, assignments.spec.js and
// accounts.spec.js are not repeated here.
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { evaluateChain, loadScoringContext } from '../src/scoring.js';
import { api, db, one } from './helpers.js';

const code = async (res) => [res.status, (await res.json()).error?.code];

// Every case runs in one rolled-back transaction, so now() is the same fixed value for each case
// ("at valid_until" is exact) and the seed stays unchanged.
describe.skipIf(!env.HYPERDRIVE_UNCACHED)('authorization chain matrix against Postgres', () => {
  const OK = null;
  const CASES = [
    ['no staff account', { role: null }, [403, 'NOT_STAFF']],
    ['disabled account with an ACTIVE assignment', { accountStatus: 'DISABLED' }, [403, 'ACCOUNT_DISABLED']],
    ['unassigned', { assigned: false }, [403, 'NOT_ASSIGNED']],
    ['before valid_from', { from: '1 second' }, [403, 'OUTSIDE_WINDOW']],
    ['at valid_until', { until: '0 seconds' }, [403, 'OUTSIDE_WINDOW']],
    ['just before valid_until', { until: '1 millisecond' }, OK],
    ['SCHEDULED', { status: 'SCHEDULED' }, [409, 'SCORING_LOCKED']],
    ['PENDING_APPROVAL', { status: 'PENDING_APPROVAL' }, [409, 'SCORING_LOCKED']],
    ['APPROVED', { status: 'APPROVED' }, [409, 'SCORING_LOCKED']],
    ['no lease', { lease: null }, [409, 'LEASE_REQUIRED']],
    ['lease on another device', { lease: 'other' }, [409, 'LEASE_REQUIRED']],
    ['LIVE operator', {}, OK],
    ['REJECTED/OPERATOR operator', { status: 'REJECTED', route: 'OPERATOR' }, OK],
    ['REJECTED/MANAGER operator', { status: 'REJECTED', route: 'MANAGER' }, [409, 'SCORING_LOCKED']],
    ['REJECTED/MANAGER self-assigned manager', { status: 'REJECTED', route: 'MANAGER', role: 'TOURNAMENT_MANAGER' }, OK],
    ['REJECTED/MANAGER self-assigned Super Admin', { status: 'REJECTED', route: 'MANAGER', role: 'SUPER_ADMIN' }, OK],
  ];

  it.each(CASES)('%s', async (_name, opts, expected) => {
    const { role = 'MATCH_OPERATOR', accountStatus = 'ACTIVE', status = 'LIVE', route = null } = opts;
    const { assigned = true, from = null, until = null, lease = 'own' } = opts;
    const user = `test_matrix_${crypto.randomUUID()}`;
    const device = crypto.randomUUID();
    await db(async (tx) => {
      await tx.query('BEGIN');
      try {
        const q = async (text, params) => (await tx.query(text, params)).rows[0];
        const account = role && (await q('INSERT INTO admin_accounts (clerk_user_id, role, status) VALUES ($1, $2, $3) RETURNING id', [user, role, accountStatus]));
        const { id: matchId } = await q(
          `INSERT INTO matches (tournament_sport_id, kind, status, correction_route) VALUES (2, 'CUSTOM', $1, $2) RETURNING id`,
          [status, route],
        );
        if (account && assigned) {
          // Managers and Super Admins self-assign; operators are assigned by the seed Super Admin. null + interval = open bound.
          await tx.query(
            `INSERT INTO match_operator_assignments (match_id, account_id, assigned_by, valid_from, valid_until)
             VALUES ($1, $2, $3, now() + $4::interval, now() + $5::interval)`,
            [matchId, account.id, role === 'MATCH_OPERATOR' ? 1 : account.id, from, until],
          );
        }
        if (account && lease) {
          await tx.query('INSERT INTO scorer_leases (match_id, account_id, device_id) VALUES ($1, $2, $3)', [
            matchId,
            account.id,
            lease === 'own' ? device : crypto.randomUUID(),
          ]);
        }
        expect(evaluateChain(await loadScoringContext(tx, matchId, user, device))).toEqual(expected);
      } finally {
        await tx.query('ROLLBACK');
      }
    });
  });
});

// Committed fixtures for the HTTP cases: throwaway accounts and CUSTOM matches, removed with their audit rows.
function fixtures() {
  const accounts = [];
  const matches = [];
  return {
    async account(role = 'MATCH_OPERATOR') {
      const user = `test_matrix_${crypto.randomUUID()}`;
      const { id } = await one('INSERT INTO admin_accounts (clerk_user_id, role) VALUES ($1, $2) RETURNING id', [user, role]);
      accounts.push(id);
      return { id, user };
    },
    async match(status = 'LIVE') {
      const { id } = await one(`INSERT INTO matches (tournament_sport_id, kind, status) VALUES (2, 'CUSTOM', $1) RETURNING id`, [status]);
      matches.push(id);
      return id;
    },
    cleanup: () =>
      db(async (client) => {
        const { rows } = await client.query('SELECT id FROM match_operator_assignments WHERE match_id = ANY($1) OR account_id = ANY($2)', [matches, accounts]);
        await client.query(
          `DELETE FROM admin_audit_log WHERE (entity = 'match_operator_assignments' AND entity_id = ANY($1))
             OR (entity = 'scorer_leases' AND entity_id = ANY($2)) OR (entity = 'admin_accounts' AND entity_id = ANY($3))`,
          [rows.map((r) => r.id), matches, accounts],
        );
        await client.query('DELETE FROM scorer_leases WHERE match_id = ANY($1) OR account_id = ANY($2)', [matches, accounts]);
        await client.query('DELETE FROM match_operator_assignments WHERE id = ANY($1)', [rows.map((r) => r.id)]);
        await client.query('DELETE FROM matches WHERE id = ANY($1)', [matches]);
        await client.query('DELETE FROM admin_accounts WHERE id = ANY($1)', [accounts]);
      }),
  };
}

const assign = (matchId, body, user = 'test_tournament_manager') => api('POST', `/api/matches/${matchId}/assignments`, { user, body });
const lease = (matchId, user, deviceId) => api('POST', `/api/matches/${matchId}/lease`, { user, body: { deviceId } });
const chain = (matchId, user, deviceId) => db(async (client) => evaluateChain(await loadScoringContext(client, matchId, user, deviceId)));
const activeCount = async (matchId) =>
  (await one(`SELECT count(*)::int AS n FROM match_operator_assignments WHERE match_id = $1 AND status = 'ACTIVE'`, [matchId])).n;

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('authorization matrix over HTTP', () => {
  it('rejects the next call after a revoke and after a disable', async () => {
    const f = fixtures();
    try {
      const op = await f.account();
      const matchId = await f.match();
      const device = crypto.randomUUID();
      const { assignment } = await (await assign(matchId, { accountId: op.id })).json();
      expect((await lease(matchId, op.user, device)).status).toBe(200);
      expect(await chain(matchId, op.user, device)).toBeNull();

      const revoked = await api('POST', `/api/assignments/${assignment.id}/revoke`, { user: 'test_tournament_manager', body: { reason: 'swap' } });
      expect(revoked.status).toBe(200);
      expect(await chain(matchId, op.user, device)).toEqual([403, 'NOT_ASSIGNED']);
      expect(await code(await lease(matchId, op.user, device))).toEqual([403, 'NOT_ASSIGNED']);

      expect((await assign(matchId, { accountId: op.id })).status).toBe(201);
      expect((await lease(matchId, op.user, device)).status).toBe(200);
      const disabled = await api('POST', `/api/accounts/${op.id}/disable`, { user: 'test_super_admin', body: { reason: 'left' } });
      expect(disabled.status).toBe(200);
      expect(await chain(matchId, op.user, device)).toEqual([403, 'ACCOUNT_DISABLED']);
      expect(await code(await lease(matchId, op.user, device))).toEqual([403, 'ACCOUNT_DISABLED']);
      expect(await code(await api('GET', '/api/operator/matches', { user: op.user }))).toEqual([403, 'ACCOUNT_DISABLED']);
    } finally {
      await f.cleanup();
    }
  });

  it('grants the lease to the new scorer when the holder has no ACTIVE assignment', async () => {
    const f = fixtures();
    try {
      const [a, b] = [await f.account(), await f.account()];
      const matchId = await f.match();
      const [devA, devB] = [crypto.randomUUID(), crypto.randomUUID()];
      await assign(matchId, { accountId: a.id });
      expect((await lease(matchId, a.user, devA)).status).toBe(200);
      // Revoke directly so the stale lease stays (the routes delete it), then assign b.
      await db(async (client) => {
        await client.query(`UPDATE match_operator_assignments SET status = 'REVOKED', revoked_at = now(), revoked_by = 1 WHERE match_id = $1`, [matchId]);
        await client.query('INSERT INTO match_operator_assignments (match_id, account_id, assigned_by) VALUES ($1, $2, 1)', [matchId, b.id]);
      });
      const res = await lease(matchId, b.user, devB);
      expect(res.status).toBe(200);
      expect((await res.json()).lease).toEqual({ matchId, deviceId: devB, lastClientSeq: 0, decision: 'GRANT' });
      expect(await one(`SELECT before, after FROM admin_audit_log WHERE entity = 'scorer_leases' AND entity_id = $1 ORDER BY id DESC LIMIT 1`, [matchId])).toEqual({
        before: { accountId: a.id, deviceId: devA },
        after: { accountId: b.id, deviceId: devB },
      });
    } finally {
      await f.cleanup();
    }
  });

  it('blocks an operator from the revoke and disable routes and changes nothing', async () => {
    const f = fixtures();
    try {
      const op = await f.account();
      const matchId = await f.match();
      const { assignment } = await (await assign(matchId, { accountId: op.id })).json();
      // Assign and invite routes are covered for operators in assignments.spec.js and accounts.spec.js.
      expect(await code(await api('POST', `/api/assignments/${assignment.id}/revoke`, { user: op.user, body: { reason: 'x' } }))).toEqual([403, 'ROLE_FORBIDDEN']);
      expect(await code(await api('POST', `/api/accounts/${op.id}/disable`, { user: op.user, body: { reason: 'x' } }))).toEqual([403, 'ROLE_FORBIDDEN']);
      expect(await one('SELECT status FROM match_operator_assignments WHERE id = $1', [assignment.id])).toEqual({ status: 'ACTIVE' });
      expect(await one('SELECT status FROM admin_accounts WHERE id = $1', [op.id])).toEqual({ status: 'ACTIVE' });
    } finally {
      await f.cleanup();
    }
  });

  it('writes the reassignment revoke, insert and audit rows in one transaction', async () => {
    const f = fixtures();
    try {
      const [a, b] = [await f.account(), await f.account()];
      const matchId = await f.match();
      const { assignment: old } = await (await assign(matchId, { accountId: a.id })).json();
      const res = await assign(matchId, { accountId: b.id, reason: 'device failed' });
      expect(res.status).toBe(201);
      const { assignment: created } = await res.json();
      // now() is fixed per transaction, so equal timestamps prove one transaction.
      const { rows } = await db((client) =>
        client.query(
          `SELECT l.action, l.request_id, l.created_at = n.created_at AND o.revoked_at = n.created_at AS same_tx
           FROM admin_audit_log l, match_operator_assignments o, match_operator_assignments n
           WHERE o.id::text = $1 AND n.id::text = $2 AND l.entity = 'match_operator_assignments'
             AND ((l.entity_id = $1 AND l.action = 'ASSIGNMENT_REVOKED') OR (l.entity_id = $2 AND l.action = 'ASSIGNMENT_CREATED'))
           ORDER BY l.id`,
          [old.id, created.id],
        ),
      );
      expect(rows.map((r) => [r.action, r.same_tx])).toEqual([
        ['ASSIGNMENT_REVOKED', true],
        ['ASSIGNMENT_CREATED', true],
      ]);
      expect(rows[0].request_id).toBeTruthy();
      expect(rows[1].request_id).toBe(rows[0].request_id);
      expect(await activeCount(matchId)).toBe(1);
    } finally {
      await f.cleanup();
    }
  });

  it('leaves one ACTIVE assignment after concurrent assigns', async () => {
    const f = fixtures();
    try {
      const [a, b] = [await f.account(), await f.account()];
      const first = await f.match();
      const results = await Promise.all([assign(first, { accountId: a.id }), assign(first, { accountId: b.id })]);
      const outcomes = (await Promise.all(results.map(code))).map(([s, c]) => (s === 201 ? 201 : `${s} ${c}`)).sort();
      expect(outcomes[0]).toBe(201);
      expect(['409 REASON_REQUIRED', '409 ASSIGNMENT_CONFLICT']).toContain(outcomes[1]);
      expect(await activeCount(first)).toBe(1);

      // With reasons both may succeed in turn; the match lock still leaves one ACTIVE row.
      const second = await f.match();
      const both = await Promise.all([assign(second, { accountId: a.id, reason: 'r' }), assign(second, { accountId: b.id, reason: 'r' })]);
      for (const res of both) expect([201, 409]).toContain(res.status);
      expect(await activeCount(second)).toBe(1);
    } finally {
      await f.cleanup();
    }
  });

  it('GET /api/operator/matches lists only the caller ACTIVE assignments with a server-time validNow', async () => {
    const f = fixtures();
    try {
      const [a, b] = [await f.account(), await f.account()];
      const [m1, m2, m3, m4] = [await f.match(), await f.match('SCHEDULED'), await f.match(), await f.match()];
      await assign(m1, { accountId: a.id, validUntil: '2999-01-01T00:00:00Z' });
      await assign(m2, { accountId: a.id, validFrom: '2000-01-01T00:00:00Z', validUntil: '2000-01-02T00:00:00Z' });
      const { assignment: gone } = await (await assign(m3, { accountId: a.id })).json();
      await api('POST', `/api/assignments/${gone.id}/revoke`, { user: 'test_tournament_manager', body: { reason: 'r' } });
      await assign(m4, { accountId: b.id });

      const list = async (user) => (await (await api('GET', '/api/operator/matches', { user })).json()).matches.map((m) => [m.id, m.status, m.validNow]);
      expect(await list(a.user)).toEqual([
        [m1, 'LIVE', true],
        [m2, 'SCHEDULED', false],
      ]);
      expect(await list(b.user)).toEqual([[m4, 'LIVE', true]]);
    } finally {
      await f.cleanup();
    }
  });
});
