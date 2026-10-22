// Phase-3 authorization matrix (task 8.4). Cases already in scoring.spec.js, assignments.spec.js and
// accounts.spec.js are not repeated here.
import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_FORMATS } from '../../shared/scoring.mjs';
import { evaluateChain, loadScoringContext } from '../src/scoring.js';
import { api, db, one, stubClerk } from './helpers.js';

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

// --- Manager endpoint authorization matrix (task 7.5) --------------------
// Every /api/manage/* endpoint is checked against each caller class of Requirement 5.1:
//   anonymous, invalid token, Viewer (signed-in, no staff account), DISABLED member,
//   Match_Scorer (MATCH_OPERATOR), Tournament_Manager out of scope, Sport_Manager in scope,
//   Tournament_Owner and Super_Admin. Each case asserts the Requirement 5.1 status+code and,
//   on any refusal, that nothing was written (no new Audit_Row, child rows unchanged).
//
// The 5.1 check order is: (a) token 401 UNAUTHENTICATED; (b) account/status 403 NOT_STAFF or
// ACCOUNT_DISABLED; (c) role 403 ROLE_FORBIDDEN; (d) body/id 400; (e) unknown entity 404;
// (f) scope 403 SCOPE_FORBIDDEN; (g) state 409. So a role refusal precedes body parsing, and a
// scope refusal only happens once the target exists. The fixtures below give every target endpoint
// a real in-scope target, so the out-of-scope manager reaches step (f) and gets SCOPE_FORBIDDEN
// (not 404). Collection endpoints (home, tournament list/create, match list) have no target, so a
// valid-role caller always passes authz regardless of scope; the scope filter only limits rows.

const AUTHZ_CODES = new Set(['UNAUTHENTICATED', 'NOT_STAFF', 'ACCOUNT_DISABLED', 'ROLE_FORBIDDEN', 'SCOPE_FORBIDDEN']);

// The badminton Official_Preset, used to seed the fixture sport's stored format so a changed-format
// PUT is a real change (not the idempotent no-op path).
const DEFAULT_BADMINTON = DEFAULT_FORMATS.badminton;

