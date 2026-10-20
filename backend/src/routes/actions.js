import { checkReversal, scoreMatch, validateFormat, validateSportAction, RULE_SOURCES } from '../../../shared/scoring.mjs';
import { Hono } from 'hono';
import { clerkAuth } from '../auth.js';
import { withClient, withTx } from '../db.js';
import { engineFor } from '../engines/index.js';
import { AppError, jsonBody, redact, toPublic } from '../http.js';
import { markDelivered, publishEvent, room } from '../outbox.js';
import { decideAction, evaluateChain, loadScoringContext, payloadHash } from '../scoring.js';
import { idParam } from './public.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT4_MAX = 2147483647; // client_seq is a Postgres int
const isUuid = (v) => typeof v === 'string' && UUID.test(v);
const bad = (message) => new AppError(400, 'BAD_REQUEST', message);

// Request body → normalized action, or 400. UUIDs are lower-cased because pg returns them that way.
export function parseAction(body) {
  const { actionId, clientSeq, deviceId, type, payload, reversesActionId } = body;
  if (!isUuid(actionId)) throw bad('actionId must be a UUID');
  if (!Number.isInteger(clientSeq) || clientSeq < 1 || clientSeq > INT4_MAX) throw bad('clientSeq must be an integer >= 1');
  if (!isUuid(deviceId)) throw bad('deviceId must be a UUID');
  if (typeof type !== 'string' || !type) throw bad('type must be a non-empty string');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw bad('payload must be an object');
  if (reversesActionId != null && !isUuid(reversesActionId)) throw bad('reversesActionId must be a UUID');
  return {
    actionId: actionId.toLowerCase(),
    clientSeq,
    deviceId: deviceId.toLowerCase(),
    type,
    payload,
    reversesActionId: reversesActionId?.toLowerCase() ?? null,
  };
}

// After commit: publish to both rooms, then mark the outbox row delivered. Any failure leaves it for the Outbox_Sweep.
async function deliver(c, { outboxId, ...event }) {
  try {
    await publishEvent(c.env, event);
    await withClient(c.env.HYPERDRIVE_UNCACHED, c.executionCtx, (client) => markDelivered(client, outboxId));
  } catch (err) {
    console.log(JSON.stringify(redact({ requestId: c.get('requestId'), code: 'PUBLISH_FAILED', name: err?.name })));
  }
}

export const actionRoutes = new Hono();

