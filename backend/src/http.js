const SECRET_KEY = /token|secret|password|authorization|cookie|connection/i;
// URL schemes are case-insensitive, so match the value prefixes case-insensitively too.
const SECRET_VALUE = /^(postgres:\/\/|postgresql:\/\/|bearer )/i;

export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export async function jsonBody(c) {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'BAD_REQUEST', 'JSON object body required');
  return body;
}

export async function requestId(c, next) {
  const id = crypto.randomUUID();
  c.set('requestId', id);
  c.header('X-Request-Id', id); // before next(): a notFound throw skips code after next()
  try {
    await next();
  } catch (err) {
    // Hono re-throws non-Error values instead of calling onError.
    return onError(err, c);
  }
}

export function onError(err, c) {
  const known = err instanceof AppError;
  const code = known ? err.code : 'INTERNAL';
  const requestId = c.get('requestId');
  console.log(JSON.stringify(redact({ requestId, code, name: err?.name })));
  return c.json(
    { error: { code, message: known ? err.message : 'Internal error', requestId } },
    known ? err.status : 500,
  );
}

export function redact(value) {
  if (typeof value === 'string') return SECRET_VALUE.test(value) ? '[redacted]' : value;
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) ? '[redacted]' : redact(v)]),
    );
  }
  return value;
}

// Public_DTO allow-lists. `true` copies a primitive (or an array of primitives); an object recurses
// into a nested object or array of objects. Anything not listed, or of another shape, is dropped.
const SIDE = { name: true };
const FORMAT = { model: true, bestOf: true, target: true, winBy: true, cap: true, decidingTarget: true, firstServe: true, gamesPerSet: true, gameWinBy: true, advantage: true, tiebreakAt: true, tiebreakTo: true, tiebreakWinBy: true, periodCount: true, scoreValues: true };
const PERIOD = { points: true, winner: true, current: true, manual: true, tiebreak: true };
const SNAPSHOT = { matchId: true, sport: true, status: true, sides: { name: true, points: true }, corrected: true, format: FORMAT, periods: PERIOD, currentPoints: true, gamePoints: true, serve: true, winner: true, finalized: true, finalizedAt: true, tiebreak: true, fouls: true, events: { type: true, side: true, player: true, card: true, off: true, on: true, period: true } };
const MATCH = {
  id: true,
  tournamentId: true,
  tournamentName: true,
  tournamentSlug: true,
  sport: true,
  kind: true,
  stage: true,
  status: true,
  phase: true,
  scheduledAt: true,
  venue: true,
  seq: true,
  sides: SIDE,
  snapshot: SNAPSHOT,
};
const PUBLIC = {
  snapshot: SNAPSHOT,
  match: MATCH,
  card: { id: true, sport: true, status: true, competition: true, tournamentId: true, sides: SIDE, score: true, clock: true, seq: true, periods: PERIOD, winner: true, format: FORMAT, finalizedAt: true, gamePoints: true, serve: true, events: { type: true, side: true, player: true, card: true, off: true, on: true, period: true } },
  tournament: {
    id: true,
    slug: true,
    name: true,
    startsOn: true,
    endsOn: true,
    status: true,
    phase: true,
    imageKey: true,
    venue: true,
    description: true,
    sports: true,
    matches: MATCH,
  },
};

const isPrimitive = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v);

function pick(spec, obj) {
  if (Array.isArray(obj)) return obj.map((item) => pick(spec, item));
  if (!obj || typeof obj !== 'object') return null;
  const out = {};
  for (const [key, sub] of Object.entries(spec)) {
    if (!Object.hasOwn(obj, key)) continue;
    const v = obj[key];
    if (sub !== true) out[key] = pick(sub, v);
    else if (isPrimitive(v) || (Array.isArray(v) && v.every(isPrimitive))) out[key] = v;
  }
  return out;
}

export function toPublic(kind, obj) {
  if (!PUBLIC[kind]) throw new Error(`Unknown Public_DTO kind: ${kind}`);
  return pick(PUBLIC[kind], obj);
}
