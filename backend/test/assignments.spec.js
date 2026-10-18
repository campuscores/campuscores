import { env, exports as workerExports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { api, db, one } from './helpers.js';

describe('assignment and lease routes without a token', () => {
  it('return 401 UNAUTHENTICATED', async () => {
    for (const [method, path] of [
      ['POST', '/api/matches/1/assignments'],
      ['POST', '/api/assignments/1/revoke'],
      ['GET', '/api/operator/matches'],
      ['POST', '/api/matches/1/lease'],
      ['DELETE', '/api/matches/1/lease'],
    ]) {
      const res = await workerExports.default.fetch(new Request(`http://example.com${path}`, { method }));
      expect(res.status, path).toBe(401);
      expect((await res.json()).error.code, path).toBe('UNAUTHENTICATED');
    }
  });
});

const code = async (res) => [res.status, (await res.json()).error?.code];

// A throwaway operator and CUSTOM match per test, so the shared seed rows never change.
async function fixture() {
  const user = `test_assign_${crypto.randomUUID()}`;
  const { id: accountId } = await one(`INSERT INTO admin_accounts (clerk_user_id, role) VALUES ($1, 'MATCH_OPERATOR') RETURNING id`, [user]);
  const { id: matchId } = await one(`INSERT INTO matches (tournament_sport_id, kind, status) VALUES (2, 'CUSTOM', 'LIVE') RETURNING id`);
  const cleanup = () =>
    db(async (client) => {
      const { rows } = await client.query('SELECT id FROM match_operator_assignments WHERE match_id = $1', [matchId]);
      await client.query(
        `DELETE FROM admin_audit_log WHERE (entity = 'match_operator_assignments' AND entity_id = ANY($1))
           OR (entity = 'scorer_leases' AND entity_id = $2)`,
        [rows.map((r) => r.id), matchId],
      );
      await client.query('DELETE FROM scorer_leases WHERE match_id = $1', [matchId]);
      await client.query('DELETE FROM match_operator_assignments WHERE match_id = $1', [matchId]);
      await client.query('DELETE FROM matches WHERE id = $1', [matchId]);
      await client.query('DELETE FROM admin_accounts WHERE id = $1', [accountId]);
    });
  return { user, accountId, matchId, cleanup };
}

const assign = (matchId, body, user = 'test_tournament_manager') => api('POST', `/api/matches/${matchId}/assignments`, { user, body });
const auditOf = (entityId, action) =>
  one(`SELECT actor_account_id, reason FROM admin_audit_log WHERE entity = 'match_operator_assignments' AND entity_id = $1 AND action = $2`, [
    entityId,
    action,
  ]);

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('assignment routes', () => {
  it('assigns an operator, requires a reason to reassign, and self-assigns a manager in one audited step', async () => {
    const f = await fixture();
    try {
      expect(await code(await assign(f.matchId, { accountId: f.accountId }, 'test_match_operator'))).toEqual([403, 'ROLE_FORBIDDEN']);
      expect(await code(await assign(f.matchId, { accountId: '1' }))).toEqual([400, 'BAD_REQUEST']); // a Super Admin, not self
      expect(await code(await assign(f.matchId, { accountId: f.accountId, validFrom: 'soon' }))).toEqual([400, 'BAD_REQUEST']);
      expect(await code(await assign('999999999', { accountId: f.accountId }))).toEqual([404, 'NOT_FOUND']);

      const res = await assign(f.matchId, { accountId: f.accountId });
      expect(res.status).toBe(201);
      const { assignment } = await res.json();
      expect(assignment).toMatchObject({ matchId: f.matchId, accountId: f.accountId, permission: 'SCORE', status: 'ACTIVE', validFrom: null });
      expect(await auditOf(assignment.id, 'ASSIGNMENT_CREATED')).toEqual({ actor_account_id: '2', reason: null });

      await one('INSERT INTO scorer_leases (match_id, account_id, device_id) VALUES ($1, $2, $3) RETURNING match_id', [
        f.matchId,
        f.accountId,
        crypto.randomUUID(),
      ]);
      expect(await code(await assign(f.matchId, { accountId: '2', reason: '  ' }))).toEqual([409, 'REASON_REQUIRED']);
      expect(await one('SELECT status FROM match_operator_assignments WHERE id = $1', [assignment.id])).toEqual({ status: 'ACTIVE' });

      const again = await assign(f.matchId, { accountId: 2, reason: 'manager correction' });
      expect(again.status).toBe(201);
      const self = (await again.json()).assignment;
      expect(self).toMatchObject({ accountId: '2', status: 'ACTIVE' });
      expect(await one('SELECT status, revoked_by, revoke_reason FROM match_operator_assignments WHERE id = $1', [assignment.id])).toEqual({
        status: 'REVOKED',
        revoked_by: '2',
        revoke_reason: 'manager correction',
      });
      expect(await auditOf(assignment.id, 'ASSIGNMENT_REVOKED')).toEqual({ actor_account_id: '2', reason: 'manager correction' });
      expect(await auditOf(self.id, 'SELF_ASSIGNED')).toEqual({ actor_account_id: '2', reason: 'manager correction' });
      expect(await one('SELECT count(*)::int AS n FROM scorer_leases WHERE match_id = $1', [f.matchId])).toEqual({ n: 0 });
    } finally {
      await f.cleanup();
    }
  });

  it('revokes with a reason and lists only the caller active assignments with validNow', async () => {
    const f = await fixture();
    try {
      const { assignment } = await (await assign(f.matchId, { accountId: f.accountId, validUntil: '2999-01-01T00:00:00Z' })).json();
      const listed = await (await api('GET', '/api/operator/matches', { user: f.user })).json();
      expect(listed.matches).toEqual([
        expect.objectContaining({ id: f.matchId, status: 'LIVE', correctionRoute: null, assignmentId: assignment.id, validNow: true }),
      ]);
      expect(listed.matches[0]).not.toHaveProperty('valid_until');

      const revoke = (body, user = 'test_tournament_manager') => api('POST', `/api/assignments/${assignment.id}/revoke`, { user, body });
      expect(await code(await revoke({}))).toEqual([409, 'REASON_REQUIRED']);
      const res = await revoke({ reason: 'swap scorer' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ assignment: { id: assignment.id, status: 'REVOKED' } });
      expect(await auditOf(assignment.id, 'ASSIGNMENT_REVOKED')).toEqual({ actor_account_id: '2', reason: 'swap scorer' });
      expect(await code(await revoke({ reason: 'again' }))).toEqual([404, 'NOT_FOUND']);
      expect((await (await api('GET', '/api/operator/matches', { user: f.user })).json()).matches).toEqual([]);
    } finally {
      await f.cleanup();
    }
  });
});

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('lease routes', () => {
  it('grants, keeps, refuses another device, takes over with a reset sequence and releases', async () => {
    const f = await fixture();
    const lease = (deviceId, extra = {}, user = f.user) => api('POST', `/api/matches/${f.matchId}/lease`, { user, body: { deviceId, ...extra } });
    const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
    try {
      expect(await code(await lease(a))).toEqual([403, 'NOT_ASSIGNED']);
      await assign(f.matchId, { accountId: f.accountId, validFrom: '2999-01-01T00:00:00Z' });
      expect(await code(await lease(a))).toEqual([403, 'OUTSIDE_WINDOW']);
      await db((client) => client.query('UPDATE match_operator_assignments SET valid_from = NULL WHERE match_id = $1', [f.matchId]));
      expect(await code(await lease('not-a-uuid'))).toEqual([400, 'BAD_REQUEST']);

      const granted = await lease(a.toUpperCase());
      expect(granted.status).toBe(200);
      expect((await granted.json()).lease).toEqual({ matchId: f.matchId, deviceId: a, lastClientSeq: 0, decision: 'GRANT' });
      await db((client) => client.query('UPDATE scorer_leases SET last_client_seq = 5 WHERE match_id = $1', [f.matchId]));
      expect((await (await lease(a)).json()).lease).toMatchObject({ decision: 'KEEP', lastClientSeq: 5 });
      expect(await code(await lease(b))).toEqual([409, 'LEASE_HELD']);

      expect((await (await lease(b, { takeover: true })).json()).lease).toMatchObject({ deviceId: b, lastClientSeq: 0, decision: 'TAKEOVER' });
      expect(await one('SELECT device_id, last_client_seq FROM scorer_leases WHERE match_id = $1', [f.matchId])).toEqual({
        device_id: b,
        last_client_seq: 0,
      });
      const audits = await one(
        `SELECT array_agg(action ORDER BY id) AS actions FROM admin_audit_log WHERE entity = 'scorer_leases' AND entity_id = $1`,
        [f.matchId],
      );
      expect(audits.actions).toEqual(['LEASE_GRANTED', 'LEASE_TAKEOVER']);

      // Another staff user's release leaves the lease; the holder's own release removes it.
      expect((await api('DELETE', `/api/matches/${f.matchId}/lease`, { user: 'test_tournament_manager' })).status).toBe(204);
      expect(await one('SELECT count(*)::int AS n FROM scorer_leases WHERE match_id = $1', [f.matchId])).toEqual({ n: 1 });
      expect((await api('DELETE', `/api/matches/${f.matchId}/lease`, { user: f.user })).status).toBe(204);
      expect(await one('SELECT count(*)::int AS n FROM scorer_leases WHERE match_id = $1', [f.matchId])).toEqual({ n: 0 });
    } finally {
      await f.cleanup();
    }
  });
});
