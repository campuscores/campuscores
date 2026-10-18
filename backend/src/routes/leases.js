import { Hono } from 'hono';
import { clerkAuth, loadAccount, requireRole } from '../auth.js';
import { withClient, withTx } from '../db.js';
import { AppError, jsonBody } from '../http.js';
import { isWithinWindow, leaseDecision } from '../scoring.js';
import { idParam } from './public.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uncached = (c, fn) => withClient(c.env.HYPERDRIVE_UNCACHED, c.executionCtx, fn);

export const leaseRoutes = new Hono();

// Requirements 14.6–14.8: grant, keep, take over or refuse the match's one scoring device.
leaseRoutes.post('/matches/:id/lease', clerkAuth, loadAccount, requireRole('staff'), async (c) => {
  const matchId = idParam(c);
  const body = await jsonBody(c);
  if (typeof body.deviceId !== 'string' || !UUID.test(body.deviceId)) throw new AppError(400, 'BAD_REQUEST', 'deviceId must be a UUID');
  const deviceId = body.deviceId.toLowerCase(); // pg returns uuid in lower case
  const accountId = c.get('account').id;
  const lease = await uncached(c, (client) =>
    withTx(client, async (tx) => {
      const { rows: [match] } = await tx.query('SELECT now() AS now FROM matches WHERE id = $1 FOR UPDATE', [matchId]);
      if (!match) throw new AppError(404, 'NOT_FOUND', 'Match not found');
      const { rows: [assignment] } = await tx.query(
        `SELECT valid_from, valid_until FROM match_operator_assignments
         WHERE match_id = $1 AND account_id = $2 AND status = 'ACTIVE'`,
        [matchId, accountId],
      );
      if (!assignment) throw new AppError(403, 'NOT_ASSIGNED', 'No active assignment for this match');
      if (!isWithinWindow(match.now, assignment.valid_from, assignment.valid_until)) {
        throw new AppError(403, 'OUTSIDE_WINDOW', 'The assignment is not valid now');
      }
      const { rows: [held] } = await tx.query(
        `SELECT l.account_id AS "accountId", l.device_id AS "deviceId", l.last_client_seq AS "lastClientSeq",
                EXISTS (SELECT 1 FROM match_operator_assignments a
                        WHERE a.match_id = l.match_id AND a.account_id = l.account_id AND a.status = 'ACTIVE') AS "holderActive"
         FROM scorer_leases l WHERE l.match_id = $1 FOR UPDATE OF l`,
        [matchId],
      );
      const decision = leaseDecision(held, { accountId, deviceId, takeover: body.takeover === true }, held?.holderActive);
      if (decision === 'LEASE_HELD') throw new AppError(409, 'LEASE_HELD', 'Another device holds the scorer lease');
      if (decision === 'KEEP') return { matchId, deviceId, lastClientSeq: held.lastClientSeq, decision };
      await tx.query(
        `INSERT INTO scorer_leases (match_id, account_id, device_id) VALUES ($1, $2, $3)
         ON CONFLICT (match_id) DO UPDATE SET account_id = $2, device_id = $3, last_client_seq = 0,
           acquired_at = now(), updated_at = now()`,
        [matchId, accountId, deviceId],
      );
      await tx.query(
        `INSERT INTO admin_audit_log (actor_account_id, action, entity, entity_id, request_id, before, after)
         VALUES ($1, $2, 'scorer_leases', $3, $4, $5, $6)`,
        [
          accountId,
          decision === 'TAKEOVER' ? 'LEASE_TAKEOVER' : 'LEASE_GRANTED',
          matchId,
          c.get('requestId'),
          held ? { accountId: held.accountId, deviceId: held.deviceId } : null,
          { accountId, deviceId },
        ],
      );
      return { matchId, deviceId, lastClientSeq: 0, decision };
    }),
  );
  return c.json({ lease });
});

// Releases only the caller's own lease; repeating it is harmless.
leaseRoutes.delete('/matches/:id/lease', clerkAuth, loadAccount, requireRole('staff'), async (c) => {
  const matchId = idParam(c);
  await uncached(c, (client) =>
    client.query('DELETE FROM scorer_leases WHERE match_id = $1 AND account_id = $2', [matchId, c.get('account').id]),
  );
  return c.body(null, 204);
});