// Build a throwaway tournament tree owned by one manager, with a second manager out of scope and a
// Sport_Manager in scope for one sport. Reuses the seed Super_Admin and Match_Scorer. Cleans up its
// accounts, tournament subtree and every audit row it caused, in a finally.
function manageFixtures() {
  const accounts = [];
  const tournaments = [];

  async function account(role) {
    const user = `test_authz_${crypto.randomUUID()}`;
    const email = `test-authz-${crypto.randomUUID()}@example.test`;
    const { id } = await one(
      'INSERT INTO admin_accounts (clerk_user_id, role, status, email, name) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [user, role === 'DISABLED_MEMBER' ? 'TOURNAMENT_MANAGER' : role, role === 'DISABLED_MEMBER' ? 'DISABLED' : 'ACTIVE', email, 'Authz fixture (fake)'],
    );
    accounts.push(id);
    return { id: String(id), user, email };
  }

  return { accounts, tournaments, account };
}

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('manager endpoint authorization matrix', () => {
  it('applies the Requirement 5.1 status and code to every /api/manage/* endpoint and writes nothing on refusal', { timeout: 120000 }, async () => {
    const f = manageFixtures();
    // The seed owner (account 2) owns the seed tournament; a fresh tree keeps the seed untouched and
    // lets the owner/out-of-scope split be exact.
    const owner = await f.account('TOURNAMENT_MANAGER'); // Tournament_Owner of the fixture tournament
    const sportMgr = await f.account('TOURNAMENT_MANAGER'); // Sport_Manager of the fixture sport only
    const outMgr = await f.account('TOURNAMENT_MANAGER'); // a manager with no scope on the fixture
    const disabled = await f.account('DISABLED_MEMBER'); // DISABLED manager
    const viewer = { user: `test_authz_viewer_${crypto.randomUUID()}` }; // signed in, no staff account

    // A DRAFT tournament (so owner-level mutations reach the state step, not TOURNAMENT_LOCKED),
    // one sport with a Sport_Manager, one team and one SCHEDULED match far in the future.
    const future = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const tree = await db(async (client) => {
      const slug = `test-authz-${crypto.randomUUID().slice(0, 8)}`;
      const { id: tId } = (await client.query(
        `INSERT INTO tournaments (slug, name, starts_on, ends_on, status, owner_account_id)
         VALUES ($1, 'Authz Fixture (fake)', $2, $2, 'DRAFT', $3) RETURNING id`,
        [slug, future, owner.id],
      )).rows[0];
      f.tournaments.push(tId);
      const { id: tsId } = (await client.query(
        `INSERT INTO tournament_sports (tournament_id, sport, config, config_version) VALUES ($1, 'badminton', $2, 1) RETURNING id`,
        [tId, { format: DEFAULT_BADMINTON }],
      )).rows[0];
      await client.query('INSERT INTO tournament_sport_managers (tournament_sport_id, account_id, added_by) VALUES ($1, $2, $3)', [tsId, sportMgr.id, owner.id]);
      const { id: teamId } = (await client.query(
        `INSERT INTO teams (tournament_sport_id, label) VALUES ($1, 'Authz Team (fake)') RETURNING id`,
        [tsId],
      )).rows[0];
      const { id: team2Id } = (await client.query(
        `INSERT INTO teams (tournament_sport_id, label) VALUES ($1, 'Authz Team 2 (fake)') RETURNING id`,
        [tsId],
      )).rows[0];
      const { id: matchId } = (await client.query(
        `INSERT INTO matches (tournament_sport_id, kind, side_a_team_id, side_b_team_id, scheduled_at, status)
         VALUES ($1, 'CUSTOM', $2, $3, $4, 'SCHEDULED') RETURNING id`,
        [tsId, teamId, team2Id, `${future}T10:00:00+05:30`],
      )).rows[0];
      return { slug, tId: String(tId), tsId: String(tsId), teamId: String(teamId), matchId: String(matchId) };
    });

    const base = `/api/manage/tournaments/${tree.slug}`;
    // body builders use fresh values so an "allowed" owner/admin call does not clash with the fixture.
    const minimalMatch = { tournament: tree.slug, sport: 'badminton', date: future, time: '11:30', sideA: tree.teamId, sideB: null, stage: 'FINAL' };

    // Each endpoint: method, path, optional body, and its scope level.
    //   'none'       collection endpoint, no target → every valid-role caller passes authz
    //   'tournament' owner-level target → Sport_Manager is out of scope (SCOPE_FORBIDDEN)
    //   'sport'      sport-level target → Sport_Manager is in scope (allowed)
    const ENDPOINTS = [
      { name: 'GET home', method: 'GET', path: '/api/manage/home', level: 'none' },
      { name: 'GET tournaments', method: 'GET', path: '/api/manage/tournaments', level: 'none' },
      { name: 'POST tournaments', method: 'POST', path: '/api/manage/tournaments', body: { name: 'Authz New (fake)', startsOn: future }, level: 'none' },
      { name: 'GET tournament', method: 'GET', path: base, level: 'tournament' },
      { name: 'PATCH tournament', method: 'PATCH', path: base, body: { venue: 'Authz Venue (fake)' }, level: 'tournament' },
      { name: 'POST status', method: 'POST', path: `${base}/status`, body: { status: 'ONGOING' }, level: 'tournament', mutates: true },
      { name: 'DELETE tournament', method: 'DELETE', path: base, level: 'tournament', mutates: true },
      { name: 'POST sport', method: 'POST', path: `${base}/sports`, body: { sport: 'football' }, level: 'tournament' },
      { name: 'DELETE sport', method: 'DELETE', path: `${base}/sports/badminton`, level: 'tournament', mutates: true },
      { name: 'PUT format', method: 'PUT', path: `${base}/sports/badminton/format`, body: { format: { ...DEFAULT_BADMINTON, bestOf: 1 } }, level: 'sport' },
      { name: 'POST manager', method: 'POST', path: `${base}/sports/badminton/managers`, body: { email: 'test-authz-nobody@example.test' }, level: 'tournament' },
      { name: 'DELETE manager', method: 'DELETE', path: `${base}/sports/badminton/managers/${sportMgr.id}`, level: 'tournament', mutates: true },
      { name: 'GET teams', method: 'GET', path: `${base}/sports/badminton/teams`, level: 'sport' },
      { name: 'POST team', method: 'POST', path: `${base}/sports/badminton/teams`, body: { name: `Authz T ${crypto.randomUUID().slice(0, 6)} (fake)` }, level: 'sport' },
      { name: 'PATCH team', method: 'PATCH', path: `/api/manage/teams/${tree.teamId}`, body: { branch: 'Authz Branch (fake)' }, level: 'sport' },
      { name: 'DELETE team', method: 'DELETE', path: `/api/manage/teams/${tree.teamId}`, level: 'sport', mutates: true },
      { name: 'GET matches', method: 'GET', path: '/api/manage/matches', level: 'none' },
      { name: 'POST match', method: 'POST', path: '/api/manage/matches', body: minimalMatch, level: 'sport' },
      { name: 'GET match', method: 'GET', path: `/api/manage/matches/${tree.matchId}`, level: 'sport' },
      { name: 'PATCH match', method: 'PATCH', path: `/api/manage/matches/${tree.matchId}`, body: { venue: 'Authz MV (fake)' }, level: 'sport' },
      { name: 'DELETE match', method: 'DELETE', path: `/api/manage/matches/${tree.matchId}`, level: 'sport', mutates: true },
    ];

    // The expected [status, code] per caller for an endpoint of a given scope level. `null` code
    // means "allowed": the call passes authorization, so neither status nor code is an authz refusal.
    const refusalForLevel = {
      none: null, // valid role always allowed
      tournament: [403, 'SCOPE_FORBIDDEN'],
      sport: null, // Sport_Manager is in scope for sport-level targets
    };
    const CALLERS = [
      { name: 'anonymous', ctx: {}, expect: () => [401, 'UNAUTHENTICATED'] },
      { name: 'invalid token', ctx: { token: 'not-a-jwt' }, expect: () => [401, 'UNAUTHENTICATED'] },
      { name: 'viewer', ctx: { user: viewer.user }, expect: () => [403, 'NOT_STAFF'] },
      { name: 'disabled', ctx: { user: disabled.user }, expect: () => [403, 'ACCOUNT_DISABLED'] },
      { name: 'match scorer', ctx: { user: 'test_match_operator' }, expect: () => [403, 'ROLE_FORBIDDEN'] },
      { name: 'out-of-scope manager', ctx: { user: outMgr.user }, expect: (lvl) => (lvl === 'none' ? null : [403, 'SCOPE_FORBIDDEN']) },
      { name: 'sport manager', ctx: { user: sportMgr.user }, expect: (lvl) => refusalForLevel[lvl] },
      { name: 'owner', ctx: { user: owner.user }, expect: () => null },
      { name: 'super admin', ctx: { user: 'test_super_admin' }, expect: () => null },
    ];

    try {
      // Running baseline of the fixture's rows; refusals must never move it off this value.
      let baseline = await fixtureState(f, tree);
      for (const ep of ENDPOINTS) {
        for (const caller of CALLERS) {
          const expected = caller.expect(ep.level);
          // A destructive endpoint (DELETE, or the status change) would remove the shared fixture
          // target if an allowed caller ran it, breaking the later endpoints. The authz decision for
          // allowed callers is already proven by the non-destructive endpoint of the same scope level
          // (for example PATCH tournament for tournament level, GET teams for sport level), so for a
          // destructive endpoint only the refusal callers run here. Refusals never write.
          if (!expected && ep.mutates) continue;
          const res = await api(ep.method, ep.path, { ...caller.ctx, body: ep.body });
          const payload = await res.json().catch(() => ({}));
          const got = [res.status, payload.error?.code];
          const label = `${ep.name} / ${caller.name}`;

          if (expected) {
            expect(got, label).toEqual(expected);
            // A refusal (401/403) happens before any write, so the fixture state still equals the
            // running baseline. One snapshot per refusal (not two) keeps this ~190-call test in budget.
            expect(await fixtureState(f, tree), `${label} wrote nothing`).toEqual(baseline);
          } else {
            // Allowed: the call passed authorization. Status is not an authz refusal and the code,
            // if any, is a non-authz error (a minimal body may still hit 400/409, which is fine here).
            expect([401, 403].includes(res.status), `${label} status ${res.status}`).toBe(false);
            expect(got[1] == null || !AUTHZ_CODES.has(got[1]), `${label} code ${got[1]}`).toBe(true);
            // POST /tournaments creates a brand-new tournament the caller owns; track it so cleanup
            // removes it and its Audit_Row even when the caller is the seed Super_Admin (whose account
            // id is not in the fixture account list).
            if (ep.name === 'POST tournaments' && res.status === 201 && payload.tournament?.id) {
              f.tournaments.push(Number(payload.tournament.id));
            }
            // An allowed call may have written; re-baseline so later refusal comparisons stay valid.
            baseline = await fixtureState(f, tree);
          }
        }
      }
    } finally {
      await cleanupManageFixtures(f);
    }
  });
});

