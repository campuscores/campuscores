import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { acceptsScores, evaluateChain, isWithinWindow, leaseDecision, loadScoringContext } from '../src/scoring.js';
import { db } from './helpers.js';
// Example cases; the property tests for these rules arrive with tasks 8.5–8.8.
const t = (s) => new Date(`2026-10-20T${s}:00Z`);
describe('isWithinWindow', () => {
  it('treats the start as inclusive, the end as exclusive and null bounds as open', () => {
    expect(isWithinWindow(t('10:00'), t('10:00'), t('11:00'))).toBe(true);
    expect(isWithinWindow(t('11:00'), t('10:00'), t('11:00'))).toBe(false);
    expect(isWithinWindow(t('09:59'), t('10:00'), null)).toBe(false);
    expect(isWithinWindow(t('09:59'), null, null)).toBe(true);
  });
});
describe('leaseDecision', () => {
  const lease = { accountId: '7', deviceId: 'a' };
  it('grants, keeps, takes over or refuses', () => {
    expect(leaseDecision(null, { accountId: '7', deviceId: 'b' }, true)).toBe('GRANT');
    expect(leaseDecision(lease, { accountId: '8', deviceId: 'b' }, false)).toBe('GRANT');
    expect(leaseDecision(lease, { accountId: '7', deviceId: 'a' }, true)).toBe('KEEP');
    expect(leaseDecision(lease, { accountId: '7', deviceId: 'b', takeover: true }, true)).toBe('TAKEOVER');
    expect(leaseDecision(lease, { accountId: '7', deviceId: 'b' }, true)).toBe('LEASE_HELD');
    expect(leaseDecision(lease, { accountId: '8', deviceId: 'b', takeover: true }, true)).toBe('LEASE_HELD');
  });
});
describe('acceptsScores', () => {
  it('follows the role-aware match state rule', () => {
    const op = { role: 'MATCH_OPERATOR' };
    const mgr = { role: 'TOURNAMENT_MANAGER' };
    expect(acceptsScores({ status: 'LIVE' }, op)).toBe(true);
    expect(acceptsScores({ status: 'REJECTED', correction_route: 'OPERATOR' }, op)).toBe(true);
    expect(acceptsScores({ status: 'REJECTED', correction_route: 'MANAGER' }, op)).toBe(false);
    expect(acceptsScores({ status: 'REJECTED', correction_route: 'MANAGER' }, mgr)).toBe(true);
    expect(acceptsScores({ status: 'PENDING_APPROVAL' }, mgr)).toBe(false);
    expect(acceptsScores({ status: 'APPROVED' }, { role: 'SUPER_ADMIN' })).toBe(false);
  });
});
describe('evaluateChain', () => {
  const ok = {
    userId: 'user_1',
    account: { id: '7', status: 'ACTIVE', role: 'MATCH_OPERATOR' },
    assignment: { validFrom: null, validUntil: t('11:00'), permission: 'SCORE' },
    now: t('10:00'),
    match: { status: 'LIVE' },
    lease: { accountId: '7', deviceId: 'd' },
    deviceId: 'd',
  };
  it('allows a passing context and returns the first failed check otherwise', () => {
    expect(evaluateChain(ok)).toBeNull();
    expect(evaluateChain({ ...ok, userId: null, account: null })).toEqual([401, 'UNAUTHENTICATED']);
    expect(evaluateChain({ ...ok, account: null })).toEqual([403, 'NOT_STAFF']);
    expect(evaluateChain({ ...ok, account: { ...ok.account, status: 'DISABLED' }, assignment: null })).toEqual([403, 'ACCOUNT_DISABLED']);
    expect(evaluateChain({ ...ok, assignment: null })).toEqual([403, 'NOT_ASSIGNED']);
    expect(evaluateChain({ ...ok, now: t('11:00') })).toEqual([403, 'OUTSIDE_WINDOW']);
    expect(evaluateChain({ ...ok, assignment: { ...ok.assignment, permission: 'VIEW' } })).toEqual([403, 'PERMISSION_DENIED']);
    expect(evaluateChain({ ...ok, match: { status: 'APPROVED' }, lease: null })).toEqual([409, 'SCORING_LOCKED']);
    expect(evaluateChain({ ...ok, lease: null })).toEqual([409, 'LEASE_REQUIRED']);
    expect(evaluateChain({ ...ok, deviceId: 'other' })).toEqual([409, 'LEASE_REQUIRED']);
    expect(evaluateChain({ ...ok, lease: { accountId: '8', deviceId: 'd' } })).toEqual([409, 'LEASE_REQUIRED']);
  });
});
// The full authorization matrix arrives with task 8.4.
describe.skipIf(!env.HYPERDRIVE_UNCACHED)('loadScoringContext against Postgres', () => {
  it('feeds evaluateChain: passes for the leased scorer, then 403 after revocation; 404 slot for a missing match', async () => {
    const user = `test_chain_probe_${crypto.randomUUID()}`;
    const device = crypto.randomUUID();
    await db(async (tx) => {
      await tx.query('BEGIN'); // rolled back, so the seed stays unchanged
      try {
        const q = async (text, params) => (await tx.query(text, params)).rows[0];
        const { id: accountId } = await q(`INSERT INTO admin_accounts (clerk_user_id, role) VALUES ($1, 'MATCH_OPERATOR') RETURNING id`, [user]);
        const { id: matchId } = await q(`INSERT INTO matches (tournament_sport_id, kind, status) VALUES (2, 'CUSTOM', 'LIVE') RETURNING id`);
        const { id: assignmentId } = await q(
          `INSERT INTO match_operator_assignments (match_id, account_id, assigned_by, valid_from) VALUES ($1, $2, 1, now()) RETURNING id`,
          [matchId, accountId],
        );
        await tx.query('INSERT INTO scorer_leases (match_id, account_id, device_id, last_client_seq) VALUES ($1, $2, $3, 4)', [matchId, accountId, device]);

        const ctx = await loadScoringContext(tx, matchId, user, device);
        expect(ctx).toMatchObject({
          userId: user,
          deviceId: device,
          match: { id: matchId, status: 'LIVE', correction_route: null, last_seq: 0 },
          account: { id: accountId, status: 'ACTIVE', role: 'MATCH_OPERATOR' },
          assignment: { validUntil: null, permission: 'SCORE' },
          lease: { accountId, deviceId: device, lastClientSeq: 4 },
        });
        expect(ctx.now).toBeInstanceOf(Date);
        expect(evaluateChain(ctx)).toBeNull(); // valid_from = now() is inclusive

        await tx.query(`UPDATE match_operator_assignments SET status = 'REVOKED', revoked_at = now(), revoked_by = 1 WHERE id = $1`, [assignmentId]);
        expect(evaluateChain(await loadScoringContext(tx, matchId, user, device))).toEqual([403, 'NOT_ASSIGNED']);

        expect(await loadScoringContext(tx, '0', user, device)).toBeNull();
      } finally {
        await tx.query('ROLLBACK');
      }
    });
  });
});
