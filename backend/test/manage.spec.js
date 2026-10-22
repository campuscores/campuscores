import { env } from 'cloudflare:workers';
import { afterAll, describe, expect, it } from 'vitest';
import { api, db, one } from './helpers.js';

// Match dates must be today or later (Requirement 12.3), so the fixtures use dates relative to now
// rather than fixed calendar dates that drift into the past. ISO YYYY-MM-DD in UTC is close enough to
// the India_Time date for these far-future offsets.
const futureDate = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
const WIN_START = futureDate(30);
const WIN_END = futureDate(60);
const MATCH_DATE = futureDate(40);
const MATCH_DATE_2 = futureDate(41);

// Manager endpoint integration tests (task 7.6, Requirements 5.7, 23.2, 23.3).
//
// DB-gated like the other real-database suites: it runs in CI with REQUIRE_DB=1 and skips locally
// when no HYPERDRIVE_UNCACHED binding is set, so the file parses and skips cleanly without a database.
//
// Three things are checked against `backend/src/routes/manage.js` and the design "Audit_Row per
// accepted mutation" rule:
//   1. Each ACCEPTED mutation writes exactly one Audit_Row (count rises by 1). The one exception is
//      an idempotent Default_Format save of an unchanged format: it writes nothing (Property 11,
//      Requirement 10.5).
//   2. Each REFUSED or rolled-back mutation writes NO Audit_Row and changes no row: the relevant
//      table rows/counts are snapshotted before and after and asserted equal.
//   3. Boundary values for the validated fields and one malformed id.
//
// Other suites write to admin_audit_log concurrently, so this suite never reads global table counts.
// It scopes every audit assertion to the throwaway actor account it creates (actor_account_id), and
// every table snapshot to the fixture's own tournament subtree.

const code = async (res) => [res.status, (await res.json()).error?.code];

