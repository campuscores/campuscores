import { toPublic } from '../http.js';
import { Hono } from 'hono';
import { clerkAuth, loadAccount, requireRole } from '../auth.js';
import { withClient, withTx } from '../db.js';
import { AppError, jsonBody } from '../http.js';
import { isWithinWindow } from '../scoring.js';
import { idParam, parseId } from './public.js';

const uncached = (c, fn) => withClient(c.env.HYPERDRIVE_UNCACHED, c.executionCtx, fn);
const bad = (message) => new AppError(400, 'BAD_REQUEST', message);
const text = (v) => (typeof v === 'string' ? v.trim() : '');

// Optional window bound: null, or a parseable date sent to Postgres as ISO text.
function bound(v, name) {
  if (v == null) return null;
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  if (Number.isNaN(t)) throw bad(`${name} must be a date`);
  return new Date(t).toISOString();
}

const audit = (tx, { actorId, action, entityId, requestId, before = null, after = null, reason = null }) =>
  tx.query(
    `INSERT INTO admin_audit_log (actor_account_id, action, entity, entity_id, request_id, before, after, reason)
     VALUES ($1, $2, 'match_operator_assignments', $3, $4, $5, $6, $7)`,
    [actorId, action, entityId, requestId, before, after, reason],
  );

const revoke = (tx, assignmentId, actorId, reason) =>
  tx.query(
    `UPDATE match_operator_assignments SET status = 'REVOKED', revoked_at = now(), revoked_by = $2, revoke_reason = $3
     WHERE id = $1 AND status = 'ACTIVE' RETURNING id, match_id, account_id`,
    [assignmentId, actorId, reason],
  );

const ASSIGNMENT_COLUMNS = `id, match_id AS "matchId", account_id AS "accountId", permission, status,
  to_json(valid_from) #>> '{}' AS "validFrom", to_json(valid_until) #>> '{}' AS "validUntil"`;

export const assignmentRoutes = new Hono();

assignmentRoutes.post('/matches/:id/assignments', clerkAuth, loadAccount, requireRole('manager'), async (c) => {
  const matchId = idParam(c);
  const body = await jsonBody(c);
  const accountId = parseId(typeof body.accountId === 'number' ? String(body.accountId) : body.accountId);
  if (!accountId) throw bad('accountId required');
  const validFrom = bound(body.validFrom, 'validFrom');
  const validUntil = bound(body.validUntil, 'validUntil');
  if (validFrom && validUntil && validUntil <= validFrom) throw bad('validUntil must be after validFrom');
  const reason = text(body.reason) || null;
  const actorId = c.get('account').id;
  const requestId = c.get('requestId');
  const self = accountId === actorId;
  try {
    const assignment = await uncached(c, (client) =>
      withTx(client, async (tx) => {
        // The match lock serializes assigns, revokes and score commands for this match.
        const { rows: [match] } = await tx.query('SELECT id FROM matches WHERE id = $1 FOR UPDATE', [matchId]);
        if (!match) throw new AppError(404, 'NOT_FOUND', 'Match not found');
        // FOR SHARE waits for a concurrent disable of the target.
        const { rows: [target] } = await tx.query('SELECT role, status FROM admin_accounts WHERE id = $1 FOR SHARE', [accountId]);
        if (!target) throw new AppError(404, 'NOT_FOUND', 'Account not found');
        if (!self && (target.role !== 'MATCH_OPERATOR' || target.status !== 'ACTIVE')) {
          throw bad('Target must be an active Match Operator or yourself');
        }
        const { rows: [current] } = await tx.query(
          `SELECT id FROM match_operator_assignments WHERE match_id = $1 AND status = 'ACTIVE'`,
          [matchId],
        );
        if (current && !reason) throw new AppError(409, 'REASON_REQUIRED', 'A reason is required to reassign');
        if (current) {
          const { rows: [old] } = await revoke(tx, current.id, actorId, reason);
          await audit(tx, {
            actorId, action: 'ASSIGNMENT_REVOKED', entityId: old.id, requestId, reason,
            before: { status: 'ACTIVE', accountId: old.account_id }, after: { status: 'REVOKED' },
          });
        }
        const { rows: [created] } = await tx.query(
          `INSERT INTO match_operator_assignments (match_id, account_id, assigned_by, valid_from, valid_until)
           VALUES ($1, $2, $3, $4, $5) RETURNING ${ASSIGNMENT_COLUMNS}`,
          [matchId, accountId, actorId, validFrom, validUntil],
        );
        await tx.query('DELETE FROM scorer_leases WHERE match_id = $1', [matchId]);
        await audit(tx, {
          actorId, action: self ? 'SELF_ASSIGNED' : 'ASSIGNMENT_CREATED', entityId: created.id, requestId, reason,
          after: { matchId, accountId, validFrom, validUntil },
        });
        return created;
      }),
    );
    return c.json({ assignment }, 201);
  } catch (err) {
    // The partial unique index is the final guard against a concurrent assign.
    if (err.code === '23505') throw new AppError(409, 'ASSIGNMENT_CONFLICT', 'The match already has an active assignment');
    throw err;
  }
});

