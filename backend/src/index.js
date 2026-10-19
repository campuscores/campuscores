import { Hono } from 'hono';
import { AppError, onError, requestId } from './http.js';
import { sweep } from './outbox.js';
import { parseRoom } from './rooms.js';
import { accountRoutes } from './routes/accounts.js';
import { actionRoutes } from './routes/actions.js';
import { assignmentRoutes } from './routes/assignments.js';
import { inviteRoutes } from './routes/invites.js';
import { leaseRoutes } from './routes/leases.js';
import { meRoutes } from './routes/me.js';
import { publicRoutes } from './routes/public.js';
export { MatchRoom } from './rooms.js';
const app = new Hono();
app.use('*', requestId);
app.onError(onError);
app.get('/health', (c) => c.json({ ok: true }));
app.get('/live/:room', (c) => {
  if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') {
    throw new AppError(426, 'UPGRADE_REQUIRED', 'WebSocket upgrade required');
  }
  const room = parseRoom(c.req.param('room'));
  if (!room) throw new AppError(404, 'NOT_FOUND', 'Room not found');
  return c.env.ROOMS.get(c.env.ROOMS.idFromName(room)).fetch(c.req.raw);
});
app.route('/api', publicRoutes); // cached pool, no auth
app.route('/api', meRoutes); // clerkAuth + loadAccount, uncached pool
app.route('/api', inviteRoutes); // clerkAuth (+ loadAccount for staff), uncached pool
app.route('/api', accountRoutes); // clerkAuth + loadAccount, uncached pool
app.route('/api', assignmentRoutes); // clerkAuth + loadAccount, uncached pool
app.route('/api', leaseRoutes); // clerkAuth + loadAccount, uncached pool
app.route('/api', actionRoutes); // clerkAuth; the chain SELECT loads the account, uncached pool
app.notFound(() => {
  throw new AppError(404, 'NOT_FOUND', 'Route not found');
});
export default {
  fetch: app.fetch,
  scheduled: (controller, env, ctx) => ctx.waitUntil(sweep(env, ctx)), // Requirement 17.1: cron Outbox_Sweep
};