// A throwaway manager account that owns a DRAFT tournament. Everything the fixture inserts lives
// under this one account and tournament, so cleanup removes the whole subtree and its audit rows.
// The seed manager (account 2, test_tournament_manager) stays untouched; it is only used as the
// eligible target for the sport-manager add case.
const created = [];
async function fixture({ status = 'DRAFT' } = {}) {
  const suffix = crypto.randomUUID();
  const user = `test_manage_${suffix}`;
  const { id: accountId } = await one(
    `INSERT INTO admin_accounts (clerk_user_id, role, email, name) VALUES ($1, 'TOURNAMENT_MANAGER', $2, 'Manage test owner (fake)') RETURNING id`,
    [user, `${user}@example.test`],
  );
  const { id: tournamentId, slug } = await one(
    `INSERT INTO tournaments (slug, name, starts_on, ends_on, status, venue, description, owner_account_id)
     VALUES ($1, 'Manage test tournament (fake)', $4, $5, $2, 'Test Ground (fake)', 'Fake tournament for manage tests.', $3)
     RETURNING id, slug`,
    [`test-manage-${suffix}`, status, accountId, WIN_START, WIN_END],
  );
  // Extra tournaments this actor creates through the API (POST /api/manage/tournaments) are added
  // here so afterAll removes them even when a test fails before its own cleanup runs.
  const extraTournamentIds = [];
  const f = { suffix, user, accountId, tournamentId, slug, extraTournamentIds };
  created.push(f);
  // Every audit row this account writes, scoped to this actor only.
  f.audits = async () =>
    (await one('SELECT count(*)::int AS n FROM admin_audit_log WHERE actor_account_id = $1', [accountId])).n;
  f.auditActions = async () =>
    (
      await one(
        'SELECT array_agg(action ORDER BY id) AS actions FROM admin_audit_log WHERE actor_account_id = $1',
        [accountId],
      )
    ).actions ?? [];
  // A snapshot of every mutable row under this tournament, for the no-write assertions.
  f.snapshot = async () =>
    db(async (client) => {
      const sql = `(SELECT id FROM tournament_sports WHERE tournament_id = $1)`;
      const q = async (text, params = [f.tournamentId]) => (await client.query(text, params)).rows;
      return {
        tournament: await q('SELECT status, name, starts_on, ends_on, venue, description, image_key FROM tournaments WHERE id = $1'),
        sports: await q('SELECT id, sport, config, config_version FROM tournament_sports WHERE tournament_id = $1 ORDER BY id'),
        teams: await q(`SELECT id, label, branch, year, players FROM teams WHERE tournament_sport_id IN ${sql} ORDER BY id`),
        matches: await q(`SELECT id, kind, stage, side_a_team_id, side_b_team_id, scheduled_at, venue, status FROM matches WHERE tournament_sport_id IN ${sql} ORDER BY id`),
        managers: await q(`SELECT tournament_sport_id, account_id FROM tournament_sport_managers WHERE tournament_sport_id IN ${sql} ORDER BY tournament_sport_id, account_id`),
        audits: (await client.query('SELECT count(*)::int AS n FROM admin_audit_log WHERE actor_account_id = $1', [f.accountId])).rows[0].n,
      };
    });
  f.addSport = (sport) => one('INSERT INTO tournament_sports (tournament_id, sport, config, config_version) VALUES ($1, $2, $3, 1) RETURNING id', [tournamentId, sport, { format: {} }]);
  f.addTeam = (tsId, label) => one('INSERT INTO teams (tournament_sport_id, label) VALUES ($1, $2) RETURNING id', [tsId, label]);
  f.addMatch = (tsId, extra = {}) =>
    one(
      `INSERT INTO matches (tournament_sport_id, kind, stage, side_a_team_id, side_b_team_id, scheduled_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [tsId, extra.kind ?? 'CUSTOM', extra.stage ?? null, extra.sideA ?? null, extra.sideB ?? null, extra.scheduledAt ?? `${MATCH_DATE} 10:00+05:30`, extra.status ?? 'SCHEDULED'],
    );
  return f;
}

// Call the manager API as the fixture owner, unless a different user is given.
const asOwner = (f) => (method, path, body) => api(method, path, { user: f.user, body });

afterAll(async () => {
  if (!created.length) return;
  await db(async (client) => {
    for (const f of created) {
      await client.query('DELETE FROM admin_audit_log WHERE actor_account_id = $1', [f.accountId]);
      const sportIds = '(SELECT id FROM tournament_sports WHERE tournament_id = $1)';
      const matchIds = `(SELECT m.id FROM matches m WHERE m.tournament_sport_id IN ${sportIds})`;
      for (const tournamentId of [f.tournamentId, ...f.extraTournamentIds]) {
        await client.query(`DELETE FROM scorer_leases WHERE match_id IN ${matchIds}`, [tournamentId]);
        await client.query(`DELETE FROM match_operator_assignments WHERE match_id IN ${matchIds}`, [tournamentId]);
        await client.query(`DELETE FROM matches WHERE tournament_sport_id IN ${sportIds}`, [tournamentId]);
        await client.query(`DELETE FROM tournament_sport_managers WHERE tournament_sport_id IN ${sportIds}`, [tournamentId]);
        await client.query(`DELETE FROM teams WHERE tournament_sport_id IN ${sportIds}`, [tournamentId]);
        await client.query('DELETE FROM tournament_sports WHERE tournament_id = $1', [tournamentId]);
        await client.query('DELETE FROM tournaments WHERE id = $1', [tournamentId]);
      }
      await client.query('DELETE FROM admin_accounts WHERE id = $1', [f.accountId]);
    }
  });
});

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('manager mutations each write exactly one Audit_Row', () => {
  it('writes one audit row per accepted tournament, sport, team and match mutation', async () => {
    const f = await fixture();
    const call = asOwner(f);
    // A helper that asserts the accepted call bumped this actor's audit count by exactly `by`.
    let last = await f.audits();
    const bump = async (label, by, res) => {
      const now = await f.audits();
      expect(now - last, `${label} audit delta`).toBe(by);
      last = now;
      return res;
    };

    // --- create tournament: one TOURNAMENT_CREATED ---
    const createRes = await call('POST', '/api/manage/tournaments', { name: 'Audit cup (fake)', startsOn: WIN_START, endsOn: WIN_END });
    expect(createRes.status).toBe(201);
    const createdSlug = (await createRes.json()).tournament.slug;
    // The new tournament belongs to the same actor; register it so cleanup removes it even if a
    // later assertion fails before the explicit delete below.
    const createdId = (await one('SELECT id FROM tournaments WHERE slug = $1', [createdSlug])).id;
    f.extraTournamentIds.push(createdId);
    await bump('TOURNAMENT_CREATED', 1, createRes);

    // --- patch tournament: one TOURNAMENT_UPDATED ---
    await bump('TOURNAMENT_UPDATED', 1, await call('PATCH', `/api/manage/tournaments/${f.slug}`, { name: 'Renamed tournament (fake)' }));

    // --- add sport: one SPORT_ADDED ---
    const addSport = await call('POST', `/api/manage/tournaments/${f.slug}/sports`, { sport: 'badminton' });
    expect(addSport.status).toBe(201);
    await bump('SPORT_ADDED', 1, addSport);

    // --- PUT format changed: one SPORT_FORMAT_CHANGED ---
    const format = { model: 'sets', bestOf: 1, target: 21, winBy: 2, cap: 30 };
    const changed = await call('PUT', `/api/manage/tournaments/${f.slug}/sports/badminton/format`, { format });
    expect(changed.status).toBe(200);
    expect((await changed.json()).changed).toBe(true);
    await bump('SPORT_FORMAT_CHANGED', 1, changed);

    // --- PUT format unchanged (idempotent): NO audit row (Property 11) ---
    const unchanged = await call('PUT', `/api/manage/tournaments/${f.slug}/sports/badminton/format`, { format });
    expect(unchanged.status).toBe(200);
    expect((await unchanged.json()).changed).toBe(false);
    await bump('idempotent format save', 0, unchanged);

    // --- add sport manager (seed manager account 2 is an eligible ACTIVE TOURNAMENT_MANAGER) ---
    const addManager = await call('POST', `/api/manage/tournaments/${f.slug}/sports/badminton/managers`, { email: 'test-manager@example.test' });
    expect(addManager.status).toBe(201);
    const managerId = (await addManager.json()).manager.accountId;
    await bump('SPORT_MANAGER_ADDED', 1, addManager);

    // --- remove sport manager: one SPORT_MANAGER_REMOVED ---
    await bump('SPORT_MANAGER_REMOVED', 1, await call('DELETE', `/api/manage/tournaments/${f.slug}/sports/badminton/managers/${managerId}`));

    // --- create team: one TEAM_CREATED ---
    const addTeam = await call('POST', `/api/manage/tournaments/${f.slug}/sports/badminton/teams`, { name: 'Smashers (fake)' });
    expect(addTeam.status).toBe(201);
    const teamId = (await addTeam.json()).team.id;
    await bump('TEAM_CREATED', 1, addTeam);

    // --- patch team: one TEAM_UPDATED ---
    await bump('TEAM_UPDATED', 1, await call('PATCH', `/api/manage/teams/${teamId}`, { name: 'Smashers renamed (fake)' }));

    // --- create match: one MATCH_CREATED ---
    const addMatch = await call('POST', '/api/manage/matches', { tournament: f.slug, sport: 'badminton', date: MATCH_DATE, time: '10:00', stage: 'FINAL', sideA: null, sideB: null });
    expect(addMatch.status, JSON.stringify(await addMatch.clone().json())).toBe(201);
    const matchId = (await addMatch.json()).match.id;
    await bump('MATCH_CREATED', 1, addMatch);

    // --- patch match: one MATCH_UPDATED ---
    await bump('MATCH_UPDATED', 1, await call('PATCH', `/api/manage/matches/${matchId}`, { time: '11:00' }));

    // --- delete match (no assignment): one MATCH_DELETED ---
    await bump('MATCH_DELETED', 1, await call('DELETE', `/api/manage/matches/${matchId}`));

    // --- delete team (now unused): one TEAM_DELETED ---
    await bump('TEAM_DELETED', 1, await call('DELETE', `/api/manage/teams/${teamId}`));

    // --- remove sport (no matches left): one SPORT_REMOVED ---
    await bump('SPORT_REMOVED', 1, await call('DELETE', `/api/manage/tournaments/${f.slug}/sports/badminton`));

    // --- status change DRAFT->ONGOING needs a sport, so add one first, then change status ---
    const addSport2 = await call('POST', `/api/manage/tournaments/${f.slug}/sports`, { sport: 'football' });
    await bump('SPORT_ADDED (for status)', 1, addSport2);
    await bump('TOURNAMENT_STATUS_CHANGED', 1, await call('POST', `/api/manage/tournaments/${f.slug}/status`, { status: 'ONGOING' }));

    // --- delete the created DRAFT tournament: one TOURNAMENT_DELETED ---
    await bump('TOURNAMENT_DELETED', 1, await call('DELETE', `/api/manage/tournaments/${createdSlug}`));
    // The deleted tournament's rows are gone (its audit rows stay under this actor until afterAll).
    expect(await one('SELECT count(*)::int AS n FROM tournaments WHERE id = $1', [createdId])).toEqual({ n: 0 });

    // Every accepted mutation above wrote exactly one audit row except the idempotent save.
    const actions = await f.auditActions();
    expect(actions).toEqual([
      'TOURNAMENT_CREATED',
      'TOURNAMENT_UPDATED',
      'SPORT_ADDED',
      'SPORT_FORMAT_CHANGED',
      'SPORT_MANAGER_ADDED',
      'SPORT_MANAGER_REMOVED',
      'TEAM_CREATED',
      'TEAM_UPDATED',
      'MATCH_CREATED',
      'MATCH_UPDATED',
      'MATCH_DELETED',
      'TEAM_DELETED',
      'SPORT_REMOVED',
      'SPORT_ADDED',
      'TOURNAMENT_STATUS_CHANGED',
      'TOURNAMENT_DELETED',
    ]);
  });
});

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('refused manager mutations write no Audit_Row and change no row', () => {
  it('TOURNAMENT_LOCKED: a COMPLETED tournament refuses edits with no write', async () => {
    const f = await fixture({ status: 'COMPLETED' });
    const call = asOwner(f);
    const before = await f.snapshot();
    // A locked tournament refuses patch, add sport, add team, add match and format.
    expect(await code(await call('PATCH', `/api/manage/tournaments/${f.slug}`, { name: 'x' }))).toEqual([409, 'TOURNAMENT_LOCKED']);
    expect(await code(await call('POST', `/api/manage/tournaments/${f.slug}/sports`, { sport: 'badminton' }))).toEqual([409, 'TOURNAMENT_LOCKED']);
    expect(await f.snapshot()).toEqual(before);
  });

  it('SPORT_HAS_MATCHES: removing a sport that has a match is refused with no write', async () => {
    const f = await fixture();
    const call = asOwner(f);
    const { id: ts } = await f.addSport('badminton');
    await f.addMatch(ts);
    const before = await f.snapshot();
    expect(await code(await call('DELETE', `/api/manage/tournaments/${f.slug}/sports/badminton`))).toEqual([409, 'SPORT_HAS_MATCHES']);
    expect(await f.snapshot()).toEqual(before);
  });

  it('TEAM_IN_USE: deleting a team used by a match is refused with no write', async () => {
    const f = await fixture();
    const call = asOwner(f);
    const { id: ts } = await f.addSport('badminton');
    const { id: team } = await f.addTeam(ts, 'Used team (fake)');
    const { id: other } = await f.addTeam(ts, 'Other team (fake)');
    await f.addMatch(ts, { sideA: team, sideB: other });
    const before = await f.snapshot();
    expect(await code(await call('DELETE', `/api/manage/teams/${team}`))).toEqual([409, 'TEAM_IN_USE']);
    expect(await f.snapshot()).toEqual(before);
  });

  it('STAGE_TAKEN: a second match on the same bracket stage is refused with no write', async () => {
    const f = await fixture();
    const call = asOwner(f);
    await f.addSport('badminton');
    const first = await call('POST', '/api/manage/matches', { tournament: f.slug, sport: 'badminton', date: MATCH_DATE, time: '10:00', stage: 'FINAL' });
    expect(first.status).toBe(201);
    const before = await f.snapshot();
    expect(await code(await call('POST', '/api/manage/matches', { tournament: f.slug, sport: 'badminton', date: MATCH_DATE_2, time: '10:00', stage: 'FINAL' }))).toEqual([409, 'STAGE_TAKEN']);
    expect(await f.snapshot()).toEqual(before);
  });

  it('DATES_EXCLUDE_MATCHES: a date edit that would exclude a match is refused with no write', async () => {
    const f = await fixture();
    const call = asOwner(f);
    const { id: ts } = await f.addSport('badminton');
    // A match inside the fixture window; moving the end date before it must be refused.
    await f.addMatch(ts, { scheduledAt: `${MATCH_DATE} 10:00+05:30` });
    const before = await f.snapshot();
    // Moving the end date before that match day must be refused.
    expect(await code(await call('PATCH', `/api/manage/tournaments/${f.slug}`, { startsOn: WIN_START, endsOn: futureDate(35) }))).toEqual([409, 'DATES_EXCLUDE_MATCHES']);
    expect(await f.snapshot()).toEqual(before);
  });

  it('a validation 400 writes no row (empty tournament name)', async () => {
    const f = await fixture();
    const call = asOwner(f);
    const before = await f.snapshot();
    const auditsBefore = await f.audits();
    expect(await code(await call('PATCH', `/api/manage/tournaments/${f.slug}`, { name: '   ' }))).toEqual([400, 'BAD_REQUEST']);
    expect(await f.snapshot()).toEqual(before);
    expect(await f.audits()).toBe(auditsBefore);
  });

  it('NO_SPORTS: publishing a DRAFT with no sport is refused with no write', async () => {
    const f = await fixture();
    const call = asOwner(f);
    const before = await f.snapshot();
    expect(await code(await call('POST', `/api/manage/tournaments/${f.slug}/status`, { status: 'ONGOING' }))).toEqual([409, 'NO_SPORTS']);
    expect(await f.snapshot()).toEqual(before);
  });
});

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('validated field boundary values and a malformed id', () => {
  it('tournament name: 0 and 121 rejected, 1 and 120 accepted', async () => {
    const f = await fixture();
    const call = asOwner(f);
    expect(await code(await call('POST', '/api/manage/tournaments', { name: '', startsOn: WIN_START }))).toEqual([400, 'BAD_REQUEST']);
    expect(await code(await call('POST', '/api/manage/tournaments', { name: 'x'.repeat(121), startsOn: WIN_START }))).toEqual([400, 'BAD_REQUEST']);

    // The two accepted tournaments belong to this actor; register them so afterAll removes them and
    // their audit rows (the actor owns them, so audit rows clear with the actor).
    for (const name of ['a', 'y'.repeat(120)]) {
      const ok = await call('POST', '/api/manage/tournaments', { name, startsOn: WIN_START });
      expect(ok.status).toBe(201);
      f.extraTournamentIds.push((await one('SELECT id FROM tournaments WHERE slug = $1', [(await ok.json()).tournament.slug])).id);
    }
  });

  it('team name: 0 and 121 rejected, 1 and 120 accepted; year 1999/2100 rejected, 2000/2099 accepted; 31 players rejected, 30 accepted', async () => {
    const f = await fixture();
    const call = asOwner(f);
    await f.addSport('badminton');
    const teams = `/api/manage/tournaments/${f.slug}/sports/badminton/teams`;

    // Name length boundaries.
    expect(await code(await call('POST', teams, { name: '' }))).toEqual([400, 'BAD_REQUEST']);
    expect(await code(await call('POST', teams, { name: 'n'.repeat(121) }))).toEqual([400, 'BAD_REQUEST']);
    expect((await call('POST', teams, { name: 'a' })).status).toBe(201);
    expect((await call('POST', teams, { name: 'z'.repeat(120) })).status).toBe(201);

    // Year boundaries (2000-2099 inclusive).
    expect(await code(await call('POST', teams, { name: 'Year low (fake)', year: 1999 }))).toEqual([400, 'BAD_REQUEST']);
    expect(await code(await call('POST', teams, { name: 'Year high (fake)', year: 2100 }))).toEqual([400, 'BAD_REQUEST']);
    expect((await call('POST', teams, { name: 'Year min (fake)', year: 2000 })).status).toBe(201);
    expect((await call('POST', teams, { name: 'Year max (fake)', year: 2099 })).status).toBe(201);

    // Player count boundary (badminton allows player names, no jersey/captain).
    const players = (n) => Array.from({ length: n }, (_, i) => ({ name: `Player ${i + 1} (fake)` }));
    expect(await code(await call('POST', teams, { name: 'Too many players (fake)', players: players(31) }))).toEqual([400, 'BAD_REQUEST']);
    expect((await call('POST', teams, { name: 'Max players (fake)', players: players(30) })).status).toBe(201);
  });

  it('malformed team id is a 400 before any lookup', async () => {
    const f = await fixture();
    const call = asOwner(f);
    expect(await code(await call('PATCH', '/api/manage/teams/abc', { name: 'x' }))).toEqual([400, 'BAD_REQUEST']);
  });
});
