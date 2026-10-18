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
