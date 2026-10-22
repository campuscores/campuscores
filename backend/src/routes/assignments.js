import { toPublic } from '../http.js';
import { EVENT_TIME_ZONE, matchPhase } from '../../../shared/time.mjs';
import { Hono } from 'hono';
import { clerkAuth, loadAccount, requireRole } from '../auth.js';
import { withClient, withTx } from '../db.js';
import { AppError, jsonBody } from '../http.js';
import { requireScope } from '../scope.js';
import { isWithinWindow, startDecision } from '../scoring.js';
import { DEFAULT_FORMATS } from '../../../shared/scoring.mjs';
import { email } from '../validate.js';
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

// Scope and state gate for assign and revoke, run after the match row is locked and before any
// write (Requirements 5.8, 9.11, 13.9, 15.11). Locks the owning tournament FOR SHARE (lock order:
// match first, then tournament), checks Manager_Scope, then refuses a closed match or a locked
// tournament. `match` carries status and scheduled_at; `now` is database time read in the caller's
// query. Super_Admin passes requireScope. Throws before the caller mutates anything.
async function guardMatch(tx, account, match, now) {
  const { rows: [t] } = await tx.query(
    `SELECT status FROM tournaments WHERE id =
       (SELECT tournament_id FROM tournament_sports WHERE id = $1) FOR SHARE`,
    [match.tournamentSportId],
  );
  await requireScope(tx, account, { tournamentSportId: match.tournamentSportId });
  // Closed = Final (APPROVED/PENDING_APPROVAL) or Not_Scored (SCHEDULED past Match_Day_End), by
  // database time. matchPhase maps both to 'past'; a Live match is not closed here.
  if (matchPhase({ status: match.status, scheduledAt: match.scheduledAt }, now) === 'past') {
    throw new AppError(409, 'MATCH_CLOSED', 'The match is closed to assignment changes');
  }
  if (t && (t.status === 'COMPLETED' || t.status === 'ARCHIVED')) {
    throw new AppError(409, 'TOURNAMENT_LOCKED', 'The tournament is locked');
  }
}

const notScorer = () => new AppError(400, 'NOT_A_SCORER', 'email: This email belongs to an account that is not a Match Scorer.');

// Resolve a normalised email to the assignee account ID (Requirement 13.1, 13.3). The caller's own
// ACTIVE email is a self-assign. Otherwise only an ACTIVE MATCH_OPERATOR is accepted; a pending
// unexpired invitation, any other account (other role or DISABLED) and no account each refuse.
async function resolveEmail(tx, wanted, actorId) {
  const { rows: [account] } = await tx.query(
    `SELECT id, role FROM admin_accounts WHERE email = $1 AND status = 'ACTIVE'`,
    [wanted],
  );
  if (account && (String(account.id) === String(actorId) || account.role === 'MATCH_OPERATOR')) return String(account.id);
  if (account) throw notScorer();
  const { rows: [other] } = await tx.query(
    `SELECT EXISTS (SELECT 1 FROM staff_invitations WHERE email = $1 AND status = 'PENDING' AND expires_at > now()) AS invited,
            EXISTS (SELECT 1 FROM admin_accounts WHERE email = $1) AS known`,
    [wanted],
  );
  if (other.invited) throw new AppError(400, 'INVITE_PENDING', 'email: An invitation to this email is waiting to be accepted.');
  if (other.known) throw notScorer();
  throw new AppError(400, 'SCORER_NOT_FOUND', 'email: No scorer account uses this email.');
}

export const assignmentRoutes = new Hono();

