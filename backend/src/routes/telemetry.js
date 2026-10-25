import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { clerkAuth, loadAccount, requireRole } from '../auth.js';
import { AppError, jsonBody } from '../http.js';
import { metric, stagingMetrics } from '../metrics.js';

export function parseRecovery(body) {
  const limits = { durationMs: 86400000, ageMs: 86400000, pending: 100000, retries: 10000 };
  if (!['recovered', 'paused'].includes(body.outcome) || Object.keys(body).some(k => !['outcome', ...Object.keys(limits)].includes(k))
    || Object.entries(limits).some(([k, max]) => !Number.isFinite(body[k]) || body[k] < 0 || body[k] > max)
    || body.durationMs > body.ageMs || !Number.isInteger(body.pending) || body.pending < 1 || !Number.isInteger(body.retries)) {
    throw new AppError(400, 'BAD_REQUEST', 'Invalid recovery summary');
  }
  return { outcome: body.outcome, ...Object.fromEntries(Object.keys(limits).map(k => [k, body[k]])) };
}

export const telemetryRoutes = new Hono();
telemetryRoutes.post('/operator/metrics', (c, next) => {
  if (!stagingMetrics(c.env)) throw new AppError(404, 'NOT_FOUND', 'Route not found');
  return next();
}, bodyLimit({ maxSize: 1024, onError: () => { throw new AppError(413, 'BODY_TOO_LARGE', 'Summary too large'); } }),
clerkAuth, loadAccount, requireRole('staff'), async c => {
  metric(c.env, 'recovery', parseRecovery(await jsonBody(c)));
  return c.body(null, 204);
});
