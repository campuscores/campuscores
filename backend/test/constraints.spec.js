import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { withClient, withTx } from '../src/db.js';
// Runs against the migrated, seeded CI Postgres (db/seed/fake.sql IDs). Every insert runs in a rolled-back transaction.
const testCtx = () => {
  const pending = [];
  return { waitUntil: (p) => pending.push(p), done: () => Promise.all(pending) };
};
const UNIQUE = '23505';
const CHECK = '23514';
const rollback = new Error('rollback');
// Runs fn in a transaction that never commits; returns fn's result or the database error.
const inRolledBackTx = async (sql, params) => {
  const ctx = testCtx();
  let out;
  const err = await withClient(env.HYPERDRIVE_UNCACHED, ctx, (client) =>
    withTx(client, async (c) => {
      out = await c.query(sql, params);
      throw rollback;
    }).catch((e) => e),
  );
  await ctx.done();
  return err === rollback ? { rows: out.rows } : { err };
};
const assignment = 'INSERT INTO match_operator_assignments (match_id, account_id, assigned_by, valid_from, valid_until, status) VALUES ($1, 3, 2, $2, $3, $4)';
const match = 'INSERT INTO matches (tournament_sport_id, kind, stage, status, correction_route) VALUES ($1, $2, $3, $4, $5) RETURNING last_seq';
describe.skipIf(!env.HYPERDRIVE_UNCACHED)('core schema constraints', () => {
  it('rejects a second ACTIVE assignment for a match', async () => {
    // Seed match 4 already has an ACTIVE assignment.
    const { err } = await inRolledBackTx(assignment, [4, null, null, 'ACTIVE']);
    expect(err).toMatchObject({ code: UNIQUE, constraint: 'one_active_assignment' });
  });
  it('rejects an assignment window with equal bounds', async () => {
    const t = '2026-01-10T10:00:00Z';
    const { err } = await inRolledBackTx(assignment, [1, t, t, 'ACTIVE']);
    expect(err).toMatchObject({ code: CHECK, table: 'match_operator_assignments' });
  });
  it('rejects REVOKED without revoked_at and revoked_by', async () => {
    const { err } = await inRolledBackTx(assignment, [2, null, null, 'REVOKED']);
    expect(err).toMatchObject({ code: CHECK, table: 'match_operator_assignments' });
  });
  it('rejects a duplicate bracket stage for a tournament sport', async () => {
    // Seed tournament sport 1 already has SF1.
    const { err } = await inRolledBackTx(match, [1, 'BRACKET', 'SF1', 'SCHEDULED', null]);
    expect(err).toMatchObject({ code: UNIQUE, constraint: 'matches_one_stage' });
  });
  it('rejects a CUSTOM match with a stage', async () => {
    const { err } = await inRolledBackTx(match, [2, 'CUSTOM', 'SF1', 'SCHEDULED', null]);
    expect(err).toMatchObject({ code: CHECK, table: 'matches' });
  });
  it('rejects REJECTED without a correction_route', async () => {
    const { err } = await inRolledBackTx(match, [2, 'CUSTOM', null, 'REJECTED', null]);
    expect(err).toMatchObject({ code: CHECK, table: 'matches' });
  });
  const invite = `INSERT INTO staff_invitations (email, role, invited_by, clerk_invitation_id, expires_at)
    VALUES ($1, 'MATCH_OPERATOR', 1, 'inv_test', now() + interval '7 days')`;
  it('rejects an invitation email that is not lower case', async () => {
    const { err } = await inRolledBackTx(invite, ['Test_Upper@example.com']);
    expect(err).toMatchObject({ code: CHECK, table: 'staff_invitations' });
  });
  it('rejects a second PENDING invitation for the same email', async () => {
    const { err } = await inRolledBackTx(`${invite}, ($1, 'MATCH_OPERATOR', 1, 'inv_test2', now() + interval '7 days')`, [
      'test_dup@example.com',
    ]);
    expect(err).toMatchObject({ code: UNIQUE, constraint: 'one_pending_invitation' });
  });
  // Two rows in one statement: ($1, $2, seq 1) and ($3, $4, seq $5) for seed match 4 and operator 3.
  const actions = `INSERT INTO score_actions (match_id, action_id, seq, client_seq, device_id, account_id, type, payload, payload_hash, result, reverses_action_id)
    VALUES (4, $1, 1, 1, gen_random_uuid(), 3, 'POINT', '{}', 'h', '{}', NULL),
           ($2, $3, $4, 2, gen_random_uuid(), 3, 'POINT', '{}', 'h', '{}', $5)`;
  const a1 = '00000000-0000-4000-8000-000000000001';
  const a2 = '00000000-0000-4000-8000-000000000002';
  it('rejects a repeated action_id for a match', async () => {
    const { err } = await inRolledBackTx(actions, [a1, 4, a1, 2, null]);
    expect(err).toMatchObject({ code: UNIQUE, constraint: 'score_actions_match_id_action_id_key' });
  });
  it('rejects a repeated seq for a match', async () => {
    const { err } = await inRolledBackTx(actions, [a1, 4, a2, 1, null]);
    expect(err).toMatchObject({ code: UNIQUE, constraint: 'score_actions_match_id_seq_key' });
  });
  it('rejects a reversal of an action from another match', async () => {
    const { err } = await inRolledBackTx(actions, [a1, 3, a2, 1, a1]);
    expect(err).toMatchObject({ code: '23503', table: 'score_actions' });
  });
  it('accepts a linked reversal in the same match', async () => {
    const { err } = await inRolledBackTx(actions, [a1, 4, a2, 2, a1]);
    expect(err).toBeUndefined();
  });
  it('accepts REJECTED with a route and starts last_seq at 0', async () => {
    const { err, rows } = await inRolledBackTx(match, [2, 'CUSTOM', null, 'REJECTED', 'OPERATOR']);
    expect(err).toBeUndefined();
    expect(rows).toEqual([{ last_seq: 0 }]);
  });
});
