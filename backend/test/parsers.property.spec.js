// Feature: backend-live-platform, Property 1: Input parsers accept exactly the valid forms
// Validates: Requirements 4.2, 9.4
import { exports as workerExports } from 'cloudflare:workers';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseRoom } from '../src/rooms.js';
import { parseId } from '../src/routes/public.js';

// Oracle, written without a regex: ASCII decimal, no leading zero, at most 18 digits (always fits bigint).
const isAsciiDigit = (ch) => ch >= '0' && ch <= '9';
const isId = (s) => typeof s === 'string' && s.length >= 1 && s.length <= 18 && s[0] !== '0' && [...s].every(isAsciiDigit);
const isRoom = (s) => s === 'home' || (typeof s === 'string' && s.startsWith('match:') && isId(s.slice(6)));

const digit = fc.constantFrom(...'0123456789');
const digits = (min, max) => fc.array(digit, { minLength: min, maxLength: max }).map((d) => d.join(''));
const validId = fc.tuple(fc.constantFrom(...'123456789'), digits(0, 17)).map(([a, b]) => a + b);
const junk = fc.constantFrom('a', 'e', ' ', '\n', '\t', '+', '-', '.', ',', '_', ':', '/', '\u0661', '\uff11', '\u00a0', '\0');

// Invalid forms that sit next to valid ones.
const nearMissId = fc.oneof(
  fc.constantFrom('', '0', '00', '-1', '+1', '1e3', '0x1', '1.0', ' 1', '1 ', '1\n', 'Infinity', 'NaN'),
  validId.map((id) => `0${id}`),
  fc.tuple(fc.constantFrom(...'123456789'), digits(18, 24)).map(([a, b]) => a + b), // 19+ digits
  fc.tuple(validId, junk, fc.nat()).map(([id, ch, i]) => {
    const at = i % (id.length + 1);
    return id.slice(0, at) + ch + id.slice(at);
  }),
);
const validRoom = fc.oneof(fc.constant('home'), validId.map((id) => `match:${id}`));
const nearMissRoom = fc.oneof(
  fc.constantFrom('', 'Home', 'HOME', 'home ', ' home', 'home\n', 'homes', 'match', 'match:', 'Match:1', 'match;1', 'match: 1', 'match:1:2', 'home:1'),
  nearMissId.map((id) => `match:${id}`),
  validId, // a bare ID is not a room
  validRoom.map((r) => `${r}/`),
);

const anyInput = (valid, nearMiss) =>
  fc.oneof(valid, nearMiss, fc.string(), fc.string({ unit: 'grapheme' }), fc.anything());

describe('Property 1: input parsers accept exactly the valid forms', () => {
  it('parseId returns the value iff it is a positive decimal ID without leading zeros', () => {
    fc.assert(
      fc.property(anyInput(validId, nearMissId), (s) => {
        expect(parseId(s)).toBe(isId(s) ? s : null);
      }),
      { numRuns: 300 },
    );
  });

  it('parseRoom returns the value iff it is home or match:<ID>', () => {
    fc.assert(
      fc.property(anyInput(validRoom, nearMissRoom), (s) => {
        expect(parseRoom(s)).toBe(isRoom(s) ? s : null);
      }),
      { numRuns: 300 },
    );
  });

  it('accepts every generated valid form', () => {
    fc.assert(
      fc.property(validId, (id) => {
        expect(parseId(id)).toBe(id);
        expect(parseRoom(`match:${id}`)).toBe(`match:${id}`);
      }),
      { numRuns: 100 },
    );
  });

  // Non-empty, and not '.'/'..', so the URL keeps the segment as the route parameter.
  const pathSafe = (s) => typeof s === 'string' && s.length > 0 && s !== '.' && s !== '..';
  const fetch = (path, headers) => workerExports.default.fetch(`http://example.com${path}`, { headers });
  const errorBody = (res, code, message) => ({ error: { code, message, requestId: res.headers.get('X-Request-Id') } });
  const HTTP_TIMEOUT_MS = 60_000; // 100 Worker requests outlast the 5 s default under load

  // Only /api/matches/:id is ID-only. /api/tournaments/:key now accepts an ID or a slug, so a
  // rejected ID there is tried as a slug (handled by the public endpoint tests, task 9.3).
  it('every rejected ID produces a 400 Error_Body', async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(nearMissId, fc.string()).filter((s) => pathSafe(s) && !isId(s)), async (s) => {
        const res = await fetch(`/api/matches/${encodeURIComponent(s)}`);
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual(errorBody(res, 'BAD_REQUEST', 'Malformed ID'));
      }),
      { numRuns: 100 },
    );
  }, HTTP_TIMEOUT_MS);

  it('every rejected room produces a 404 Error_Body', async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(nearMissRoom, fc.string()).filter((s) => pathSafe(s) && !isRoom(s)), async (s) => {
        const res = await fetch(`/live/${encodeURIComponent(s)}`, { Upgrade: 'websocket' });
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual(errorBody(res, 'NOT_FOUND', 'Room not found'));
      }),
      { numRuns: 100 },
    );
  }, HTTP_TIMEOUT_MS);
});
