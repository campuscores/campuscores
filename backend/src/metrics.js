import { routePath } from 'hono/route';

export const metricsEnabled = env => env?.APP_OBSERVABILITY === 'true';
const EVENTS = new Set(['http', 'publish', 'broadcast', 'sweep', 'recovery']);
const ACTIONS = new Set(['START', 'POINT', 'UNDO', 'END_SET', 'END_PERIOD', 'END_MATCH', 'FINALIZE', 'FOUL', 'CARD', 'SUBSTITUTION', 'EXTRA_PERIOD', 'REVERSE']);
const label = value => typeof value === 'string' && /^[a-zA-Z0-9_:/.*-]{0,120}$/.test(value) ? value : '';
const number = value => Number.isFinite(value) && value >= 0 ? Math.min(value, Number.MAX_SAFE_INTEGER) : 0;

// Native binding writes return immediately. Diagnostics must never change a score or a response.
export function metric(env, event, {
  route = '', outcome = '', action = '', room = '', code = '', method = '',
  durationMs = 0, recipients = 0, bytes = 0, pending = 0, ageMs = 0, failures = 0, retries = 0, status = 0,
} = {}) {
  if (!metricsEnabled(env) || !EVENTS.has(event)) return;
  try {
    env.APP_METRICS?.writeDataPoint({
      indexes: [event],
      blobs: [
        event, label(route), label(outcome), ACTIONS.has(action) ? action : '',
        ['home', 'match'].includes(room) ? room : '', label(code),
        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].includes(method) ? method : '', 'v1',
      ],
      doubles: [durationMs, recipients, bytes, pending, ageMs, failures, retries, status].map(number),
    });
  } catch { /* Telemetry is best-effort; never log its failures recursively. */ }
}

export async function measureRequest(c, next) {
  if (!metricsEnabled(c.env)) return next();
  const start = performance.now();
  try { await next(); }
  finally {
    metric(c.env, 'http', {
      route: routePath(c, -1), method: c.req.method, status: c.res.status,
      durationMs: performance.now() - start, code: c.get('metricCode'),
      action: c.get('metricAction'), outcome: c.get('metricOutcome') ?? (c.res.status >= 400 ? 'rejected' : 'ok'),
    });
  }
}
