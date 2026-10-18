import { Hono } from 'hono';
import { AppError, onError, requestId } from './http.js';
import { parseRoom } from './rooms.js';
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
app.notFound(() => {
  throw new AppError(404, 'NOT_FOUND', 'Route not found');
});
export default { fetch: app.fetch };
