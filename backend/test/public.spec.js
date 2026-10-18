import { env, exports as workerExports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { toPublic } from '../src/http.js';

const worker = (path, headers = {}) => workerExports.default.fetch(new Request(`http://example.com${path}`, { headers }));

describe('public read routes without a database', () => {
  it('returns a 400 Error_Body for a malformed ID before any query', async () => {
    for (const path of ['/api/tournaments/0', '/api/tournaments/abc', '/api/matches/01', '/api/matches/-1', '/api/matches/1e3']) {
      const res = await worker(path);
      expect(res.status, path).toBe(400);
      expect(await res.json()).toEqual({
        error: { code: 'BAD_REQUEST', message: 'Malformed ID', requestId: res.headers.get('X-Request-Id') },
      });
    }
  });
});

// Runs against the migrated, seeded CI Postgres (db/seed/fake.sql IDs); vitest.config.js fails the run under REQUIRE_DB=1 without it.
const PUBLIC_KEYS = new Set([
  'tournaments', 'tournament', 'match', 'id', 'slug', 'name', 'startsOn', 'endsOn', 'status', 'venue', 'description',
  'sports', 'matches', 'tournamentId', 'sport', 'kind', 'stage', 'scheduledAt', 'seq', 'sides', 'snapshot',
  'matchId', 'points', 'corrected',
]);
const allKeys = (v) =>
  Array.isArray(v) ? v.flatMap(allKeys)
  : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [k, ...allKeys(x)])
  : [];

const SIDES = (a, b) => [{ name: a }, { name: b }];
const SEED_MATCHES = [
  { id: '1', stage: 'SF1', status: 'APPROVED', at: '2026-01-10T10:00:00+05:30', sides: SIDES('Test Team A (fake)', 'Test Team B (fake)') },
  { id: '2', stage: 'SF2', status: 'PENDING_APPROVAL', at: '2026-01-10T14:00:00+05:30', sides: SIDES('Test Team C (fake)', 'Test Team D (fake)') },
  { id: '3', stage: 'FINAL', status: 'SCHEDULED', at: '2026-01-12T16:00:00+05:30', sides: SIDES(null, null) },
];
const expectSeedMatch = (got, want) => {
  expect(got).toEqual({
    id: want.id, tournamentId: '1', sport: 'football', kind: 'BRACKET', stage: want.stage, status: want.status,
    scheduledAt: expect.any(String), venue: 'Test Ground (fake)', seq: 0, sides: want.sides,
  });
  expect(Date.parse(got.scheduledAt)).toBe(Date.parse(want.at)); // session time zone may differ
};

describe.skipIf(!env.HYPERDRIVE_CACHED)('public read routes against the seed', () => {
  it('lists the published seed tournament', async () => {
    const res = await worker('/api/tournaments');
    expect(res.status).toBe(200);
    const { tournaments } = await res.json();
    expect(tournaments.find((t) => t.id === '1')).toEqual({
      id: '1', slug: 'test-fake-cup', name: 'Test Fake Cup', startsOn: '2026-01-10', endsOn: '2026-01-12',
      status: 'PUBLISHED', venue: 'Test Ground (fake)', description: 'Fake seed tournament for CI and staging.',
    });
  });

  it('returns the tournament with its sports and bracket matches only', async () => {
    const res = await worker('/api/tournaments/1');
    expect(res.status).toBe(200);
    const { tournament } = await res.json();
    expect(tournament).toMatchObject({ id: '1', slug: 'test-fake-cup', sports: ['badminton', 'football'] });
    expect(tournament.matches).toHaveLength(SEED_MATCHES.length); // custom match 4 stays private
    tournament.matches.forEach((m, i) => expectSeedMatch(m, SEED_MATCHES[i]));
  });

  it('returns a match with its snapshot', async () => {
    const res = await worker('/api/matches/1');
    expect(res.status).toBe(200);
    const { match } = await res.json();
    const { snapshot, ...rest } = match;
    expectSeedMatch(rest, SEED_MATCHES[0]);
    expect(snapshot).toBeNull(); // no match_snapshots table until task 9.1
  });

  it('returns a 404 Error_Body for unknown and private IDs', async () => {
    const cases = [
      ['/api/tournaments/999999', 'Tournament not found'],
      ['/api/matches/999999', 'Match not found'],
      ['/api/matches/4', 'Match not found'], // seed CUSTOM match
      ['/api/matches/999999999999999999', 'Match not found'], // largest accepted form
    ];
    for (const [path, message] of cases) {
      const res = await worker(path);
      expect(res.status, path).toBe(404);
      expect(await res.json()).toEqual({ error: { code: 'NOT_FOUND', message, requestId: res.headers.get('X-Request-Id') } });
    }
  });

  it('returns the same body with or without an Authorization header, with only public fields', async () => {
    for (const path of ['/api/tournaments', '/api/tournaments/1', '/api/matches/1', '/api/matches/3']) {
      const anon = await worker(path);
      const signed = await worker(path, { Authorization: 'Bearer test_not_a_real_token' });
      expect(signed.status, path).toBe(anon.status);
      const body = await anon.json();
      expect(await signed.json(), path).toEqual(body);
      expect(allKeys(body).filter((k) => !PUBLIC_KEYS.has(k)), path).toEqual([]);
      expect(JSON.stringify(body), path).not.toMatch(/test_(super_admin|tournament_manager|match_operator)/);
    }
  });
});

describe('toPublic', () => {
  it('copies listed keys, recurses into nested shapes and drops everything else', () => {
    const row = {
      id: '1',
      name: 'Cup',
      sports: ['football'],
      email: 'x@example.com',
      matches: [{ id: '2', sides: [{ name: 'A', accountId: 3 }], lease: { deviceId: 'd' }, correction_route: 'OPERATOR' }],
      venue: { private: true }, // a listed leaf with an object value is dropped
    };
    expect(toPublic('tournament', row)).toEqual({
      id: '1',
      name: 'Cup',
      sports: ['football'],
      matches: [{ id: '2', sides: [{ name: 'A' }] }],
    });
    expect(toPublic('match', { id: '2', snapshot: null })).toEqual({ id: '2', snapshot: null });
    expect(() => toPublic('account', {})).toThrow();
  });
});
