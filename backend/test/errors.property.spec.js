// Feature: backend-live-platform, Property 5: Errors always map to the Error_Body without internals
// Validates: Requirements 10.1, 10.2, 10.3
import fc from 'fast-check';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AppError, onError, requestId } from '../src/http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
// Status and code pairs from the design error-code table (INTERNAL is the unknown-error path).
const TABLE = {
  400: ['BAD_REQUEST'],
  401: ['UNAUTHENTICATED'],
  403: ['NOT_STAFF', 'ACCOUNT_DISABLED', 'ROLE_FORBIDDEN', 'NOT_ASSIGNED', 'OUTSIDE_WINDOW', 'PERMISSION_DENIED'],
  404: ['NOT_FOUND', 'INVITE_NOT_FOUND'],
  409: [
    'SCORING_LOCKED', 'LEASE_REQUIRED', 'LEASE_HELD', 'IDEMPOTENCY_MISMATCH', 'SEQUENCE_CONFLICT',
    'REASON_REQUIRED', 'SPORT_RULES_OPEN', 'LAST_SUPER_ADMIN',
  ],
  422: ['ACTION_INVALID'],
  426: ['UPGRADE_REQUIRED'],
  502: ['CLERK_UNAVAILABLE'],
};
const PAIRS = Object.entries(TABLE).flatMap(([status, codes]) => codes.map((code) => [Number(status), code]));

let thrown;
const app = new Hono();
app.use('*', requestId);
app.onError(onError);
app.get('/boom', () => {
  throw thrown;
});

async function call(value) {
  thrown = value;
  const res = await app.request('/boom');
  const text = await res.text();
  return { res, text, body: JSON.parse(text) };
}

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('Property 5: errors map to the Error_Body without internals', () => {
  it('AppError keeps status, code and message', async () => {
    const appError = fc
      .tuple(fc.constantFrom(...PAIRS), fc.string())
      .map(([[status, code], message]) => new AppError(status, code, message));

    await fc.assert(
      fc.asyncProperty(appError, async (err) => {
        const { res, body } = await call(err);
        const header = res.headers.get('X-Request-Id');
        expect(res.status).toBe(err.status);
        expect(body).toEqual({ error: { code: err.code, message: err.message, requestId: header } });
        expect(body.error.code).not.toBe('');
        expect(header).toMatch(UUID);
      }),
      { numRuns: 100 },
    );
  });

  it('any other thrown value maps to 500 INTERNAL with no internals', async () => {
    const leak = fc.string().map((s) => `LEAK${s}`);
    const other = fc.oneof(
      leak.map((m) => new Error(m)),
      leak.map((m) => new TypeError(m)),
      leak.map((m) => new RangeError(m)),
      fc.constantFrom(new Error('LEAK postgres://u:p@h/db'), new Error('LEAK SELECT * FROM admin_accounts')),
      leak,
      fc.dictionary(fc.string(), leak),
      fc.constantFrom(null, undefined),
      fc.integer(),
    );

    await fc.assert(
      fc.asyncProperty(other, async (value) => {
        const { res, text, body } = await call(value);
        const header = res.headers.get('X-Request-Id');
        expect(res.status).toBe(500);
        expect(body).toEqual({ error: { code: 'INTERNAL', message: 'Internal error', requestId: header } });
        expect(header).toMatch(UUID);
        expect(text).not.toContain('LEAK');
        if (value instanceof Error) expect(text).not.toContain(value.stack);
      }),
      { numRuns: 100 },
    );
  });
});