// Requirements 15.1, 15.8, 16.1–16.12, 17.2. The chain loads the account itself, so no loadAccount here.
actionRoutes.post('/matches/:id/actions', clerkAuth, async (c) => {
  const matchId = idParam(c);
  const action = parseAction(await jsonBody(c));
  const hash = await payloadHash(action);
  await room(c.env, 'home').noteWrite(); // Write_Signal before BEGIN, so the sweep covers every committed write

  const out = await withClient(c.env.HYPERDRIVE_UNCACHED, c.executionCtx, (client) =>
    withTx(client, async (tx) => {
      const ctx = await loadScoringContext(tx, matchId, c.get('clerkUserId'), action.deviceId, action.actionId, action.reversesActionId);
      if (!ctx) throw new AppError(404, 'NOT_FOUND', 'Match not found');
      const starting = action.type === 'START';
      const format = starting ? (() => { try { return validateFormat(ctx.match.sport, action.payload.format); } catch (e) { throw bad(e.message); } })() : ctx.match.config_snapshot?.format;
      // Only an exact accepted final command may replay a locked result; every other gate still runs.
      const finalReplay = ctx.match.status === 'APPROVED' && action.type === 'FINALIZE' && ctx.existing?.type === 'FINALIZE' && ctx.existing.payloadHash === hash;
      const denied = evaluateChain(ctx, { starting, finalReplay, requireToday: Boolean(format) && !finalReplay }); // before the idempotency check: a revoked scorer's retry gets 403
      if (denied) throw new AppError(denied[0], denied[1], 'Scoring not allowed');

      const decision = decideAction({ existing: ctx.existing, lease: ctx.lease, lastSeq: ctx.match.last_seq }, { ...action, payloadHash: hash });
      if (decision.kind === 'ERROR') throw new AppError(decision.status, decision.code, 'Action conflicts with stored actions');
      if (decision.kind === 'REPLAY') return { seq: decision.seq, snapshot: decision.result.snapshot };

      const { match } = ctx;
      let data;
      if (format) {
        if (starting && match.last_seq !== 0) throw new AppError(409, 'FORMAT_LOCKED', 'The format is frozen after the match starts');
        const { rows: history } = await tx.query('SELECT action_id AS "actionId", type, payload, reverses_action_id AS "reversesActionId" FROM score_actions WHERE match_id = $1 ORDER BY seq', [match.id]);
        try {
          validateSportAction(match.sport, format, action);
          checkReversal(history, action);
          data = scoreMatch({ matchId: match.id, sport: match.sport, sides: match.sides, format, actions: [...history, action], status: 'LIVE' });
        } catch (err) { throw new AppError(422, 'ACTION_INVALID', err.message); }
        if (data.finalized) data.finalizedAt = ctx.now.toISOString();
      } else {
        const engine = engineFor(match.sport, c.env);
        if (!engine) throw new AppError(409, 'SPORT_RULES_OPEN', 'Choose a scoring format before starting this match');
        const current = ctx.snapshot ?? engine.init({ matchId: match.id, sport: match.sport, status: match.status, sides: match.sides });
        const applied = engine.apply(current, action, ctx.target);
        if (!applied.ok) throw new AppError(422, 'ACTION_INVALID', applied.message);
        data = { ...applied.snapshot, status: match.status };
      }
      const { seq } = decision;
      const snapshot = toPublic('snapshot', data);
      const card = toPublic('card', {
        id: match.id, sport: match.sport, status: data.status, competition: match.tournamentName,
        sides: snapshot.sides.map(({ name }) => ({ name })), score: snapshot.sides.map(({ points }) => points), clock: null,
        periods: snapshot.periods, winner: snapshot.winner, format: snapshot.format, finalizedAt: snapshot.finalizedAt, events: snapshot.events?.slice(-20), gamePoints: snapshot.gamePoints, serve: snapshot.serve,
      });
      const privateMatch = Boolean(format) && (match.kind === 'CUSTOM' || match.tournamentStatus === 'DRAFT');
      const roomMessage = { type: 'snapshot', room: `match:${match.id}`, seq, data: snapshot, ...(privateMatch ? { private: true } : {}) };
      const audit = { seq, clientSeq: action.clientSeq, deviceId: action.deviceId, type: action.type, payload: action.payload, reversesActionId: action.reversesActionId };
      // One statement: action, sequence, snapshot, lease client seq, audit and outbox commit together.
      const { rows: [outbox] } = await tx.query(
        `WITH a AS (
           INSERT INTO score_actions (match_id, action_id, seq, client_seq, device_id, account_id, type, payload, payload_hash, reverses_action_id, result)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)),
         m AS (UPDATE matches SET last_seq = $3, status = $19, correction_route = CASE WHEN $19 = 'REJECTED' THEN correction_route ELSE NULL END, config_snapshot = COALESCE($20::jsonb, config_snapshot), config_version = CASE WHEN $20::jsonb IS NULL THEN config_version ELSE 1 END WHERE id = $1),
         s AS (INSERT INTO match_snapshots (match_id, seq, data) VALUES ($1, $3, $12)
               ON CONFLICT (match_id) DO UPDATE SET seq = $3, data = $12, updated_at = now()),
         l AS (UPDATE scorer_leases SET last_client_seq = $4, updated_at = now() WHERE match_id = $1),
         au AS (INSERT INTO admin_audit_log (actor_account_id, action, entity, entity_id, request_id, after)
                VALUES ($6, $13, 'score_actions', $14, $15, $16))
         INSERT INTO outbox_events (match_id, seq, room_message, card) VALUES ($1, $3, $17, $18) RETURNING id`,
        [
          match.id, action.actionId, seq, action.clientSeq, action.deviceId, ctx.account.id, action.type, action.payload, hash,
          action.reversesActionId, { snapshot }, data, action.type === 'FINALIZE' ? 'MATCH_FINALIZED' : action.type === 'START' ? 'MATCH_STARTED' : action.reversesActionId ? 'SCORE_ACTION_REVERSED' : 'SCORE_ACTION',
          action.actionId, c.get('requestId'), audit, roomMessage, card, data.status,
          starting ? { format, source: RULE_SOURCES[match.sport], checkedOn: '2026-10-20' } : null,
        ],
      );
      return { seq, snapshot, delivery: { outboxId: outbox.id, matchId: match.id, seq, snapshot, card, private: privateMatch } };
    }),
  );
  if (out.delivery) c.executionCtx.waitUntil(deliver(c, out.delivery));
  return c.json({ actionId: action.actionId, seq: out.seq, snapshot: out.snapshot });
});
