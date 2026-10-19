import { withClient } from './db.js';
import { redact } from './http.js';
export const SWEEP_WINDOW_MS = 15 * 60 * 1000;
// Requirement 17.3/17.4: sweep only while the Write_Signal is 15 minutes old or newer.
export const shouldSweep = (now, lastWriteAt) => now - lastWriteAt <= SWEEP_WINDOW_MS;
export const room = (env, name) => env.ROOMS.get(env.ROOMS.idFromName(name));
// One Outbox_Event to both Live_Rooms. shouldAccept in the rooms makes a resend harmless.
export const publishEvent = (env, { matchId, seq, snapshot, card }) =>
  Promise.all([room(env, `match:${matchId}`).publish(snapshot, seq), room(env, 'home').publishCard(matchId, card, seq)]);
export const markDelivered = (client, id) => client.query('UPDATE outbox_events SET delivered_at = now() WHERE id = $1', [id]);
// Cron Outbox_Sweep (Requirements 17.1, 17.3–17.5).
export async function sweep(env, ctx) {
  if (!shouldSweep(Date.now(), await room(env, 'home').lastWriteAt())) return; // no Neon query: Neon can suspend
  await withClient(env.HYPERDRIVE_UNCACHED, ctx, async (client) => {
    const { rows } = await client.query(
      `SELECT id, match_id, seq, room_message, card FROM outbox_events
       WHERE delivered_at IS NULL ORDER BY match_id, seq LIMIT 200`,
    );
    let failedMatch = null;
    for (const row of rows) {
      if (row.match_id === failedMatch) continue; // keep seq order: a later event must not pass a failed one
      try {
        await publishEvent(env, { matchId: row.match_id, seq: row.seq, snapshot: row.room_message.data, card: row.card });
        await markDelivered(client, row.id);
      } catch (err) {
        failedMatch = row.match_id;
        console.log(JSON.stringify(redact({ code: 'SWEEP_PUBLISH_FAILED', matchId: row.match_id, seq: row.seq, name: err?.name })));
      }
    }
  });
}