// A snapshot that proves a refusal wrote nothing: the count of audit rows caused by the fixture's
// accounts, and the child-row counts under the fixture tournament. A refusal (401/403) happens
// before any write, so this stays identical across a refused call.
async function fixtureState(f, tree) {
  return db(async (client) => {
    const { rows: [r] } = await client.query(
      `SELECT
         (SELECT count(*)::int FROM admin_audit_log WHERE actor_account_id = ANY($1)) AS audits,
         (SELECT count(*)::int FROM tournaments WHERE id = $2) AS tournament,
         (SELECT count(*)::int FROM tournament_sports WHERE tournament_id = $2) AS sports,
         (SELECT count(*)::int FROM tournament_sport_managers sm
            JOIN tournament_sports ts ON ts.id = sm.tournament_sport_id WHERE ts.tournament_id = $2) AS sportManagers,
         (SELECT count(*)::int FROM teams tm
            JOIN tournament_sports ts ON ts.id = tm.tournament_sport_id WHERE ts.tournament_id = $2) AS teams,
         (SELECT count(*)::int FROM matches mt
            JOIN tournament_sports ts ON ts.id = mt.tournament_sport_id WHERE ts.tournament_id = $2) AS matches,
         (SELECT status FROM tournaments WHERE id = $2) AS status`,
      [f.accounts.map(Number), Number(tree.tId)],
    );
    return r;
  });
}

