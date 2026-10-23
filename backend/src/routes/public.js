import { Hono } from 'hono';
import { DEFAULT_FORMATS } from '../../../shared/scoring.mjs';
import { matchPhase, tournamentPhase } from '../../../shared/time.mjs';
import { withClient } from '../db.js';
import { AppError, toPublic } from '../http.js';

// Same form as Live_Room match IDs: positive, no leading zero, fits bigint.
export const ID_PATTERN = /^[1-9][0-9]{0,17}$/;
export const parseId = (s) => (typeof s === 'string' && ID_PATTERN.test(s) ? s : null);

// Slugs are lowercase a-z, 0-9 and hyphens and always contain a letter, so they
// never collide with the numeric ID_PATTERN (Requirement 9.6).
const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;

export function idParam(c) {
  const id = parseId(c.req.param('id'));
  if (!id) throw new AppError(400, 'BAD_REQUEST', 'Malformed ID');
  return id;
}

const notFound = (what) => new AppError(404, 'NOT_FOUND', `${what} not found`);

// The five Venue_Library keys, in the frontend venues.js order. When a tournament
// stores no image_key, its effective key is VENUE_KEYS[(id - 1) mod 5], so one
// tournament always shows the same photograph (Requirement 9.14 criterion 14).
const VENUE_KEYS = ['field', 'stadium', 'court', 'tennis', 'track'];
const effectiveImageKey = (id, imageKey) =>
  imageKey ?? VENUE_KEYS[(Number(id) - 1) % VENUE_KEYS.length];

// The allowed public sport keys are the supported sport formats.
const SPORTS = new Set(Object.keys(DEFAULT_FORMATS));

// Dates go out as text: pg would parse them into Date objects, which the allow-list drops.
// Public tournaments are ONGOING or COMPLETED; DRAFT and ARCHIVED stay private (404).
const PUBLIC_TOURNAMENT = `t.status IN ('ONGOING', 'COMPLETED')`;
// id, image_key and status feed the effective imageKey and the JS-computed phase; the SQL holds
// no time function (Requirement 17.6; a guard test enforces it), phase is computed in JS from these.
const TOURNAMENT_COLUMNS = `t.id, t.slug, t.name, t.starts_on::text AS "startsOn", t.ends_on::text AS "endsOn",
  t.status, t.venue, t.description, t.image_key AS "imageKey"`;
// Shared match columns. `extra` adds endpoint-specific columns (the sport read also returns the
// tournament name and slug). `status` and `scheduledAt` feed the JS-computed phase; no SQL time function.
const matchSelect = (extra = '') => `
  SELECT m.id, ts.tournament_id AS "tournamentId", ts.sport, m.kind, m.stage, m.status,
         to_json(m.scheduled_at) #>> '{}' AS "scheduledAt", m.venue, m.last_seq AS seq,
         json_build_array(json_build_object('name', a.label), json_build_object('name', b.label)) AS sides${extra}
  FROM matches m
  JOIN tournament_sports ts ON ts.id = m.tournament_sport_id
  JOIN tournaments t ON t.id = ts.tournament_id AND ${PUBLIC_TOURNAMENT}
  LEFT JOIN teams a ON a.id = m.side_a_team_id
  LEFT JOIN teams b ON b.id = m.side_b_team_id
  WHERE true`;
const MATCH_SELECT = matchSelect();

// Public reads take no auth and use the cached pool only.
const cached = (c, fn) => withClient(c.env.HYPERDRIVE_CACHED, c.executionCtx, fn);

async function latestSnapshot(client, matchId) {
  const { rows } = await client.query('SELECT data FROM match_snapshots WHERE match_id = $1', [matchId]);
  return rows[0]?.data ?? null;
}

// Add the effective imageKey and the Worker_Time Tournament_Phase.
const withTournamentPhase = (t) => ({
  ...t,
  imageKey: effectiveImageKey(t.id, t.imageKey),
  phase: tournamentPhase(t, Date.now()),
});

// Add the Worker_Time Match_Phase.
const withMatchPhase = (m) => ({
  ...m,
  phase: matchPhase({ status: m.status, scheduledAt: m.scheduledAt ? Date.parse(m.scheduledAt) : null }, Date.now()),
});

export const publicRoutes = new Hono();

publicRoutes.get('/tournaments', async (c) => {
  const { rows } = await cached(c, (client) =>
    client.query(
      `SELECT ${TOURNAMENT_COLUMNS} FROM tournaments t WHERE ${PUBLIC_TOURNAMENT}
       ORDER BY t.starts_on DESC NULLS LAST, t.id`,
    ),
  );
  return c.json({ tournaments: rows.map((t) => toPublic('tournament', withTournamentPhase(t))) });
});

publicRoutes.get('/tournaments/:key', async (c) => {
  const key = c.req.param('key');
  const byId = parseId(key);
  if (!byId && !SLUG_PATTERN.test(key)) throw new AppError(400, 'BAD_REQUEST', 'Malformed key');
  const tournament = await cached(c, async (client) => {
    const { rows } = await client.query(
      `SELECT ${TOURNAMENT_COLUMNS},
         COALESCE((SELECT json_agg(ts.sport ORDER BY ts.sport) FROM tournament_sports ts
                   WHERE ts.tournament_id = t.id), '[]') AS sports
       FROM tournaments t WHERE ${PUBLIC_TOURNAMENT} AND ${byId ? 't.id = $1' : 't.slug = $1'}`,
      [byId ?? key],
    );
    if (!rows[0]) return null;
    const matches = await client.query(
      `${MATCH_SELECT} AND ts.tournament_id = $1 ORDER BY m.scheduled_at NULLS LAST, m.id`,
      [rows[0].id],
    );
    return { ...rows[0], matches: matches.rows };
  });
  if (!tournament) throw notFound('Tournament');
  return c.json({
    tournament: toPublic('tournament', {
      ...withTournamentPhase(tournament),
      matches: tournament.matches.map(withMatchPhase),
    }),
  });
});

publicRoutes.get('/sports/:sport/matches', async (c) => {
  const sport = c.req.param('sport');
  if (!SPORTS.has(sport)) throw notFound('Sport');
  const { rows } = await cached(c, (client) =>
    client.query(
      `${matchSelect(`,
         t.name AS "tournamentName", t.slug AS "tournamentSlug"`)}
       AND ts.sport = $1 ORDER BY m.scheduled_at NULLS LAST, m.id`,
      [sport],
    ),
  );
  return c.json({ matches: rows.map((m) => toPublic('match', withMatchPhase(m))) });
});

publicRoutes.get('/matches/:id', async (c) => {
  const id = idParam(c);
  const match = await cached(c, async (client) => {
    const { rows } = await client.query(`${MATCH_SELECT} AND m.id = $1`, [id]);
    return rows[0] ? { ...rows[0], snapshot: await latestSnapshot(client, id) } : null;
  });
  if (!match) throw notFound('Match');
  return c.json({ match: toPublic('match', withMatchPhase(match)) });
});