assignmentRoutes.post('/assignments/:id/revoke', clerkAuth, loadAccount, requireRole('manager'), async (c) => {
  const assignmentId = idParam(c);
  const reason = text((await jsonBody(c)).reason);
  if (!reason) throw new AppError(409, 'REASON_REQUIRED', 'A reason is required');
  const actorId = c.get('account').id;
  const assignment = await uncached(c, (client) =>
    withTx(client, async (tx) => {
      // Match row first, the same lock order as assign and scoring.
      await tx.query(
        `SELECT 1 FROM match_operator_assignments a JOIN matches m ON m.id = a.match_id
         WHERE a.id = $1 FOR UPDATE OF m`,
        [assignmentId],
      );
      const { rows: [old] } = await revoke(tx, assignmentId, actorId, reason);
      if (!old) throw new AppError(404, 'NOT_FOUND', 'Active assignment not found');
      await tx.query('DELETE FROM scorer_leases WHERE match_id = $1', [old.match_id]);
      await audit(tx, {
        actorId, action: 'ASSIGNMENT_REVOKED', entityId: old.id, requestId: c.get('requestId'), reason,
        before: { status: 'ACTIVE', accountId: old.account_id }, after: { status: 'REVOKED' },
      });
      return { id: old.id, status: 'REVOKED' };
    }),
  );
  return c.json({ assignment });
});

// The caller's ACTIVE assignments only; CUSTOM matches and DRAFT tournaments are included (private staff view).
assignmentRoutes.get('/operator/matches', clerkAuth, loadAccount, requireRole('staff'), async (c) => {
  const { rows } = await uncached(c, (client) =>
    client.query(
      `SELECT m.id, ts.tournament_id AS "tournamentId", ts.sport, m.kind, m.stage, m.status,
              m.correction_route AS "correctionRoute", to_json(m.scheduled_at) #>> '{}' AS "scheduledAt",
              m.venue, m.last_seq AS seq, m.config_snapshot->'format' AS format,
              (m.scheduled_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date AS "isToday",
              json_build_array(json_build_object('name', ta.label), json_build_object('name', tb.label)) AS sides,
              a.id AS "assignmentId", to_json(a.valid_from) #>> '{}' AS "validFrom",
              to_json(a.valid_until) #>> '{}' AS "validUntil", a.valid_from, a.valid_until, now() AS now
       FROM match_operator_assignments a
       JOIN matches m ON m.id = a.match_id
       JOIN tournament_sports ts ON ts.id = m.tournament_sport_id
       LEFT JOIN teams ta ON ta.id = m.side_a_team_id
       LEFT JOIN teams tb ON tb.id = m.side_b_team_id
       WHERE a.account_id = $1 AND a.status = 'ACTIVE'
       ORDER BY m.scheduled_at NULLS LAST, m.id`,
      [c.get('account').id],
    ),
  );
  // Database now() only; client time is never read.
  const matches = rows.map(({ valid_from, valid_until, now, ...match }) => ({
    ...match,
    validNow: isWithinWindow(now, valid_from, valid_until),
  }));
  return c.json({ matches });
});

// Private, uncached scoring state, including the accepted log needed to project offline reversals.
assignmentRoutes.get('/operator/matches/:id/scoring', clerkAuth, loadAccount, requireRole('staff'), async c => {
  const matchId = idParam(c);
  const result = await uncached(c, client => withTx(client, async tx => {
    // Same match lock as writers: snapshot and action log describe one committed revision.
    const { rows: [match] } = await tx.query('SELECT id FROM matches WHERE id = $1 FOR UPDATE', [matchId]);
    if (!match) throw new AppError(404, 'NOT_FOUND', 'Match not found');
    const { rows: [assignment] } = await tx.query("SELECT id FROM match_operator_assignments WHERE match_id = $1 AND account_id = $2 AND status = 'ACTIVE'", [matchId, c.get('account').id]);
    if (!assignment) throw new AppError(403, 'NOT_ASSIGNED', 'This match is not assigned to you');
    const { rows: [stored] } = await tx.query('SELECT seq, data FROM match_snapshots WHERE match_id = $1', [matchId]);
    const { rows: actions } = await tx.query('SELECT seq, action_id AS "actionId", type, payload, reverses_action_id AS "reversesActionId" FROM score_actions WHERE match_id = $1 ORDER BY seq', [matchId]);
    return { seq: stored?.seq ?? 0, snapshot: stored ? toPublic('snapshot', stored.data) : null, actions };
  }));
  return c.json(result);
});