// Remove the fixture tree, its accounts and every audit row the fixture caused.
async function cleanupManageFixtures(f) {
  await db(async (client) => {
    const tIds = f.tournaments.map(Number);
    const accountIds = f.accounts.map(Number);
    // Child entity ids for the audit cleanup (audit rows key by entity + entity_id as text).
    const { rows: sports } = await client.query('SELECT id::text FROM tournament_sports WHERE tournament_id = ANY($1)', [tIds]);
    const { rows: teams } = await client.query(
      'SELECT tm.id::text FROM teams tm JOIN tournament_sports ts ON ts.id = tm.tournament_sport_id WHERE ts.tournament_id = ANY($1)',
      [tIds],
    );
    const { rows: matches } = await client.query(
      'SELECT mt.id::text FROM matches mt JOIN tournament_sports ts ON ts.id = mt.tournament_sport_id WHERE ts.tournament_id = ANY($1)',
      [tIds],
    );
    const sportIds = sports.map((r) => r.id);
    const matchIds = matches.map((r) => r.id);
    const sportIdNums = sportIds.map(Number);
    const matchIdNums = matchIds.map(Number);
    // Audit rows: every row written by a fixture account, plus any row keyed to a fixture entity.
    await client.query(
      `DELETE FROM admin_audit_log WHERE actor_account_id = ANY($1)
         OR (entity = 'tournaments' AND entity_id = ANY($2))
         OR (entity = 'tournament_sports' AND entity_id = ANY($3))
         OR (entity = 'teams' AND entity_id = ANY($4))
         OR (entity = 'matches' AND entity_id = ANY($5))`,
      [accountIds, tIds.map(String), sportIds, teams.map((r) => r.id), matchIds],
    );
    await client.query('DELETE FROM scorer_leases WHERE match_id = ANY($1)', [matchIdNums]);
    await client.query('DELETE FROM match_operator_assignments WHERE match_id = ANY($1)', [matchIdNums]);
    await client.query('DELETE FROM matches WHERE tournament_sport_id = ANY($1)', [sportIdNums]);
    await client.query('DELETE FROM tournament_sport_managers WHERE tournament_sport_id = ANY($1)', [sportIdNums]);
    await client.query('DELETE FROM teams WHERE tournament_sport_id = ANY($1)', [sportIdNums]);
    await client.query('DELETE FROM tournament_sports WHERE tournament_id = ANY($1)', [tIds]);
    await client.query('DELETE FROM tournaments WHERE id = ANY($1)', [tIds]);
    await client.query('DELETE FROM admin_accounts WHERE id = ANY($1)', [accountIds]);
  });
}

