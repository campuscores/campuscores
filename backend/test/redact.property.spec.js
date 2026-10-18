// Feature: backend-live-platform, Property 6: Log redaction removes secrets
// Validates: Requirements 10.5
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { redact } from '../src/http.js';

const SECRET_KEY = /token|secret|password|authorization|cookie|connection/i;
const SECRET_VALUE = /^(postgres:\/\/|postgresql:\/\/|bearer )/i;
const MARK = 'SECRETMARK';

const safeKey = fc.oneof(
  fc.constantFrom('id', 'code', 'name', 'status', 'requestId'),
  fc.string().filter((k) => !SECRET_KEY.test(k) && k !== '__proto__'),
);
const secretKey = fc.constantFrom(
  'token', 'accessToken', 'CLERK_SECRET_KEY', 'password', 'Authorization', 'cookie', 'set-cookie',
  'connectionString', 'DATABASE_CONNECTION',
);
const plainString = fc.string().filter((s) => !SECRET_VALUE.test(s) && !s.includes(MARK));
const plainLeaf = fc.oneof(plainString, fc.integer(), fc.boolean(), fc.constant(null));
const secretString = fc.oneof(
  fc.string().map((s) => `postgres://u:p@h/${MARK}${s}`),
  fc.string().map((s) => `postgresql://u:p@h/${MARK}${s}`),
  fc.string().map((s) => `Bearer ${MARK}${s}`),
);
const marked = fc.string().map((s) => `${MARK}${s}`);

// Any log object: secrets sit under secret keys or in secret-prefixed strings, at any depth.
const { node: logValue } = fc.letrec((tie) => ({
  node: fc.oneof({ maxDepth: 3 }, plainLeaf, secretString, tie('array'), tie('object')),
  array: fc.array(tie('node'), { maxLength: 4 }),
  object: fc
    .array(
      fc.oneof(
        fc.tuple(safeKey, tie('node')),
        fc.tuple(secretKey, fc.oneof(marked, tie('node'))),
      ),
      { maxLength: 4 },
    )
    .map(Object.fromEntries),
}));

// Only safe keys and plain leaves: redact must leave these unchanged.
const { node: safeValue } = fc.letrec((tie) => ({
  node: fc.oneof({ maxDepth: 3 }, plainLeaf, tie('array'), tie('object')),
  array: fc.array(tie('node'), { maxLength: 4 }),
  object: fc.array(fc.tuple(safeKey, tie('node')), { maxLength: 4 }).map(Object.fromEntries),
}));

function expectNoSecrets(value) {
  if (typeof value === 'string') expect(value).not.toMatch(SECRET_VALUE);
  else if (Array.isArray(value)) value.forEach(expectNoSecrets);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY.test(k)) expect(v).toBe('[redacted]');
      else expectNoSecrets(v);
    }
  }
}

describe('Property 6: log redaction removes secrets', () => {
  it('removes secret-key values and secret-prefixed strings at any depth', () => {
    fc.assert(
      fc.property(logValue, (value) => {
        const out = redact(value);
        expect(JSON.stringify(out) ?? '').not.toContain(MARK);
        expectNoSecrets(out);
      }),
      { numRuns: 100 },
    );
  });

  it('leaves values without secrets unchanged', () => {
    fc.assert(
      fc.property(safeValue, (value) => {
        expect(redact(value)).toEqual(value);
      }),
      { numRuns: 100 },
    );
  });

  it('does not mutate its input', () => {
    fc.assert(
      fc.property(logValue, (value) => {
        const before = structuredClone(value);
        redact(value);
        expect(value).toEqual(before);
      }),
      { numRuns: 100 },
    );
  });
});
