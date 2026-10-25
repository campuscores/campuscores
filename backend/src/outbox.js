import { withClient } from './db.js';
import { metric } from './metrics.js';
import { reportError } from './http.js';
export const SWEEP_WINDOW_MS = 15 * 60 * 1000;
// Requirement 17.3/17.4: sweep only while the Write_Signal is 15 minutes old or newer.
export const shouldSweep = (now, lastWriteAt) => now - lastWriteAt <= SWEEP_WINDOW_MS;
export const room = (env, name) => env.ROOMS.get(env.ROOMS.idFromName(name));
// One Outbox_Event to both Live_Rooms. shouldAccept in the rooms makes a resend harmless.
export const publishEvent = (env, { matchId, seq, snapshot, card, private: privateMatch }) =>
  privateMatch ? Promise.resolve() : Promise.all([room(env, `match:${matchId}`).publish(snapshot, seq), room(env, 'home').publishCard(matchId, card, seq)]);
export const markDelivered = (client, id) => client.query('UPDATE outbox_events SET delivered_at = now() WHERE id = $1', [id]);
// Cron Outbox_Sweep (Requirements 17.1, 17.3–17.5).
export async function sweep(env, ctx) {
  if (!shouldSweep(Date.now(), await room(env, 'home').lastWriteAt())) return; // no Neon query: Neon can suspend
  const start = performance.now();
  await withClient(env.HYPERDRIVE_UNCACHED, ctx, async (client) => {
    const { rows } = await client.query(
      `SELECT id, match_id, seq, room_message, card, created_at FROM outbox_events
       WHERE delivered_at IS NULL ORDER BY match_id, seq LIMIT 200`,
    );
    let failedMatch = null;
    let delivered = 0;
    let failures = 0;
    for (const row of rows) {
      if (row.match_id === failedMatch) continue; // keep seq order: a later event must not pass a failed one
      try {
        await publishEvent(env, { matchId: row.match_id, seq: row.seq, snapshot: row.room_message.data, card: row.card, private: row.room_message.private });
        await markDelivered(client, row.id);
        delivered += 1;
      } catch (err) {
        failedMatch = row.match_id;
        failures += 1;
        reportError(env, err, { code: 'SWEEP_PUBLISH_FAILED', matchId: row.match_id, seq: row.seq });
      }
    }
    metric(env, 'sweep', {
      durationMs: performance.now() - start, pending: rows.length, recipients: delivered, failures,
      ageMs: rows.length ? Math.max(...rows.map(row => Date.now() - new Date(row.created_at).getTime())) : 0,
      outcome: failures ? 'failed' : 'ok',
    });
  });
}