// --- Assign, revoke and DELETE /api/me authorization matrix (task 8.4) ----
// Covers the endpoints changed in task 8.1 and 8.3 against the nine Requirement 5.1 caller classes:
//   anonymous, invalid token, Viewer (signed-in, no staff account), DISABLED member,
//   Match_Scorer (MATCH_OPERATOR), Tournament_Manager out of scope, Sport_Manager in scope,
//   Tournament_Owner and Super_Admin. The 5.1 check order for assign/revoke is: (a) token 401;
//   (b) account/status 403 NOT_STAFF or ACCOUNT_DISABLED; (c) role 403 ROLE_FORBIDDEN; (d) body 400;
//   (e) unknown entity 404; (f) scope 403 SCOPE_FORBIDDEN (after the match lock, before any write);
//   (g) state 409. The fixture gives assign/revoke a real in-scope target (a LIVE match with an
//   ACTIVE assignment in a DRAFT, i.e. not locked, tournament) so the out-of-scope manager reaches
//   step (f) and gets SCOPE_FORBIDDEN, not 404. A LIVE match is not closed and a DRAFT tournament is
//   not locked, so an in-scope caller passes authz and state both.
//
// revoke requires the reason before its transaction, so every revoke call carries a reason; a
// missing reason would short-circuit to 409 REASON_REQUIRED before the scope check.

// Build a throwaway tournament tree: a DRAFT tournament owned by one manager, one sport with a
// Sport_Manager, two teams, one LIVE match far in the future and one ACTIVE assignment on it. Cleans
// up its accounts, tree and every audit row it caused, in a finally.
function assignFixtures() {
  const accounts = [];
  const tournaments = [];

  async function account(role) {
    const user = `test_authz8_${crypto.randomUUID()}`;
    const email = `test-authz8-${crypto.randomUUID()}@example.test`;
    const { id } = await one(
      'INSERT INTO admin_accounts (clerk_user_id, role, status, email, name) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [user, role === 'DISABLED_MEMBER' ? 'TOURNAMENT_MANAGER' : role, role === 'DISABLED_MEMBER' ? 'DISABLED' : 'ACTIVE', email, 'Authz8 fixture (fake)'],
    );
    accounts.push(id);
    return { id: String(id), user, email };
  }

  return { accounts, tournaments, account };
}