assignmentRoutes.post('/matches/:id/assignments', clerkAuth, loadAccount, requireRole('manager'), async (c) => {
  const matchId = idParam(c);
  const body = await jsonBody(c);
  const actorId = c.get('account').id;
  // Target, in order: `{ self: true }` (the caller), `{ email }` (Requirement 13.1, 13.3), or the
  // legacy `{ accountId }`. Email is trimmed and lower-cased like invitations.
  const byEmail = body.self !== true && body.email !== undefined ? email(body.email) : null;
  let accountId = body.self === true ? String(actorId) : null;
  if (!accountId && !byEmail) {
    accountId = parseId(typeof body.accountId === 'number' ? String(body.accountId) : body.accountId);
    if (!accountId) throw bad('accountId required');
  }
  const validFrom = bound(body.validFrom, 'validFrom');
  const validUntil = bound(body.validUntil, 'validUntil');
  if (validFrom && validUntil && validUntil <= validFrom) throw bad('validUntil must be after validFrom');
  const reason = text(body.reason) || null;
  const requestId = c.get('requestId');
  try {
    const assignment = await uncached(c, (client) =>
      withTx(client, async (tx) => {
        // The match lock serializes assigns, revokes and score commands for this match.
        const { rows: [match] } = await tx.query(
          `SELECT id, tournament_sport_id AS "tournamentSportId", status,
                  (extract(epoch from scheduled_at) * 1000)::float8 AS "scheduledAt",
                  (extract(epoch from now()) * 1000)::float8 AS now
           FROM matches WHERE id = $1 FOR UPDATE`,
          [matchId],
        );
        if (!match) throw new AppError(404, 'NOT_FOUND', 'Match not found');
        // Tournament FOR SHARE, scope, then closed/locked state, all before any write.
        await guardMatch(tx, c.get('account'), match, match.now);
        // Email resolves after the scope check, so an out-of-scope caller learns nothing about accounts.
        if (byEmail) accountId = await resolveEmail(tx, byEmail, actorId);
        const self = accountId === String(actorId);
        // FOR SHARE waits for a concurrent disable of the target.
        const { rows: [target] } = await tx.query('SELECT role, status FROM admin_accounts WHERE id = $1 FOR SHARE', [accountId]);
        if (!target) throw new AppError(404, 'NOT_FOUND', 'Account not found');
        if (!self && (target.role !== 'MATCH_OPERATOR' || target.status !== 'ACTIVE')) {
          // A concurrent role change or disable after resolveEmail lands here too.
          throw byEmail ? notScorer() : bad('Target must be an active Match Operator or yourself');
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
      const { rows: [match] } = await tx.query(
        `SELECT m.id, m.tournament_sport_id AS "tournamentSportId", m.status,
                (extract(epoch from m.scheduled_at) * 1000)::float8 AS "scheduledAt",
                (extract(epoch from now()) * 1000)::float8 AS now
         FROM match_operator_assignments a JOIN matches m ON m.id = a.match_id
         WHERE a.id = $1 FOR UPDATE OF m`,
        [assignmentId],
      );
      // Tournament FOR SHARE, scope, then closed/locked state, all before any write.
      if (match) await guardMatch(tx, c.get('account'), match, match.now);
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
              (m.scheduled_at AT TIME ZONE $2::text)::date = (now() AT TIME ZONE $2::text)::date AS "isToday",
              json_build_array(json_build_object('name', ta.label), json_build_object('name', tb.label)) AS sides,
              a.id AS "assignmentId", to_json(a.valid_from) #>> '{}' AS "validFrom",
              to_json(a.valid_until) #>> '{}' AS "validUntil", a.valid_from, a.valid_until, now() AS now,
              (extract(epoch from now()) * 1000)::float8 AS now_ms,
              (extract(epoch from m.scheduled_at) * 1000)::float8 AS scheduled_ms,
              t.status AS tournament_status, ts.config->'format' AS ts_format
       FROM match_operator_assignments a
       JOIN matches m ON m.id = a.match_id
       JOIN tournament_sports ts ON ts.id = m.tournament_sport_id
       JOIN tournaments t ON t.id = ts.tournament_id
       LEFT JOIN teams ta ON ta.id = m.side_a_team_id
       LEFT JOIN teams tb ON tb.id = m.side_b_team_id
       WHERE a.account_id = $1 AND a.status = 'ACTIVE'
       ORDER BY m.scheduled_at NULLS LAST, m.id`,
      [c.get('account').id, EVENT_TIME_ZONE.name],
    ),
  );
  // Database now() only; client time is never read. canStart/startReason use the START rule of
  // POST /actions (startDecision), so the list and the action agree; START needs a SCHEDULED match.
  // notScored is Match_Phase 'past' for a SCHEDULED match. defaultFormat is the Tournament_Sport's
  // Default_Format, the same source as the manager Sport setup.
  const matches = rows.map(({ valid_from, valid_until, now, now_ms, scheduled_ms, tournament_status, ts_format, ...match }) => {
    const start = startDecision({ now: now_ms, scheduledAt: scheduled_ms, tournamentStatus: tournament_status });
    return {
      ...match,
      validNow: isWithinWindow(now, valid_from, valid_until),
      canStart: match.status === 'SCHEDULED' && !start,
      startReason: match.status === 'SCHEDULED' && start ? start[1] : null,
      notScored: match.status === 'SCHEDULED' && matchPhase({ status: match.status, scheduledAt: scheduled_ms }, now_ms) === 'past',
      defaultFormat: ts_format ?? DEFAULT_FORMATS[match.sport] ?? null,
    };
  });
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
