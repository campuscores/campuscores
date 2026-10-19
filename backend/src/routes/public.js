import { Hono } from 'hono';
import { withClient } from '../db.js';
import { AppError, toPublic } from '../http.js';

// Same form as Live_Room match IDs: positive, no leading zero, fits bigint.
export const ID_PATTERN = /^[1-9][0-9]{0,17}$/;
export const parseId = (s) => (typeof s === 'string' && ID_PATTERN.test(s) ? s : null);

export function idParam(c) {
  const id = parseId(c.req.param('id'));
  if (!id) throw new AppError(400, 'BAD_REQUEST', 'Malformed ID');
  return id;
}

const notFound = (what) => new AppError(404, 'NOT_FOUND', `${what} not found`);

// Dates go out as text: pg would parse them into Date objects, which the allow-list drops.
// shortcut: DRAFT tournaments and CUSTOM matches stay private while the lifecycle and custom-match
// visibility questions in doc/memory.md are open; widen these filters once they are decided.
const PUBLIC_TOURNAMENT = `t.status <> 'DRAFT'`;
const TOURNAMENT_COLUMNS = `t.id, t.slug, t.name, t.starts_on::text AS "startsOn", t.ends_on::text AS "endsOn",
  t.status, t.venue, t.description`;
const MATCH_SELECT = `
  SELECT m.id, ts.tournament_id AS "tournamentId", ts.sport, m.kind, m.stage, m.status,
         to_json(m.scheduled_at) #>> '{}' AS "scheduledAt", m.venue, m.last_seq AS seq,
         json_build_array(json_build_object('name', a.label), json_build_object('name', b.label)) AS sides
  FROM matches m
  JOIN tournament_sports ts ON ts.id = m.tournament_sport_id
  JOIN tournaments t ON t.id = ts.tournament_id AND ${PUBLIC_TOURNAMENT}
  LEFT JOIN teams a ON a.id = m.side_a_team_id
  LEFT JOIN teams b ON b.id = m.side_b_team_id
  WHERE m.kind <> 'CUSTOM'`;

// Public reads take no auth and use the cached pool only.
const cached = (c, fn) => withClient(c.env.HYPERDRIVE_CACHED, c.executionCtx, fn);

async function latestSnapshot(client, matchId) {
  const { rows } = await client.query('SELECT data FROM match_snapshots WHERE match_id = $1', [matchId]);
  return rows[0]?.data ?? null;
}

export const publicRoutes = new Hono();

publicRoutes.get('/tournaments', async (c) => {
  const { rows } = await cached(c, (client) =>
    client.query(
      `SELECT ${TOURNAMENT_COLUMNS} FROM tournaments t WHERE ${PUBLIC_TOURNAMENT}
       ORDER BY t.starts_on DESC NULLS LAST, t.id`,
    ),
  );
  return c.json({ tournaments: rows.map((t) => toPublic('tournament', t)) });
});

publicRoutes.get('/tournaments/:id', async (c) => {
  const id = idParam(c);
  const tournament = await cached(c, async (client) => {
    const { rows } = await client.query(
      `SELECT ${TOURNAMENT_COLUMNS},
         COALESCE((SELECT json_agg(ts.sport ORDER BY ts.sport) FROM tournament_sports ts
                   WHERE ts.tournament_id = t.id), '[]') AS sports
       FROM tournaments t WHERE ${PUBLIC_TOURNAMENT} AND t.id = $1`,
      [id],
    );
    if (!rows[0]) return null;
    const matches = await client.query(
      `${MATCH_SELECT} AND ts.tournament_id = $1 ORDER BY m.scheduled_at NULLS LAST, m.id`,
      [id],
    );
    return { ...rows[0], matches: matches.rows };
  });
  if (!tournament) throw notFound('Tournament');
  return c.json({ tournament: toPublic('tournament', tournament) });
});

publicRoutes.get('/matches/:id', async (c) => {
  const id = idParam(c);
  const match = await cached(c, async (client) => {
    const { rows } = await client.query(`${MATCH_SELECT} AND m.id = $1`, [id]);
    return rows[0] ? { ...rows[0], snapshot: await latestSnapshot(client, id) } : null;
  });
  if (!match) throw notFound('Match');
  return c.json({ match: toPublic('match', match) });
});