async function cleanupAssignFixtures(f) {
  await db(async (client) => {
    const tIds = f.tournaments.map(Number);
    const accountIds = f.accounts.map(Number);
    const { rows: sports } = await client.query('SELECT id FROM tournament_sports WHERE tournament_id = ANY($1)', [tIds]);
    const sportIdNums = sports.map((r) => Number(r.id));
    const { rows: matches } = await client.query('SELECT id::text FROM matches WHERE tournament_sport_id = ANY($1)', [sportIdNums]);
    const { rows: assigns } = await client.query('SELECT id::text FROM match_operator_assignments WHERE match_id = ANY($1)', [matches.map((r) => Number(r.id))]);
    await client.query(
      `DELETE FROM admin_audit_log WHERE actor_account_id = ANY($1)
         OR (entity = 'match_operator_assignments' AND entity_id = ANY($2))
         OR (entity = 'scorer_leases' AND entity_id = ANY($3))`,
      [accountIds, assigns.map((r) => r.id), matches.map((r) => r.id)],
    );
    await client.query('DELETE FROM scorer_leases WHERE match_id = ANY($1)', [matches.map((r) => Number(r.id))]);
    await client.query('DELETE FROM match_operator_assignments WHERE match_id = ANY($1)', [matches.map((r) => Number(r.id))]);
    await client.query('DELETE FROM matches WHERE tournament_sport_id = ANY($1)', [sportIdNums]);
    await client.query('DELETE FROM tournament_sport_managers WHERE tournament_sport_id = ANY($1)', [sportIdNums]);
    await client.query('DELETE FROM teams WHERE tournament_sport_id = ANY($1)', [sportIdNums]);
    await client.query('DELETE FROM tournament_sports WHERE tournament_id = ANY($1)', [tIds]);
    await client.query('DELETE FROM tournaments WHERE id = ANY($1)', [tIds]);
    await client.query('DELETE FROM admin_accounts WHERE id = ANY($1)', [accountIds]);
  });
}

