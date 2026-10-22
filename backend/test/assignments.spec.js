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

// A self-contained tournament tree for the task 8.1 scope and state checks, so the match status and
// the tournament status are controllable and the seed rows never change. Owner is a fresh manager; a
// second manager is left out of scope. Returns ids plus an out-of-scope manager user and cleanup.
async function tree({ matchStatus = 'LIVE', tournamentStatus = 'ONGOING' } = {}) {
  const ownerUser = `test_assign_owner_${crypto.randomUUID()}`;
  const outUser = `test_assign_out_${crypto.randomUUID()}`;
  const scorerUser = `test_assign_scorer_${crypto.randomUUID()}`;
  const built = await db(async (client) => {
    const mk = async (text, params) => (await client.query(text, params)).rows[0];
    const { id: ownerId } = await mk(`INSERT INTO admin_accounts (clerk_user_id, role) VALUES ($1, 'TOURNAMENT_MANAGER') RETURNING id`, [ownerUser]);
    const { id: outId } = await mk(`INSERT INTO admin_accounts (clerk_user_id, role) VALUES ($1, 'TOURNAMENT_MANAGER') RETURNING id`, [outUser]);
    const { id: scorerId } = await mk(`INSERT INTO admin_accounts (clerk_user_id, role) VALUES ($1, 'MATCH_OPERATOR') RETURNING id`, [scorerUser]);
    const slug = `test-assign-${crypto.randomUUID().slice(0, 8)}`;
    const { id: tId } = await mk(
      `INSERT INTO tournaments (slug, name, starts_on, ends_on, status, owner_account_id)
       VALUES ($1, 'Assign Tree (fake)', '2026-01-10', '2026-01-10', $2, $3) RETURNING id`,
      [slug, tournamentStatus, ownerId],
    );
    const { id: tsId } = await mk(`INSERT INTO tournament_sports (tournament_id, sport) VALUES ($1, 'badminton') RETURNING id`, [tId]);
    const future = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString();
    const { id: matchId } = await mk(
      `INSERT INTO matches (tournament_sport_id, kind, scheduled_at, status) VALUES ($1, 'CUSTOM', $2, $3) RETURNING id`,
      [tsId, future, matchStatus],
    );
    const { id: assignId } = await mk('INSERT INTO match_operator_assignments (match_id, account_id, assigned_by) VALUES ($1, $2, $3) RETURNING id', [
      matchId,
      scorerId,
      ownerId,
    ]);
    return { ownerId, outId, scorerId, tId, tsId, matchId, assignId };
  });
  const cleanup = () =>
    db(async (client) => {
      await client.query(
        `DELETE FROM admin_audit_log WHERE actor_account_id = ANY($1)
           OR (entity = 'match_operator_assignments' AND entity_id = $2) OR (entity = 'scorer_leases' AND entity_id = $3)`,
        [[built.ownerId, built.outId, built.scorerId].map(Number), built.assignId, built.matchId],
      );
      await client.query('DELETE FROM scorer_leases WHERE match_id = $1', [built.matchId]);
      await client.query('DELETE FROM match_operator_assignments WHERE match_id = $1', [built.matchId]);
      await client.query('DELETE FROM matches WHERE id = $1', [built.matchId]);
      await client.query('DELETE FROM tournament_sports WHERE id = $1', [built.tsId]);
      await client.query('DELETE FROM tournaments WHERE id = $1', [built.tId]);
      await client.query('DELETE FROM admin_accounts WHERE id = ANY($1)', [[built.ownerId, built.outId, built.scorerId]]);
    });
  // ACTIVE assignment count on the match: the no-write proof for a refused assign or revoke.
  const active = async () => (await one(`SELECT count(*)::int AS n FROM match_operator_assignments WHERE match_id = $1 AND status = 'ACTIVE'`, [built.matchId])).n;
  const audits = async () =>
    (await one(`SELECT count(*)::int AS n FROM admin_audit_log WHERE actor_account_id = ANY($1)`, [[built.ownerId, built.outId].map(Number)])).n;
  return { ...built, ownerUser, outUser, scorerUser, cleanup, active, audits };
}

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('assign and revoke scope and state checks (task 8.1)', () => {
  it('refuses assign and revoke on a closed match with 409 MATCH_CLOSED and writes nothing', async () => {
    // APPROVED is a Final match: matchPhase is 'past' regardless of the clock.
    const t = await tree({ matchStatus: 'APPROVED' });
    try {
      const before = [await t.active(), await t.audits()];
      expect(await code(await api('POST', `/api/matches/${t.matchId}/assignments`, { user: t.ownerUser, body: { accountId: t.scorerId, reason: 'swap' } }))).toEqual([
        409,
        'MATCH_CLOSED',
      ]);
      expect(await code(await api('POST', `/api/assignments/${t.assignId}/revoke`, { user: t.ownerUser, body: { reason: 'swap' } }))).toEqual([409, 'MATCH_CLOSED']);
      expect([await t.active(), await t.audits()]).toEqual(before);
    } finally {
      await t.cleanup();
    }
  });

  it('refuses assign and revoke in a locked tournament with 409 TOURNAMENT_LOCKED and writes nothing', async () => {
    // A LIVE match (not closed) in a COMPLETED tournament: the lock check fires, not MATCH_CLOSED.
    const t = await tree({ matchStatus: 'LIVE', tournamentStatus: 'COMPLETED' });
    try {
      const before = [await t.active(), await t.audits()];
      expect(await code(await api('POST', `/api/matches/${t.matchId}/assignments`, { user: t.ownerUser, body: { accountId: t.scorerId, reason: 'swap' } }))).toEqual([
        409,
        'TOURNAMENT_LOCKED',
      ]);
      expect(await code(await api('POST', `/api/assignments/${t.assignId}/revoke`, { user: t.ownerUser, body: { reason: 'swap' } }))).toEqual([
        409,
        'TOURNAMENT_LOCKED',
      ]);
      expect([await t.active(), await t.audits()]).toEqual(before);
    } finally {
      await t.cleanup();
    }
  });

  it('runs the scope check after the match lock and writes nothing for an out-of-scope manager', async () => {
    // A LIVE match in an ONGOING tournament: not closed, not locked, so the out-of-scope manager is
    // refused only by the scope check, which runs after the match lock and before any write.
    const t = await tree({ matchStatus: 'LIVE', tournamentStatus: 'ONGOING' });
    try {
      const before = [await t.active(), await t.audits()];
      expect(await code(await api('POST', `/api/matches/${t.matchId}/assignments`, { user: t.outUser, body: { accountId: t.scorerId, reason: 'swap' } }))).toEqual([
        403,
        'SCOPE_FORBIDDEN',
      ]);
      expect(await code(await api('POST', `/api/assignments/${t.assignId}/revoke`, { user: t.outUser, body: { reason: 'swap' } }))).toEqual([403, 'SCOPE_FORBIDDEN']);
      expect([await t.active(), await t.audits()]).toEqual(before);
    } finally {
      await t.cleanup();
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
