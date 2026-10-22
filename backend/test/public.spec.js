import { env, exports as workerExports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { toPublic } from '../src/http.js';

const worker = (path, headers = {}) => workerExports.default.fetch(new Request(`http://example.com${path}`, { headers }));

describe('public read routes without a database', () => {
  it('returns a 400 Error_Body for a malformed match ID before any query', async () => {
    for (const path of ['/api/matches/01', '/api/matches/-1', '/api/matches/1e3']) {
      const res = await worker(path);
      expect(res.status, path).toBe(400);
      expect(await res.json()).toEqual({
        error: { code: 'BAD_REQUEST', message: 'Malformed ID', requestId: res.headers.get('X-Request-Id') },
      });
    }
  });

  // /api/tournaments/:key takes an ID or a slug; only a key that is neither form is malformed.
  it('returns a 400 Error_Body for a malformed tournament key before any query', async () => {
    for (const path of ['/api/tournaments/Upper', '/api/tournaments/has%20space', '/api/tournaments/a.b']) {
      const res = await worker(path);
      expect(res.status, path).toBe(400);
      expect(await res.json()).toEqual({
        error: { code: 'BAD_REQUEST', message: 'Malformed key', requestId: res.headers.get('X-Request-Id') },
      });
    }
  });
});

// Runs against the migrated, seeded CI Postgres (db/seed/fake.sql IDs); vitest.config.js fails the run under REQUIRE_DB=1 without it.
// Public fields only. The route adds `phase` (JS-computed Tournament_Phase/Match_Phase), `imageKey`
// (effective Venue_Library key) and, on the sport read, `tournamentName`/`tournamentSlug`.
const PUBLIC_KEYS = new Set([
  'tournaments', 'tournament', 'match', 'id', 'slug', 'name', 'startsOn', 'endsOn', 'status', 'phase', 'imageKey',
  'venue', 'description', 'sports', 'matches', 'tournamentId', 'tournamentName', 'tournamentSlug', 'sport', 'kind',
  'stage', 'scheduledAt', 'seq', 'sides', 'snapshot', 'matchId', 'points', 'corrected',
]);
const allKeys = (v) =>
  Array.isArray(v) ? v.flatMap(allKeys)
  : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [k, ...allKeys(x)])
  : [];

const SIDES = (a, b) => [{ name: a }, { name: b }];
// The seed tournament runs 2026-01-10..12 and every seed match is scheduled 2026-01, all in the past
// relative to the CI clock, so Tournament_Phase is 'past' and every Match_Phase is 'past'
// (APPROVED/PENDING_APPROVAL are past; the SCHEDULED matches are past once their Match_Day_End passed).
// Regular (CUSTOM) matches are now public, so the seed CUSTOM match 4 is returned (kind 'CUSTOM', stage null).
const SEED_MATCHES = {
  1: { id: '1', kind: 'BRACKET', stage: 'SF1', status: 'APPROVED', phase: 'past', at: '2026-01-10T10:00:00+05:30', sides: SIDES('Test Team A (fake)', 'Test Team B (fake)') },
  2: { id: '2', kind: 'BRACKET', stage: 'SF2', status: 'PENDING_APPROVAL', phase: 'past', at: '2026-01-10T14:00:00+05:30', sides: SIDES('Test Team C (fake)', 'Test Team D (fake)') },
  3: { id: '3', kind: 'BRACKET', stage: 'FINAL', status: 'SCHEDULED', phase: 'past', at: '2026-01-12T16:00:00+05:30', sides: SIDES(null, null) },
  4: { id: '4', kind: 'CUSTOM', stage: null, status: 'SCHEDULED', phase: 'past', at: '2026-01-11T11:00:00+05:30', sides: SIDES('Test Team A (fake)', 'Test Team C (fake)') },
};
// Detail and sport reads order matches by scheduled_at then id: 1 (Jan 10 10:00), 2 (Jan 10 14:00),
// 4 (Jan 11 11:00), 3 (Jan 12 16:00).
const SEED_MATCH_ORDER = ['1', '2', '4', '3'];
const expectSeedMatch = (got, want) => {
  expect(got).toEqual({
    id: want.id, tournamentId: '1', sport: 'football', kind: want.kind, stage: want.stage, status: want.status,
    phase: want.phase, scheduledAt: expect.any(String), venue: 'Test Ground (fake)', seq: 0, sides: want.sides,
  });
  expect(Date.parse(got.scheduledAt)).toBe(Date.parse(want.at)); // session time zone may differ
};