// A snapshot proving a refusal wrote nothing: the fixture accounts' audit-row count, the audit rows
// keyed to the match (any actor, including the seed Super Admin), the match's assignment rows and its
// lease. A refusal happens before any write, so this stays identical.
async function assignState(f, matchId) {
  return db(async (client) => {
    const { rows: [r] } = await client.query(
      `SELECT
         (SELECT count(*)::int FROM admin_audit_log WHERE actor_account_id = ANY($1)) AS audits,
         (SELECT count(*)::int FROM admin_audit_log WHERE (entity = 'match_operator_assignments' AND after->>'matchId' = $2::bigint::text)
            OR (entity = 'scorer_leases' AND entity_id = $2::bigint::text)) AS "matchAudits",
         (SELECT count(*)::int FROM match_operator_assignments WHERE match_id = $2) AS rows,
         (SELECT count(*)::int FROM match_operator_assignments WHERE match_id = $2 AND status = 'ACTIVE') AS active,
         (SELECT device_id::text FROM scorer_leases WHERE match_id = $2) AS lease`,
      [f.accounts.map(Number), Number(matchId)],
    );
    return r;
  });
}

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('assign and revoke authorization matrix', () => {
  it('applies the Requirement 5.1 status and code to assign and revoke and writes nothing on refusal', { timeout: 120000 }, async () => {
    const f = assignFixtures();
    const owner = await f.account('TOURNAMENT_MANAGER'); // Tournament_Owner of the fixture tournament
    const sportMgr = await f.account('TOURNAMENT_MANAGER'); // Sport_Manager of the fixture sport
    const outMgr = await f.account('TOURNAMENT_MANAGER'); // a manager with no scope on the fixture
    const disabled = await f.account('DISABLED_MEMBER'); // DISABLED manager
    const scorer = await f.account('MATCH_OPERATOR'); // the assignment target
    const viewer = { user: `test_authz8_viewer_${crypto.randomUUID()}` }; // signed in, no staff account

    const future = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString();
    const tree = await db(async (client) => {
      const slug = `test-authz8-${crypto.randomUUID().slice(0, 8)}`;
      const { id: tId } = (await client.query(
        `INSERT INTO tournaments (slug, name, starts_on, ends_on, status, owner_account_id)
         VALUES ($1, 'Authz8 Fixture (fake)', $2, $2, 'DRAFT', $3) RETURNING id`,
        [slug, future.slice(0, 10), owner.id],
      )).rows[0];
      f.tournaments.push(tId);
      const { id: tsId } = (await client.query(
        `INSERT INTO tournament_sports (tournament_id, sport) VALUES ($1, 'badminton') RETURNING id`,
        [tId],
      )).rows[0];
      await client.query('INSERT INTO tournament_sport_managers (tournament_sport_id, account_id, added_by) VALUES ($1, $2, $3)', [tsId, sportMgr.id, owner.id]);
      const { id: teamId } = (await client.query(`INSERT INTO teams (tournament_sport_id, label) VALUES ($1, 'Authz8 Team (fake)') RETURNING id`, [tsId])).rows[0];
      const { id: team2Id } = (await client.query(`INSERT INTO teams (tournament_sport_id, label) VALUES ($1, 'Authz8 Team 2 (fake)') RETURNING id`, [tsId])).rows[0];
      // A LIVE match (not closed) scheduled far ahead, with one ACTIVE assignment to the scorer.
      const { id: matchId } = (await client.query(
        `INSERT INTO matches (tournament_sport_id, kind, side_a_team_id, side_b_team_id, scheduled_at, status)
         VALUES ($1, 'CUSTOM', $2, $3, $4, 'LIVE') RETURNING id`,
        [tsId, teamId, team2Id, future],
      )).rows[0];
      const { id: assignId } = (await client.query(
        'INSERT INTO match_operator_assignments (match_id, account_id, assigned_by) VALUES ($1, $2, $3) RETURNING id',
        [matchId, scorer.id, owner.id],
      )).rows[0];
      // A held lease, so a refusal is also proven to leave the lease in place.
      await client.query('INSERT INTO scorer_leases (match_id, account_id, device_id) VALUES ($1, $2, $3)', [matchId, scorer.id, crypto.randomUUID()]);
      return { matchId: String(matchId), assignId: String(assignId) };
    });

    // assign reassigns the scorer with a reason (there is already an ACTIVE assignment); revoke
    // revokes the fixture assignment. Both are sport-scoped, so the Sport_Manager is in scope.
    // The email and `{ self: true }` bodies (task 16.3) pass the same chain. The unknown email
    // proves the scope check runs before the account lookup: an out-of-scope caller gets
    // SCOPE_FORBIDDEN, never SCORER_NOT_FOUND. For an in-scope caller it is a 400 that writes nothing,
    // so `allowed` runs those callers too.
    const assignPath = `/api/matches/${tree.matchId}/assignments`;
    const ENDPOINTS = [
      { name: 'assign', method: 'POST', path: assignPath, body: { accountId: scorer.id, reason: 'swap (fake)' } },
      { name: 'assign by email', method: 'POST', path: assignPath, body: { email: scorer.email, reason: 'swap (fake)' } },
      {
        name: 'assign by unknown email',
        method: 'POST',
        path: assignPath,
        body: { email: `test-authz8-nobody-${crypto.randomUUID()}@example.test`, reason: 'swap (fake)' },
        allowed: [400, 'SCORER_NOT_FOUND'],
      },
      { name: 'assign self', method: 'POST', path: assignPath, body: { self: true, reason: 'swap (fake)' } },
      { name: 'revoke', method: 'POST', path: `/api/assignments/${tree.assignId}/revoke`, body: { reason: 'swap (fake)' } },
    ];

    const CALLERS = [
      { name: 'anonymous', ctx: {}, expected: [401, 'UNAUTHENTICATED'] },
      { name: 'invalid token', ctx: { token: 'not-a-jwt' }, expected: [401, 'UNAUTHENTICATED'] },
      { name: 'viewer', ctx: { user: viewer.user }, expected: [403, 'NOT_STAFF'] },
      { name: 'disabled', ctx: { user: disabled.user }, expected: [403, 'ACCOUNT_DISABLED'] },
      { name: 'match scorer', ctx: { user: scorer.user }, expected: [403, 'ROLE_FORBIDDEN'] },
      { name: 'out-of-scope manager', ctx: { user: outMgr.user }, expected: [403, 'SCOPE_FORBIDDEN'] },
      { name: 'sport manager', ctx: { user: sportMgr.user }, expected: null }, // in scope, allowed
      { name: 'owner', ctx: { user: owner.user }, expected: null }, // allowed
      { name: 'super admin', ctx: { user: 'test_super_admin' }, expected: null }, // allowed
    ];

    try {
      for (const ep of ENDPOINTS) {
        for (const caller of CALLERS) {
          const label = `${ep.name} / ${caller.name}`;
          const expected = caller.expected ?? ep.allowed;
          if (!expected) {
            // An allowed caller would mutate the shared fixture (reassign or revoke), breaking later
            // cases. The allowed decision for assign/revoke is the same scope+state path proven by the
            // in-scope callers elsewhere; here we only run the refusal callers, which never write.
            continue;
          }
          const before = await assignState(f, tree.matchId);
          const res = await api(ep.method, ep.path, { ...caller.ctx, body: ep.body });
          const got = [res.status, (await res.json().catch(() => ({}))).error?.code];
          expect(got, label).toEqual(expected);
          expect(await assignState(f, tree.matchId), `${label} wrote nothing`).toEqual(before);
        }
      }
      // One allowed in-scope revoke proves the scope+state path passes authz for a real caller. It
      // runs last so it does not disturb the refusal snapshots above.
      const ok = await api('POST', `/api/assignments/${tree.assignId}/revoke`, { user: sportMgr.user, body: { reason: 'in scope (fake)' } });
      expect(ok.status, 'in-scope sport manager revoke').toBe(200);
    } finally {
      await cleanupAssignFixtures(f);
    }
  });
});

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('DELETE /api/me owner refusal', () => {
  // Deleting the own account of a Tournament_Owner is refused with 409 OWNER_TRANSFER_REQUIRED before
  // Clerk is called; the account stays ACTIVE (Requirement 3.14). An owner account that owns a fresh
  // DRAFT tournament keeps the seed owner untouched.
  it('returns 409 OWNER_TRANSFER_REQUIRED, leaves the account ACTIVE and never calls Clerk', async () => {
    const f = assignFixtures();
    const owner = await f.account('TOURNAMENT_MANAGER');
    await db(async (client) => {
      const slug = `test-authz8-owner-${crypto.randomUUID().slice(0, 8)}`;
      const { id: tId } = (await client.query(
        `INSERT INTO tournaments (slug, name, starts_on, ends_on, status, owner_account_id)
         VALUES ($1, 'Authz8 Owner (fake)', '2026-01-10', '2026-01-10', 'DRAFT', $2) RETURNING id`,
        [slug, owner.id],
      )).rows[0];
      f.tournaments.push(tId);
    });
    const calls = stubClerk(() => [200, { object: 'user', id: owner.user, deleted: true }]);
    try {
      const res = await api('DELETE', '/api/me', { user: owner.user });
      expect(await code(res)).toEqual([409, 'OWNER_TRANSFER_REQUIRED']);
      expect(calls, 'Clerk not called').toEqual([]);
      expect(await one('SELECT status FROM admin_accounts WHERE id = $1', [owner.id])).toEqual({ status: 'ACTIVE' });
    } finally {
      vi.restoreAllMocks();
      await cleanupAssignFixtures(f);
    }
  });
});