describe.skipIf(!env.HYPERDRIVE_CACHED)('public read routes against the seed', () => {
  it('lists the ONGOING seed tournament with phase and the effective imageKey', async () => {
    const res = await worker('/api/tournaments');
    expect(res.status).toBe(200);
    const { tournaments } = await res.json();
    expect(tournaments.find((t) => t.id === '1')).toEqual({
      id: '1', slug: 'test-fake-cup', name: 'Test Fake Cup', startsOn: '2026-01-10', endsOn: '2026-01-12',
      status: 'ONGOING', phase: 'past', imageKey: 'field', venue: 'Test Ground (fake)',
      description: 'Fake seed tournament for CI and staging.',
    });
    // The seed stores no image_key, so the effective key is VENUE_KEYS[(1 - 1) mod 5] = 'field'.
  });

  it('returns the tournament by ID with its sports and every public match', async () => {
    const res = await worker('/api/tournaments/1');
    expect(res.status).toBe(200);
    const { tournament } = await res.json();
    expect(tournament).toMatchObject({
      id: '1', slug: 'test-fake-cup', status: 'ONGOING', phase: 'past', imageKey: 'field',
      sports: ['badminton', 'football'],
    });
    // Regular (CUSTOM) matches are public now, so the four seed matches appear in schedule order.
    // Other specs insert throwaway CUSTOM matches into the seed tournament's badminton sport in
    // parallel, so filter to the seed match ids before asserting order and fields.
    const seedRows = tournament.matches.filter((m) => SEED_MATCHES[m.id]);
    expect(seedRows.map((m) => m.id)).toEqual(SEED_MATCH_ORDER);
    seedRows.forEach((m) => expectSeedMatch(m, SEED_MATCHES[m.id]));
  });

  it('returns the same tournament by slug as by ID', async () => {
    const byId = await worker('/api/tournaments/1');
    const bySlug = await worker('/api/tournaments/test-fake-cup');
    expect(bySlug.status).toBe(byId.status);
    const a = (await byId.json()).tournament;
    const b = (await bySlug.json()).tournament;
    // Stable tournament fields match between the two keys (the match list can shift if another spec
    // inserts a throwaway match in the seed tournament between the two reads).
    const facts = (t) => { const copy = { ...t }; delete copy.matches; return copy; };
    expect(facts(b)).toEqual(facts(a));
    // The seed matches are identical in both responses.
    const seed = (t) => t.matches.filter((m) => SEED_MATCHES[m.id]);
    expect(seed(b)).toEqual(seed(a));
  });

  it('returns a match with its snapshot, including the Regular (CUSTOM) match', async () => {
    for (const id of ['1', '4']) {
      const res = await worker(`/api/matches/${id}`);
      expect(res.status, id).toBe(200);
      const { match } = await res.json();
      const { snapshot, ...rest } = match;
      expectSeedMatch(rest, SEED_MATCHES[id]);
      expect(snapshot, id).toBeNull(); // the seed scores no match, so there is no match_snapshots row
    }
  });

  it('lists a sport\'s matches across public tournaments with the tournament name, slug and phase', async () => {
    const res = await worker('/api/sports/football/matches');
    expect(res.status).toBe(200);
    const { matches } = await res.json();
    const seed = matches.filter((m) => m.tournamentId === '1');
    expect(seed.map((m) => m.id)).toEqual(SEED_MATCH_ORDER);
    for (const m of seed) {
      const { tournamentName, tournamentSlug, ...rest } = m;
      expect(tournamentName).toBe('Test Fake Cup');
      expect(tournamentSlug).toBe('test-fake-cup');
      expectSeedMatch(rest, SEED_MATCHES[m.id]);
    }
  });

  it('returns a 404 Error_Body for unknown IDs and an unknown sport', async () => {
    const cases = [
      ['/api/tournaments/999999', 'Tournament not found'],
      ['/api/tournaments/no-such-slug', 'Tournament not found'],
      ['/api/matches/999999', 'Match not found'],
      ['/api/matches/999999999999999999', 'Match not found'], // largest accepted form
      ['/api/sports/quidditch/matches', 'Sport not found'],
    ];
    for (const [path, message] of cases) {
      const res = await worker(path);
      expect(res.status, path).toBe(404);
      expect(await res.json()).toEqual({ error: { code: 'NOT_FOUND', message, requestId: res.headers.get('X-Request-Id') } });
    }
  });
  // DRAFT and ARCHIVED tournaments (and their matches) return 404. The seed holds no DRAFT or ARCHIVED
  // tournament, so that path is covered by the manage and authz-matrix suites, which create one in a
  // rolled-back transaction; here the public ONGOING seed and its matches stand for the visible case.

  it('returns the same body with or without an Authorization header, with only public fields', async () => {
    for (const path of ['/api/tournaments', '/api/tournaments/1', '/api/matches/1', '/api/matches/4', '/api/sports/football/matches']) {
      const anon = await worker(path);
      const signed = await worker(path, { Authorization: 'Bearer test_not_a_real_token' });
      expect(signed.status, path).toBe(anon.status);
      const body = await anon.json();
      const signedBody = await signed.json();
      if (body.tournaments) {
        // Other spec files insert and delete public tournaments in the shared DB between the two calls,
        // so compare only the rows both lists contain.
        const shared = (a, b) => a.filter((t) => b.some((u) => u.id === t.id));
        expect(shared(body.tournaments, signedBody.tournaments).map((t) => t.id), path).toContain('1');
        expect(shared(signedBody.tournaments, body.tournaments), path).toEqual(shared(body.tournaments, signedBody.tournaments));
      } else if (body.matches) {
        // The sport read spans every public tournament, so other suites' rows may appear between the two
        // calls; compare only the rows both responses hold.
        const shared = (a, b) => a.filter((m) => b.some((n) => n.id === m.id));
        expect(shared(body.matches, signedBody.matches).map((m) => m.id), path).toContain('1');
        expect(shared(signedBody.matches, body.matches), path).toEqual(shared(body.matches, signedBody.matches));
      } else if (body.tournament) {
        // The single tournament embeds its match list, which other suites can grow with throwaway
        // matches in the seed tournament between the two calls; compare facts and the shared matches.
        const facts = (t) => { const copy = { ...t }; delete copy.matches; return copy; };
        expect(facts(signedBody.tournament), path).toEqual(facts(body.tournament));
        const shared = (x, y) => x.filter((m) => y.some((n) => n.id === m.id));
        expect(shared(signedBody.tournament.matches, body.tournament.matches), path)
          .toEqual(shared(body.tournament.matches, signedBody.tournament.matches));
      } else {
        expect(signedBody, path).toEqual(body);
      }
      expect(allKeys([body, signedBody]).filter((k) => !PUBLIC_KEYS.has(k)), path).toEqual([]);
      expect(JSON.stringify([body, signedBody]), path).not.toMatch(/test_(super_admin|tournament_manager|match_operator)/);
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
