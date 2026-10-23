// Tournament_Manager and Super_Admin console API (Requirements 3, 5, 8, 9, 15.11, 16).
// Every mutation follows the design "Architecture" check order on one uncached withTx:
//   1 clerkAuth → 2 requireRole('manager') → 3 parse + validate → 4 lock+load the target (404)
//   → 5 requireScope (403 SCOPE_FORBIDDEN) → 6 state rules (409) → 7 write + one Audit_Row.
// Lock order (Requirement 15.11): match rows first, then the tournament row.
// Later tasks append the sport, team and match handlers to this file; shared helpers stay here,
// one handler per route, grouped by section.
import { Hono } from 'hono';
import { DEFAULT_FORMATS, validateFormat } from '../../../shared/scoring.mjs';
import { EVENT_TIME_ZONE, istDate, istToUtc, matchPhase, needsScorer } from '../../../shared/time.mjs';
import { canAccess, clerkAuth, loadAccount, requireRole } from '../auth.js';
import { audit, withClient, withTx } from '../db.js';
import { AppError, jsonBody } from '../http.js';
import { requireScope, scopeFilter } from '../scope.js';
import { dateText, email, formatChanged, isLocked, matchFlags, slugify, statusChange, teamYear, text, timeText, validatePlayers } from '../validate.js';

// --- shared helpers ------------------------------------------------------

// Every manager write runs on the uncached pool so a disable or scope change is seen at once.
const uncached = (c, fn) => withClient(c.env.HYPERDRIVE_UNCACHED, c.executionCtx, fn);

const ZONE = EVENT_TIME_ZONE.name;
const notFound = (what) => new AppError(404, 'NOT_FOUND', `${what} not found`);
// A Completed/Archived tournament refuses every change but a status change (Requirement 9.11).
const locked = () => new AppError(409, 'TOURNAMENT_LOCKED', 'This tournament is locked and cannot be edited.');

/**
 * Deletes the matches that `matchSql` selects (a `SELECT m.id FROM matches m ...` with `params`) and every row that
 * references them, children first: outbox events, snapshots, score actions, scorer leases and assignments. The caller
 * already holds the match row locks (FOR UPDATE). Returns the deleted assignments result and the deleted match IDs.
 */
async function deleteMatchRows(tx, matchSql, params) {
  const ids = `(${matchSql})`;
  await tx.query(`DELETE FROM outbox_events WHERE match_id IN ${ids}`, params);
  await tx.query(`DELETE FROM match_snapshots WHERE match_id IN ${ids}`, params);
  await tx.query(`DELETE FROM score_actions WHERE match_id IN ${ids}`, params); // one statement, so Undo links check at its end
  await tx.query(`DELETE FROM scorer_leases WHERE match_id IN ${ids}`, params);
  const assignments = await tx.query(`DELETE FROM match_operator_assignments WHERE match_id IN ${ids}`, params);
  const { rows } = await tx.query(`DELETE FROM matches WHERE id IN ${ids} RETURNING id::text AS id`, params);
  return { assignments, matchIds: rows.map((r) => r.id) };
}

// After a committed delete, the home Live_Room stops showing the deleted matches' live and final cards. Best effort:
// the delete already succeeded, and a failure only leaves a card until the room's next change for that match.
const dropHomeCards = (c, matchIds) => {
  if (!matchIds.length || !c.env.ROOMS) return;
  const home = c.env.ROOMS.get(c.env.ROOMS.idFromName('home'));
  c.executionCtx.waitUntil(home.removeCards(matchIds).catch(() => {}));
};

// Tournament-level scope predicate for a plain `tournaments t` list (no joined tournament_sports):
// owned by the caller, or has at least one sport the caller manages. Super_Admin: no restriction.
// `startIndex` is the first free placeholder; returns the SQL fragment and the params it adds.
function tournamentScope(account, tAlias, startIndex) {
  if (account.role === 'SUPER_ADMIN') return { text: 'true', params: [] };
  if (account.role !== 'TOURNAMENT_MANAGER') return { text: 'false', params: [] };
  const p = `$${startIndex}`;
  return {
    text: `(${tAlias}.owner_account_id = ${p}
      OR EXISTS (SELECT 1 FROM tournament_sports ts2 JOIN tournament_sport_managers sm2 ON sm2.tournament_sport_id = ts2.id
                 WHERE ts2.tournament_id = ${tAlias}.id AND sm2.account_id = ${p}))`,
    params: [account.id],
  };
}

// Tournament columns for a staff response (dates as text; the effective photograph key).
// image_key NULL falls back to the Venue_Library key chosen by tournament id (Requirement 9.14).
const VENUE_KEYS = ['field', 'stadium', 'court', 'tennis', 'track'];
const TOURNAMENT_COLUMNS = `t.id::text AS id, t.slug, t.name, t.status,
  t.starts_on::text AS "startsOn", t.ends_on::text AS "endsOn", t.venue, t.description,
  COALESCE(t.image_key, ($KEYS::text[])[((t.id - 1) % 5) + 1]) AS "imageKey", t.owner_account_id::text AS "ownerId"`;

// A tournament DTO for the client: drops ownerId, adds isOwner for the caller.
const toTournament = (row, account) => {
  const { ownerId, ...rest } = row;
  return { tournament: rest, isOwner: account.role === 'SUPER_ADMIN' || String(ownerId) === String(account.id), ownerId };
};

// A one-line score for a staff match row from its stored snapshot, or null before any score.
function scoreText(snapshot) {
  const sides = snapshot?.sides;
  if (!Array.isArray(sides) || sides.length !== 2) return null;
  return `${sides[0].points}\u2013${sides[1].points}`; // en dash between the two side totals
}

// Build a staff match row (design "Staff match row") from a joined query row and the caller's clock.
// `now` is database time in ms. Flags are set by the caller because they need scope facts.
function staffMatchRow(r, now) {
  const scheduledAt = r.scheduledAt;
  const ms = scheduledAt ? Date.parse(scheduledAt) : null;
  const phase = matchPhase({ status: r.status, scheduledAt: ms }, now);
  const label = phase === 'live' ? 'Live' : phase === 'upcoming' ? 'Scheduled' : r.status === 'SCHEDULED' ? 'Not scored' : 'Final';
  const ist = ms != null ? new Date(ms + EVENT_TIME_ZONE.offsetMinutes * 60000).toISOString() : null;
  const date = ist ? ist.slice(0, 10) : null;
  const time = ist ? ist.slice(11, 16) : null;
  return {
    id: String(r.id),
    tournament: { slug: r.tournamentSlug, name: r.tournamentName, status: r.tournamentStatus },
    sport: r.sport,
    kind: r.kind,
    stage: r.stage,
    status: r.status,
    phase,
    label,
    scheduledAt,
    date,
    time,
    when: time ? `${time} ${EVENT_TIME_ZONE.label}` : '',
    venue: r.venue,
    sides: r.sides,
    score: r.snapshot ? scoreText(r.snapshot) : null,
    scorer: r.scorerEmail ? { name: r.scorerName, email: r.scorerEmail } : null,
    assignmentId: r.assignmentId ? String(r.assignmentId) : null,
    hasActions: Boolean(r.hasActions),
  };
}

// Insert a Draft tournament, retrying the slug on a unique violation up to three times
// (Requirement 9.6). Each attempt derives the next free slug from the current rows.
async function insertTournamentWithSlug(tx, base, values) {
  for (let attempt = 0; ; attempt += 1) {
    const { rows } = await tx.query('SELECT slug FROM tournaments WHERE slug = $1 OR slug LIKE $2', [base, `${base}-%`]);
    const taken = new Set(rows.map((row) => row.slug));
    let slug = base;
    for (let n = 2; taken.has(slug) || slug === 'new'; n += 1) slug = `${base}-${n}`;
    try {
      const { rows: [created] } = await tx.query(
        `INSERT INTO tournaments AS t (slug, name, starts_on, ends_on, venue, description, status, owner_account_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', $7)
         RETURNING ${TOURNAMENT_COLUMNS.replace('$KEYS', '$8')}`,
        [slug, values.name, values.startsOn, values.endsOn, values.venue, values.description, values.ownerId, VENUE_KEYS],
      );
      return created;
    } catch (err) {
      if (err.code === '23505' && attempt < 2) continue; // a concurrent insert took this slug; try again
      throw err;
    }
  }
}

// First incomplete Guided_Setup step for a Draft tournament (Requirement 9.3), or null when complete.
// counts: { sports, sportsWithoutTeam, matches }. Sports → no Tournament_Sport; teams → a sport has no
// Side_Record; matches → no match; otherwise scorers. A non-Draft tournament has no next step.
function nextSetupStep(status, counts) {
  if (status !== 'DRAFT') return null;
  if (counts.sports === 0) return 'sports';
  if (counts.sportsWithoutTeam > 0) return 'teams';
  if (counts.matches === 0) return 'matches';
  return 'scorers';
}

export const manageRoutes = new Hono();
const guard = [clerkAuth, loadAccount, requireRole('manager')];

// --- GET /api/manage/home ------------------------------------------------
// Two SQL statements, both on the uncached pool with database now() (a staff read).
// Statement 1: in-scope matches from today to today+6 India_Time, plus now(); JS groups today and the
// needs-a-scorer window. Statement 2: in-scope tournaments with their sports, plus the pending
// invitation count for a Super_Admin. Groups are capped at 50 rows with a total (Requirement 8.4).
manageRoutes.get('/manage/home', ...guard, async (c) => {
  const account = c.get('account');
  const scope = scopeFilter(account, 't', 'ts', 1);
  const scopeWhere = scope.text ? `AND ${scope.text}` : '';

  const home = await uncached(c, async (client) => {
    // Statement 1: candidate matches (today through today + 6 India_Time), newest side labels and scorer.
    const matchesSql = `
      WITH clock AS (SELECT now() AS now)
      SELECT m.id, ts.sport, m.kind, m.stage, m.status,
             to_json(m.scheduled_at) #>> '{}' AS "scheduledAt", m.venue,
             t.slug AS "tournamentSlug", t.name AS "tournamentName", t.status AS "tournamentStatus",
             t.owner_account_id::text AS "ownerId", ts.id::text AS "tournamentSportId",
             json_build_array(
               json_build_object('id', ta.id::text, 'name', ta.label),
               json_build_object('id', tb.id::text, 'name', tb.label)) AS sides,
             a.id::text AS "assignmentId", acc.name AS "scorerName", acc.email AS "scorerEmail",
             s.data AS snapshot,
             EXISTS (SELECT 1 FROM score_actions sa WHERE sa.match_id = m.id) AS "hasActions",
             (a.id IS NOT NULL) AS "hasActiveAssignment"
      FROM matches m
      JOIN tournament_sports ts ON ts.id = m.tournament_sport_id
      JOIN tournaments t ON t.id = ts.tournament_id
      LEFT JOIN teams ta ON ta.id = m.side_a_team_id
      LEFT JOIN teams tb ON tb.id = m.side_b_team_id
      LEFT JOIN match_operator_assignments a ON a.match_id = m.id AND a.status = 'ACTIVE'
      LEFT JOIN admin_accounts acc ON acc.id = a.account_id
      LEFT JOIN match_snapshots s ON s.match_id = m.id
      CROSS JOIN clock
      WHERE m.scheduled_at IS NOT NULL
        AND (m.scheduled_at AT TIME ZONE $${scope.params.length + 1}::text)::date
            BETWEEN (clock.now AT TIME ZONE $${scope.params.length + 1}::text)::date
                AND (clock.now AT TIME ZONE $${scope.params.length + 1}::text)::date + 6
        ${scopeWhere}
      ORDER BY m.scheduled_at, m.id`;
    const { rows: matchRows } = await client.query(matchesSql, [...scope.params, ZONE]);

    // Statement 2: one row carrying database now() (the authoritative staff clock), the in-scope
    // tournaments as a json array, and the pending-invite count for a Super_Admin. Folding the list
    // into one aggregated row keeps the clock available even when the caller has no tournament.
    // The outer list uses the tournament-level predicate; the sports sub-aggregate uses the
    // sport-level filter so a Sport_Manager sees only the sports they manage (Requirement 8.1).
    const tScope = tournamentScope(account, 't', 1);
    const sScope = scopeFilter(account, 't', 'ts', tScope.params.length + 1);
    const keysIndex = tScope.params.length + sScope.params.length + 1;
    const roleIndex = keysIndex + 1;
    const tournamentsSql = `
      SELECT (extract(epoch FROM now()) * 1000)::bigint AS now,
             COALESCE((
               SELECT json_agg(tr ORDER BY tr."startsOn" NULLS LAST, tr.name, (tr.id)::bigint)
               FROM (
                 SELECT ${TOURNAMENT_COLUMNS.replace('$KEYS', `$${keysIndex}`)},
                        COALESCE((SELECT json_agg(ts.sport ORDER BY ts.sport)
                                  FROM tournament_sports ts
                                  WHERE ts.tournament_id = t.id
                                    ${sScope.text ? `AND ${sScope.text}` : ''}), '[]') AS sports
                 FROM tournaments t
                 WHERE ${tScope.text}
               ) tr
             ), '[]') AS tournaments,
             CASE WHEN $${roleIndex} = 'SUPER_ADMIN'
               THEN (SELECT count(*) FROM staff_invitations i
                     WHERE i.status = 'PENDING' AND i.expires_at > now())
               ELSE NULL END::int AS "pendingInvitations"`;
    const { rows: [summary] } = await client.query(tournamentsSql, [...tScope.params, ...sScope.params, VENUE_KEYS, account.role]);

    // Database now() from statement 2 is authoritative; statement 1 may return no rows.
    const now = Number(summary.now);
    const pendingInvitations = summary.pendingInvitations ?? null;
    const tournaments = (summary.tournaments ?? []).map(({ id, slug, name, status, startsOn, endsOn, venue, description, imageKey, ownerId, sports }) => ({
      id, slug, name, status, startsOn, endsOn, venue, description, imageKey, sports,
      isOwner: account.role === 'SUPER_ADMIN' || String(ownerId) === String(account.id),
    }));

    return { now, matchRows, tournaments, pendingInvitations };
  });

  const { now, matchRows } = home;
  const today = istDate(now);
  // Today's matches, grouped by phase/status; each group capped at 50 with its full total.
  const groups = { live: [], scheduled: [], final: [], notScored: [] };
  const scorer = [];
  for (const r of matchRows) {
    const row = staffMatchRow(r, now);
    // The row flags a caller can act on: in scope (home is already scoped), not past.
    row.canAssign = row.phase !== 'past';
    const ms = row.scheduledAt ? Date.parse(row.scheduledAt) : null;
    if (ms != null && istDate(ms) === today) {
      const bucket = row.phase === 'live' ? 'live' : row.phase === 'upcoming' ? 'scheduled' : row.status === 'SCHEDULED' ? 'notScored' : 'final';
      groups[bucket].push(row);
    }
    if (needsScorer({ status: r.status, scheduledAt: ms, hasActiveAssignment: r.hasActiveAssignment }, now)) scorer.push(row);
  }
  const cap = (items) => ({ items: items.slice(0, 50), total: items.length });
  const todayMatches = { live: cap(groups.live), scheduled: cap(groups.scheduled), final: cap(groups.final), notScored: cap(groups.notScored) };
  const body = { today, tournaments: home.tournaments, todayMatches, needsScorer: cap(scorer) };
  if (account.role === 'SUPER_ADMIN') body.pendingInvitations = home.pendingInvitations ?? 0;
  return c.json(body);
});

// --- GET /api/manage/tournaments -----------------------------------------
// Tournaments in the caller's scope, sorted by start date then name (Requirement 8.1 order).
// Owner rows (every row for a Super_Admin) also carry `owner: { accountId, name, email }` and
// `sportManagers: [{ sport, accountId, name, email }]` (Requirement 16.1); a row the caller sees only as a
// Sport_Manager carries neither. Both come from correlated subqueries in the same statement (no N+1).
manageRoutes.get('/manage/tournaments', ...guard, async (c) => {
  const account = c.get('account');
  const tScope = tournamentScope(account, 't', 1);
  const sScope = scopeFilter(account, 't', 'ts', tScope.params.length + 1);
  const keysIndex = tScope.params.length + sScope.params.length + 1;
  const ownerIndex = keysIndex + 1;
  // NULL owner parameter = Super_Admin, who is the owner of every row.
  const ownerRow = `($${ownerIndex}::bigint IS NULL OR t.owner_account_id = $${ownerIndex}::bigint)`;
  const { rows } = await uncached(c, (client) =>
    client.query(
      `SELECT ${TOURNAMENT_COLUMNS.replace('$KEYS', `$${keysIndex}`)},
              COALESCE((SELECT json_agg(ts.sport ORDER BY ts.sport)
                        FROM tournament_sports ts
                        WHERE ts.tournament_id = t.id
                          ${sScope.text ? `AND ${sScope.text}` : ''}), '[]') AS sports,
              CASE WHEN ${ownerRow} THEN
                (SELECT json_build_object('accountId', o.id::text, 'name', o.name, 'email', o.email)
                 FROM admin_accounts o WHERE o.id = t.owner_account_id) END AS owner,
              CASE WHEN ${ownerRow} THEN
                COALESCE((SELECT json_agg(json_build_object('sport', ts.sport, 'accountId', sm.account_id::text, 'name', ma.name, 'email', ma.email)
                                          ORDER BY ts.sport, sm.account_id)
                          FROM tournament_sports ts
                          JOIN tournament_sport_managers sm ON sm.tournament_sport_id = ts.id
                          JOIN admin_accounts ma ON ma.id = sm.account_id
                          WHERE ts.tournament_id = t.id), '[]') END AS "sportManagers"
       FROM tournaments t
       WHERE ${tScope.text}
       ORDER BY t.starts_on NULLS LAST, t.name, t.id`,
      [...tScope.params, ...sScope.params, VENUE_KEYS, account.role === 'SUPER_ADMIN' ? null : account.id],
    ),
  );
  const tournaments = rows.map((row) => {
    const { ownerId, owner, sportManagers, ...rest } = row;
    const isOwner = account.role === 'SUPER_ADMIN' || String(ownerId) === String(account.id);
    return isOwner ? { ...rest, isOwner, owner, sportManagers } : { ...rest, isOwner };
  });
  return c.json({ tournaments });
});

// --- POST /api/manage/tournaments ----------------------------------------
// Any manager creates a Draft; the caller becomes owner. Slug from the name with a 23505 retry.
manageRoutes.post('/manage/tournaments', ...guard, async (c) => {
  const account = c.get('account');
  const requestId = c.get('requestId');
  const body = await jsonBody(c);
  // Step 3: validate before any lock; names the first invalid field.
  const name = text(body.name, 'name', 120, { required: true, what: 'a tournament name' });
  const startsOn = dateText(body.startsOn, 'startDate', { what: 'a start date' });
  const endsOn = body.endsOn == null || body.endsOn === '' ? startsOn : dateText(body.endsOn, 'endDate', { what: 'an end date' });
  if (endsOn < startsOn) throw new AppError(400, 'BAD_REQUEST', 'endDate: Enter an end date on or after the start date.');
  const venue = text(body.venue, 'venue', 200, { what: 'a venue' }) || null;
  const description = text(body.description, 'description', 1000, { what: 'a description' }) || null;

  const created = await uncached(c, (client) =>
    withTx(client, async (tx) => {
      // Lock the caller's account FOR SHARE and re-check it, so a concurrent disable or demotion
      // (accounts.js lockAccount, FOR UPDATE) either commits first and is seen here, or waits and then
      // sees this tournament (OWNER_TRANSFER_REQUIRED). No other row is locked before it.
      const { rows: [self] } = await tx.query('SELECT role, status FROM admin_accounts WHERE id = $1 FOR SHARE', [account.id]);
      const access = canAccess(self ?? null, 'manager');
      if (!access.ok) throw new AppError(403, access.code, 'Not allowed');
      const base = slugify(name);
      const row = await insertTournamentWithSlug(tx, base, { name, startsOn, endsOn, venue, description, ownerId: account.id });
      await audit(tx, {
        actorId: account.id, action: 'TOURNAMENT_CREATED', entity: 'tournaments', entityId: String(row.id), requestId,
        after: { slug: row.slug, name, startsOn, endsOn },
      });
      return row;
    }),
  );
  return c.json(toTournament(created, account), 201);
});

// --- GET /api/manage/tournaments/:slug -----------------------------------
// One tournament in scope, with isOwner, the next Guided_Setup step and its sports (counts, format).
manageRoutes.get('/manage/tournaments/:slug', ...guard, async (c) => {
  const account = c.get('account');
  const slug = c.req.param('slug');
  const result = await uncached(c, (client) =>
    withTx(client, async (tx) => {
      const { rows: [row] } = await tx.query(
        `SELECT ${TOURNAMENT_COLUMNS.replace('$KEYS', '$2')} FROM tournaments t WHERE t.slug = $1`,
        [slug, VENUE_KEYS],
      );
      if (!row) throw notFound('Tournament');
      await requireScope(tx, account, { tournamentId: row.id });

      // Sport scope: a Sport_Manager sees only the sports they manage; owner/admin see all.
      const sportScope = scopeFilter(account, 't', 'ts', 2);
      const { rows: sports } = await tx.query(
        `SELECT ts.sport, ts.config, ts.config_version AS "configVersion",
                (SELECT count(*) FROM teams tm WHERE tm.tournament_sport_id = ts.id)::int AS "teamCount",
                (SELECT count(*) FROM matches mt WHERE mt.tournament_sport_id = ts.id)::int AS "matchCount",
                (SELECT count(*) FROM teams tm WHERE tm.tournament_sport_id = ts.id) = 0 AS "noTeam",
                COALESCE((SELECT json_agg(json_build_object('accountId', sm.account_id::text, 'name', ma.name, 'email', ma.email) ORDER BY sm.account_id)
                          FROM tournament_sport_managers sm JOIN admin_accounts ma ON ma.id = sm.account_id
                          WHERE sm.tournament_sport_id = ts.id), '[]') AS managers
         FROM tournament_sports ts JOIN tournaments t ON t.id = ts.tournament_id
         WHERE t.id = $1 ${sportScope.text ? `AND ${sportScope.text}` : ''}
         ORDER BY ts.sport`,
        [row.id, ...sportScope.params],
      );
      return { row, sports };
    }),
  );

  const { tournament, isOwner } = toTournament(result.row, account);
  const sports = result.sports.map((s) => ({
    sport: s.sport,
    defaultFormat: s.config?.format ?? DEFAULT_FORMATS[s.sport],
    configVersion: s.configVersion,
    teamCount: s.teamCount,
    matchCount: s.matchCount,
    managers: s.managers,
  }));
  const counts = {
    sports: result.sports.length,
    sportsWithoutTeam: result.sports.filter((s) => s.noTeam).length,
    matches: result.sports.reduce((sum, s) => sum + s.matchCount, 0),
  };
  const nextStep = nextSetupStep(tournament.status, counts);
  return c.json({ tournament, isOwner, nextStep, sports });
});

// --- PATCH /api/manage/tournaments/:slug ---------------------------------
// Edit tournament facts (owner scope). 409 TOURNAMENT_LOCKED when Completed/Archived;
// 409 DATES_EXCLUDE_MATCHES (with the count) when a date edit would leave a match outside the dates.
manageRoutes.patch('/manage/tournaments/:slug', ...guard, async (c) => {
  const account = c.get('account');
  const requestId = c.get('requestId');
  const slug = c.req.param('slug');
  const body = await jsonBody(c);

  const updated = await uncached(c, (client) =>
    withTx(client, async (tx) => {
      // Lock the tournament row for the edit (details edit locks the tournament only).
      const { rows: [current] } = await tx.query(
        `SELECT id, status, name, starts_on::text AS "startsOn", ends_on::text AS "endsOn", venue, description, image_key AS "imageKey"
         FROM tournaments WHERE slug = $1 FOR UPDATE`,
        [slug],
      );
      if (!current) throw notFound('Tournament');
      await requireScope(tx, account, { tournamentId: current.id });
      if (current.status === 'COMPLETED' || current.status === 'ARCHIVED') {
        throw new AppError(409, 'TOURNAMENT_LOCKED', 'This tournament is locked and cannot be edited.');
      }

      // Validate only the fields sent; keep the current value otherwise.
      const name = Object.hasOwn(body, 'name') ? text(body.name, 'name', 120, { required: true, what: 'a tournament name' }) : current.name;
      const startsOn = Object.hasOwn(body, 'startsOn') ? dateText(body.startsOn, 'startDate', { what: 'a start date' }) : current.startsOn;
      const endsOn = Object.hasOwn(body, 'endsOn')
        ? (body.endsOn == null || body.endsOn === '' ? startsOn : dateText(body.endsOn, 'endDate', { what: 'an end date' }))
        : current.endsOn;
      if (endsOn < startsOn) throw new AppError(400, 'BAD_REQUEST', 'endDate: Enter an end date on or after the start date.');
      const venue = Object.hasOwn(body, 'venue') ? text(body.venue, 'venue', 200, { what: 'a venue' }) || null : current.venue;
      const description = Object.hasOwn(body, 'description') ? text(body.description, 'description', 1000, { what: 'a description' }) || null : current.description;
      let imageKey = current.imageKey;
      if (Object.hasOwn(body, 'imageKey')) {
        imageKey = body.imageKey == null || body.imageKey === '' ? null : body.imageKey;
        if (imageKey != null && !VENUE_KEYS.includes(imageKey)) throw new AppError(400, 'BAD_REQUEST', 'imageKey: Choose a photograph or Automatic.');
      }

      // 409 when the new dates would exclude an existing match (Requirement 9.8).
      if (startsOn !== current.startsOn || endsOn !== current.endsOn) {
        const { rows: [{ outside }] } = await tx.query(
          `SELECT count(*)::int AS outside
           FROM matches m JOIN tournament_sports ts ON ts.id = m.tournament_sport_id
           WHERE ts.tournament_id = $1 AND m.scheduled_at IS NOT NULL
             AND (m.scheduled_at AT TIME ZONE $4::text)::date NOT BETWEEN $2::date AND $3::date`,
          [current.id, startsOn, endsOn, ZONE],
        );
        if (outside > 0) {
          throw new AppError(409, 'DATES_EXCLUDE_MATCHES', `${outside} ${outside === 1 ? 'match falls' : 'matches fall'} outside these dates. Move them first.`);
        }
      }

      const { rows: [row] } = await tx.query(
        `UPDATE tournaments AS t SET name = $2, starts_on = $3, ends_on = $4, venue = $5, description = $6, image_key = $7
         WHERE id = $1 RETURNING ${TOURNAMENT_COLUMNS.replace('$KEYS', '$8')}`,
        [current.id, name, startsOn, endsOn, venue, description, imageKey, VENUE_KEYS],
      );
      await audit(tx, {
        actorId: account.id, action: 'TOURNAMENT_UPDATED', entity: 'tournaments', entityId: String(current.id), requestId,
        before: { name: current.name, startsOn: current.startsOn, endsOn: current.endsOn, venue: current.venue, description: current.description, imageKey: current.imageKey },
        after: { name, startsOn, endsOn, venue, description, imageKey },
      });
      return row;
    }),
  );
  return c.json(toTournament(updated, account));
});

// --- POST /api/manage/tournaments/:slug/status ---------------------------
// Apply a Tournament_Status change (owner scope). statusChange returns the 409 code or null.
manageRoutes.post('/manage/tournaments/:slug/status', ...guard, async (c) => {
  const account = c.get('account');
  const requestId = c.get('requestId');
  const slug = c.req.param('slug');
  const body = await jsonBody(c);
  const to = text(body.status, 'status', 20, { required: true, what: 'a status' });
  const reason = text(body.reason, 'reason', 500, { what: 'a reason' }) || null;

  const updated = await uncached(c, (client) =>
    withTx(client, async (tx) => {
      const { rows: [current] } = await tx.query('SELECT id, status FROM tournaments WHERE slug = $1 FOR UPDATE', [slug]);
      if (!current) throw notFound('Tournament');
      await requireScope(tx, account, { tournamentId: current.id });

      // Counts the decision needs, read without locks under the tournament's own lock.
      const { rows: [counts] } = await tx.query(
        `SELECT (SELECT count(*) FROM tournament_sports ts WHERE ts.tournament_id = $1)::int AS "sportCount",
                (SELECT count(*) FROM matches m JOIN tournament_sports ts ON ts.id = m.tournament_sport_id
                 WHERE ts.tournament_id = $1 AND m.status = 'LIVE')::int AS "liveCount"`,
        [current.id],
      );
      const code = statusChange(current.status, to, counts);
      if (code) throw new AppError(409, code, `Cannot change status from ${current.status} to ${to}.`);

      const { rows: [row] } = await tx.query(
        `UPDATE tournaments AS t SET status = $2 WHERE id = $1 RETURNING ${TOURNAMENT_COLUMNS.replace('$KEYS', '$3')}`,
        [current.id, to, VENUE_KEYS],
      );
      await audit(tx, {
        actorId: account.id, action: 'TOURNAMENT_STATUS_CHANGED', entity: 'tournaments', entityId: String(current.id), requestId, reason,
        before: { status: current.status }, after: { status: to },
      });
      return row;
    }),
  );
  return c.json(toTournament(updated, account));
});

// --- DELETE /api/manage/tournaments/:slug --------------------------------
// Super Admin only, any status (Arnav, 24 October 2026); a non-Draft needs a reason (409 REASON_REQUIRED). Locks the
// tournament's matches in id order, then the tournament, removes the subtree with its score data in one transaction,
// returns the removed counts (Requirement 9.12/9.13) and then drops the deleted matches' home cards.
manageRoutes.delete('/manage/tournaments/:slug', ...guard, async (c) => {
  const account = c.get('account');
  // Only a Super Admin deletes tournaments and matches (Arnav, 24 October 2026).
  if (account.role !== 'SUPER_ADMIN') throw new AppError(403, 'ROLE_FORBIDDEN', 'Only a Super Admin can delete a tournament');
  const requestId = c.get('requestId');
  const slug = c.req.param('slug');
  // A DELETE body is optional; read the reason when one is sent.
  const parsed = await c.req.json().catch(() => null);
  const reason = text(parsed && typeof parsed === 'object' ? parsed.reason : '', 'reason', 500, { what: 'a reason' }) || null;

  const removed = await uncached(c, (client) =>
    withTx(client, async (tx) => {
      const { rows: [current] } = await tx.query('SELECT id, status FROM tournaments WHERE slug = $1', [slug]);
      if (!current) throw notFound('Tournament');
      // Lock order (Requirement 15.11): match rows first in id order, then the tournament row.
      await tx.query(
        `SELECT m.id FROM matches m JOIN tournament_sports ts ON ts.id = m.tournament_sport_id
         WHERE ts.tournament_id = $1 ORDER BY m.id FOR UPDATE OF m`,
        [current.id],
      );
      await tx.query('SELECT id FROM tournaments WHERE id = $1 FOR UPDATE', [current.id]);
      await requireScope(tx, account, { tournamentId: current.id });
      // Any status may be deleted (Arnav, 24 October 2026). A published tournament has public results, so it needs a reason.
      if (current.status !== 'DRAFT' && !reason) throw new AppError(409, 'REASON_REQUIRED', 'A reason is required to delete a published tournament');

      // Remove the subtree bottom-up, score data first (deleteMatchRows), then sports and the tournament.
      const sportIds = `(SELECT id FROM tournament_sports WHERE tournament_id = $1)`;
      const { assignments, matchIds } = await deleteMatchRows(tx, `SELECT m.id FROM matches m WHERE m.tournament_sport_id IN ${sportIds}`, [current.id]);
      const matches = { rowCount: matchIds.length };
      const sportManagers = await tx.query(`DELETE FROM tournament_sport_managers WHERE tournament_sport_id IN ${sportIds}`, [current.id]);
      const teams = await tx.query(`DELETE FROM teams WHERE tournament_sport_id IN ${sportIds}`, [current.id]);
      const sports = await tx.query('DELETE FROM tournament_sports WHERE tournament_id = $1', [current.id]);
      await tx.query('DELETE FROM tournaments WHERE id = $1', [current.id]);

      const counts = {
        sports: sports.rowCount,
        teams: teams.rowCount,
        matches: matches.rowCount,
        assignments: assignments.rowCount,
        sportManagers: sportManagers.rowCount,
      };
      await audit(tx, {
        actorId: account.id, action: 'TOURNAMENT_DELETED', entity: 'tournaments', entityId: String(current.id), requestId, reason,
        before: { slug, status: current.status }, after: counts,
      });
      return { counts, matchIds };
    }),
  );
  dropHomeCards(c, removed.matchIds);
  return c.json({ removed: removed.counts });
});

// --- Sports, Default_Format and Sport_Managers (task 7.2) ----------------
// Every handler follows the same check order as 7.1 on the uncached pool: lock+load the target
// (404), requireScope, state rules (409), then write + one Audit_Row. A Completed/Archived
// tournament refuses sport/format/manager changes with TOURNAMENT_LOCKED (Requirement 9.11).

// The six supported sport keys (Requirement 10.1); same set as the tournament_sports CHECK.
const SPORT_KEYS = new Set(Object.keys(DEFAULT_FORMATS));

// Every non-eligible sport-manager email returns this one 400, so it never reveals whether an
// account exists, its role or its status (Requirement 3.5, design single generic message).
const notEligible = () =>
  new AppError(400, 'MANAGER_NOT_ELIGIBLE', 'Enter the email of an active tournament manager who is not already on this sport.');

// --- POST /api/manage/tournaments/:slug/sports ---------------------------
// Add a Tournament_Sport (owner scope). 400 on an unknown key; 409 SPORT_EXISTS on a duplicate;
// 409 TOURNAMENT_LOCKED when Completed/Archived. The Official_Preset becomes the Default_Format.
manageRoutes.post('/manage/tournaments/:slug/sports', ...guard, async (c) => {
  const account = c.get('account');
  const requestId = c.get('requestId');
  const slug = c.req.param('slug');
  const body = await jsonBody(c);
  // Step 3: validate before any lock. A missing or non-supported key is a 400.
  const sport = text(body.sport, 'sport', 40, { required: true, what: 'a sport' });
  if (!SPORT_KEYS.has(sport)) throw new AppError(400, 'BAD_REQUEST', 'sport: Choose a supported sport.');

  const result = await uncached(c, (client) =>
    withTx(client, async (tx) => {
      const { rows: [current] } = await tx.query('SELECT id, status FROM tournaments WHERE slug = $1 FOR UPDATE', [slug]);
      if (!current) throw notFound('Tournament');
      await requireScope(tx, account, { tournamentId: current.id });
      if (isLocked(current.status)) throw locked();

      const format = DEFAULT_FORMATS[sport];
      let sportId;
      try {
        const { rows: [row] } = await tx.query(
          `INSERT INTO tournament_sports (tournament_id, sport, config, config_version)
           VALUES ($1, $2, $3, 1) RETURNING id`,
          [current.id, sport, { format }],
        );
        sportId = row.id;
      } catch (err) {
        if (err.code === '23505') throw new AppError(409, 'SPORT_EXISTS', 'This sport is already in the tournament.');
        throw err;
      }
      await audit(tx, {
        actorId: account.id, action: 'SPORT_ADDED', entity: 'tournament_sports', entityId: String(sportId), requestId,
        after: { tournamentId: String(current.id), sport },
      });
      return { sport, defaultFormat: format };
    }),
  );
  return c.json(result, 201);
});

// --- DELETE /api/manage/tournaments/:slug/sports/:sport ------------------
// Remove a Tournament_Sport with no match (owner scope). 409 SPORT_HAS_MATCHES when it has a match;
// 409 TOURNAMENT_LOCKED when Completed/Archived. Removes its Side_Records and Sport_Manager rows.
manageRoutes.delete('/manage/tournaments/:slug/sports/:sport', ...guard, async (c) => {
  const account = c.get('account');
  const requestId = c.get('requestId');
  const slug = c.req.param('slug');
  const sport = c.req.param('sport');

  const removed = await uncached(c, (client) =>
    withTx(client, async (tx) => {
      // Lock the tournament row, then resolve this sport within it.
      const { rows: [current] } = await tx.query('SELECT id, status FROM tournaments WHERE slug = $1 FOR UPDATE', [slug]);
      if (!current) throw notFound('Tournament');
      const { rows: [ts] } = await tx.query(
        'SELECT id FROM tournament_sports WHERE tournament_id = $1 AND sport = $2 FOR UPDATE',
        [current.id, sport],
      );
      if (!ts) throw notFound('Sport');
      await requireScope(tx, account, { tournamentId: current.id });
      if (isLocked(current.status)) throw locked();

      const { rows: [{ matchCount }] } = await tx.query(
        'SELECT count(*)::int AS "matchCount" FROM matches WHERE tournament_sport_id = $1',
        [ts.id],
      );
      if (matchCount > 0) throw new AppError(409, 'SPORT_HAS_MATCHES', 'This sport has matches. Remove them first.');

      const sportManagers = await tx.query('DELETE FROM tournament_sport_managers WHERE tournament_sport_id = $1', [ts.id]);
      const teams = await tx.query('DELETE FROM teams WHERE tournament_sport_id = $1', [ts.id]);
      await tx.query('DELETE FROM tournament_sports WHERE id = $1', [ts.id]);

      const counts = { teams: teams.rowCount, sportManagers: sportManagers.rowCount };
      await audit(tx, {
        actorId: account.id, action: 'SPORT_REMOVED', entity: 'tournament_sports', entityId: String(ts.id), requestId,
        before: { tournamentId: String(current.id), sport }, after: counts,
      });
      return counts;
    }),
  );
  return c.json({ removed });
});

// --- PUT /api/manage/tournaments/:slug/sports/:sport/format --------------
// Save a Default_Format (sport scope). validateFormat gives the 400 message; a format equal to the
// stored one is idempotent (no version bump, no audit — Property 11, Requirement 10.5); a changed
// format stores it and bumps config_version by 1. 409 TOURNAMENT_LOCKED when Completed/Archived.
manageRoutes.put('/manage/tournaments/:slug/sports/:sport/format', ...guard, async (c) => {
  const account = c.get('account');
  const requestId = c.get('requestId');
  const slug = c.req.param('slug');
  const sport = c.req.param('sport');
  const body = await jsonBody(c);
  // Step 3: validate the format before any lock; validateFormat throws its own message on a bad shape.
  let format;
  try {
    format = validateFormat(sport, body.format);
  } catch (err) {
    throw new AppError(400, 'BAD_REQUEST', `format: ${err.message}`);
  }

  const result = await uncached(c, (client) =>
    withTx(client, async (tx) => {
      const { rows: [current] } = await tx.query('SELECT id, status FROM tournaments WHERE slug = $1', [slug]);
      if (!current) throw notFound('Tournament');
      const { rows: [ts] } = await tx.query(
        'SELECT id, config, config_version AS "configVersion" FROM tournament_sports WHERE tournament_id = $1 AND sport = $2 FOR UPDATE',
        [current.id, sport],
      );
      if (!ts) throw notFound('Sport');
      await requireScope(tx, account, { tournamentSportId: ts.id });
      if (isLocked(current.status)) throw locked();

      const stored = ts.config?.format ?? DEFAULT_FORMATS[sport];
      if (!formatChanged(stored, format)) {
        // Idempotent: no write, no version bump, no Audit_Row.
        return { defaultFormat: stored, configVersion: ts.configVersion, changed: false };
      }

      const { rows: [row] } = await tx.query(
        `UPDATE tournament_sports SET config = $2, config_version = config_version + 1
         WHERE id = $1 RETURNING config_version AS "configVersion"`,
        [ts.id, { format }],
      );
      await audit(tx, {
        actorId: account.id, action: 'SPORT_FORMAT_CHANGED', entity: 'tournament_sports', entityId: String(ts.id), requestId,
        before: { format: stored, configVersion: ts.configVersion }, after: { format, configVersion: row.configVersion },
      });
      return { defaultFormat: format, configVersion: row.configVersion, changed: true };
    }),
  );
  return c.json(result);
});

// --- POST /api/manage/tournaments/:slug/sports/:sport/managers -----------
// Add a Sport_Manager by exact email (owner scope — Requirement 3.9, so tournament-level scope).
// The email must resolve to an ACTIVE TOURNAMENT_MANAGER who is neither the owner nor already on
// this sport; every other case returns the one generic 400 (Requirement 3.5). 409 TOURNAMENT_LOCKED
// when Completed/Archived.
manageRoutes.post('/manage/tournaments/:slug/sports/:sport/managers', ...guard, async (c) => {
  const account = c.get('account');
  const requestId = c.get('requestId');
  const slug = c.req.param('slug');
  const sport = c.req.param('sport');
  const body = await jsonBody(c);
  const wanted = email(body.email);

  const result = await uncached(c, (client) =>
    withTx(client, async (tx) => {
      const { rows: [current] } = await tx.query('SELECT id, status, owner_account_id AS "ownerId" FROM tournaments WHERE slug = $1 FOR UPDATE', [slug]);
      if (!current) throw notFound('Tournament');
      const { rows: [ts] } = await tx.query(
        'SELECT id FROM tournament_sports WHERE tournament_id = $1 AND sport = $2 FOR UPDATE',
        [current.id, sport],
      );
      if (!ts) throw notFound('Sport');
      // Only the owner (or Super_Admin) manages sport managers (Requirement 3.9): tournament scope.
      await requireScope(tx, account, { tournamentId: current.id });
      if (isLocked(current.status)) throw locked();

      // Resolve the email to an eligible account. Any non-eligible case → one generic 400.
      const { rows: [target] } = await tx.query(
        // FOR SHARE waits for a concurrent role change or disable, which deletes Sport_Manager rows.
        'SELECT id, name, email FROM admin_accounts WHERE email = $1 AND status = $2 AND role = $3 FOR SHARE',
        [wanted, 'ACTIVE', 'TOURNAMENT_MANAGER'],
      );
      if (!target) throw notEligible();
      if (String(target.id) === String(current.ownerId)) throw notEligible(); // the owner is already in scope

      const existing = await tx.query(
        'SELECT 1 FROM tournament_sport_managers WHERE tournament_sport_id = $1 AND account_id = $2',
        [ts.id, target.id],
      );
      if (existing.rowCount > 0) throw notEligible(); // already a Sport_Manager of this sport

      await tx.query(
        'INSERT INTO tournament_sport_managers (tournament_sport_id, account_id, added_by) VALUES ($1, $2, $3)',
        [ts.id, target.id, account.id],
      );
      await audit(tx, {
        actorId: account.id, action: 'SPORT_MANAGER_ADDED', entity: 'tournament_sports', entityId: String(ts.id), requestId,
        after: { sport, accountId: String(target.id) },
      });
      return { manager: { accountId: String(target.id), name: target.name, email: target.email } };
    }),
  );
  return c.json(result, 201);
});

// --- DELETE .../sports/:sport/managers/:accountId ------------------------
// Remove a Sport_Manager (owner scope). 404 when the sport or the Sport_Manager row is absent.
// The manager keeps every ACTIVE Assignment (Requirement 3.7). 409 TOURNAMENT_LOCKED when locked.
manageRoutes.delete('/manage/tournaments/:slug/sports/:sport/managers/:accountId', ...guard, async (c) => {
  const account = c.get('account');
  const requestId = c.get('requestId');
  const slug = c.req.param('slug');
  const sport = c.req.param('sport');
  const accountId = c.req.param('accountId');

  await uncached(c, (client) =>
    withTx(client, async (tx) => {
      const { rows: [current] } = await tx.query('SELECT id, status FROM tournaments WHERE slug = $1 FOR UPDATE', [slug]);
      if (!current) throw notFound('Tournament');
      const { rows: [ts] } = await tx.query(
        'SELECT id FROM tournament_sports WHERE tournament_id = $1 AND sport = $2 FOR UPDATE',
        [current.id, sport],
      );
      if (!ts) throw notFound('Sport');
      await requireScope(tx, account, { tournamentId: current.id });
      if (isLocked(current.status)) throw locked();

      const result = await tx.query(
        'DELETE FROM tournament_sport_managers WHERE tournament_sport_id = $1 AND account_id = $2',
        [ts.id, accountId],
      );
      if (result.rowCount === 0) throw notFound('Sport manager');
      await audit(tx, {
        actorId: account.id, action: 'SPORT_MANAGER_REMOVED', entity: 'tournament_sports', entityId: String(ts.id), requestId,
        before: { sport, accountId: String(accountId) },
      });
    }),
  );
  return c.json({ removed: true });
});

// --- Teams / Side_Records (task 7.3) -------------------------------------
// Side_Records are scoped to one Tournament_Sport (Requirement 11). Every handler follows the same
// check order as 7.1/7.2 on the uncached pool: lock+load the target (404), requireScope (sport
// scope), state rules (409), then write + one Audit_Row. A Completed/Archived tournament refuses
// team changes with TOURNAMENT_LOCKED (Requirement 9.11).
//
// Two independent per-team flags drive the UI and the state rules, both computed with database
// time so Not_Scored is authoritative (Requirement 15.12):
//   used   = at least one match references the Side_Record as side A or B (any status/phase).
//            A used Side_Record cannot be deleted → 409 TEAM_IN_USE (Requirement 11.8).
//   locked = at least one referencing match is Live, Final or Not_Scored (matchPhase 'live'/'past').
//            A locked Side_Record cannot be edited → 409 TEAM_IN_USE (Requirement 11.7/11.8).
// An Upcoming (SCHEDULED, before Match_Day_End) match marks a team used but not locked, so a manager
// may still edit its details until match day, and may not delete it while any match uses it.

// A team DTO for the client (Requirement 11 list shape). `label` is the stored name.
const toTeam = (row) => ({
  id: String(row.id),
  name: row.label,
  branch: row.branch ?? null,
  year: row.year ?? null,
  players: row.players ?? [],
  locked: Boolean(row.locked),
  used: Boolean(row.used),
});

// 409 raised when an edit targets a locked team or a delete targets a used team.
const teamInUse = (verb) =>
  new AppError(409, 'TEAM_IN_USE', `This team is used by a match and cannot be ${verb}.`);

// 409 raised on the teams_unique_name violation (case- and outer-space-insensitive).
const duplicateName = (name) =>
  new AppError(409, 'DUPLICATE_NAME', `A team named "${name}" already exists in this sport.`);

// Validate the optional Side_Record fields shared by create and edit. Names the first invalid field.
// Returns { branch, year, players } with branch/year null when absent.
function teamFields(sport, body) {
  const branch = Object.hasOwn(body, 'branch') ? text(body.branch, 'branch', 120, { what: 'a branch' }) || null : null;
  const year = Object.hasOwn(body, 'year') ? teamYear(body.year) : null;
  const players = validatePlayers(sport, body.players);
  return { branch, year, players };
}

// Load a Side_Record's current match usage under database `now()` and set its used/locked flags.
// Returns { used, locked }. One statement: the match rows that reference this team, newest first.
async function teamUsage(tx, teamId) {
  const { rows } = await tx.query(
    `SELECT m.status, to_json(m.scheduled_at) #>> '{}' AS "scheduledAt",
            (extract(epoch FROM now()) * 1000)::bigint AS now
     FROM matches m
     WHERE m.side_a_team_id = $1 OR m.side_b_team_id = $1`,
    [teamId],
  );
  if (rows.length === 0) return { used: false, locked: false };
  const now = Number(rows[0].now);
  let locked = false;
  for (const r of rows) {
    const ms = r.scheduledAt ? Date.parse(r.scheduledAt) : null;
    if (matchPhase({ status: r.status, scheduledAt: ms }, now) !== 'upcoming') locked = true;
  }
  return { used: true, locked };
}

// --- GET /api/manage/tournaments/:slug/sports/:sport/teams ---------------
// List the Side_Records of a Tournament_Sport (sport scope), each with its used/locked flags.
// Sorted by name key (case-insensitive), the order the UI shows.
manageRoutes.get('/manage/tournaments/:slug/sports/:sport/teams', ...guard, async (c) => {
  const account = c.get('account');
  const slug = c.req.param('slug');
  const sport = c.req.param('sport');

  const teams = await uncached(c, (client) =>
    withTx(client, async (tx) => {
      const { rows: [current] } = await tx.query('SELECT id FROM tournaments WHERE slug = $1', [slug]);
      if (!current) throw notFound('Tournament');
      const { rows: [ts] } = await tx.query(
        'SELECT id FROM tournament_sports WHERE tournament_id = $1 AND sport = $2',
        [current.id, sport],
      );
      if (!ts) throw notFound('Sport');
      await requireScope(tx, account, { tournamentSportId: ts.id });

      // Teams with their match usage in one statement: used = any referencing match; locked = any
      // referencing match that is Live, Final or Not_Scored (computed in JS from database now()).
      const { rows } = await tx.query(
        `SELECT tm.id, tm.label, tm.branch, tm.year, tm.players,
                (extract(epoch FROM now()) * 1000)::bigint AS now,
                COALESCE((
                  SELECT json_agg(json_build_object('status', m.status,
                                                     'scheduledAt', to_json(m.scheduled_at) #>> '{}'))
                  FROM matches m
                  WHERE m.side_a_team_id = tm.id OR m.side_b_team_id = tm.id), '[]') AS uses
         FROM teams tm
         WHERE tm.tournament_sport_id = $1
         ORDER BY lower(btrim(tm.label)), tm.id`,
        [ts.id],
      );
      return rows.map((row) => {
        const uses = row.uses ?? [];
        const now = Number(row.now);
        const used = uses.length > 0;
        const locked = uses.some((u) => matchPhase({ status: u.status, scheduledAt: u.scheduledAt ? Date.parse(u.scheduledAt) : null }, now) !== 'upcoming');
        return toTeam({ ...row, used, locked });
      });
    }),
  );
  return c.json({ teams });
});

// --- POST /api/manage/tournaments/:slug/sports/:sport/teams --------------
// Create a Side_Record (sport scope). 400 names the first invalid field; a duplicate name (case- and
// outer-space-insensitive) raises 23505 → 409 DUPLICATE_NAME. 409 TOURNAMENT_LOCKED when locked.
manageRoutes.post('/manage/tournaments/:slug/sports/:sport/teams', ...guard, async (c) => {
  const account = c.get('account');
  const requestId = c.get('requestId');
  const slug = c.req.param('slug');
  const sport = c.req.param('sport');
  const body = await jsonBody(c);
  // Step 3: validate before any lock; names the first invalid field.
  const name = text(body.name, 'name', 120, { required: true, what: 'a team name' });
  const { branch, year, players } = teamFields(sport, body);

  const created = await uncached(c, (client) =>
    withTx(client, async (tx) => {
      const { rows: [current] } = await tx.query('SELECT id, status FROM tournaments WHERE slug = $1 FOR UPDATE', [slug]);
      if (!current) throw notFound('Tournament');
      const { rows: [ts] } = await tx.query(
        'SELECT id FROM tournament_sports WHERE tournament_id = $1 AND sport = $2 FOR UPDATE',
        [current.id, sport],
      );
      if (!ts) throw notFound('Sport');
      await requireScope(tx, account, { tournamentSportId: ts.id });
      if (isLocked(current.status)) throw locked();

      let row;
      try {
        const inserted = await tx.query(
          `INSERT INTO teams (tournament_sport_id, label, branch, year, players)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, label, branch, year, players`,
          [ts.id, name, branch, year, JSON.stringify(players)],
        );
        row = inserted.rows[0];
      } catch (err) {
        if (err.code === '23505') throw duplicateName(name);
        throw err;
      }
      await audit(tx, {
        actorId: account.id, action: 'TEAM_CREATED', entity: 'teams', entityId: String(row.id), requestId,
        after: { tournamentSportId: String(ts.id), name, branch, year, players },
      });
      // A fresh team has no match, so it is neither used nor locked.
      return toTeam({ ...row, used: false, locked: false });
    }),
  );
  return c.json({ team: created }, 201);
});

// --- PATCH /api/manage/teams/:id -----------------------------------------
// Edit a Side_Record by id (sport scope). Resolve the team to its Tournament_Sport, lock it, check
// scope, then the state rules: 409 TOURNAMENT_LOCKED when the tournament is Completed/Archived; 409
// TEAM_IN_USE when the team is locked (used by a Live, Final or Not_Scored match — Requirement 11.7).
// A duplicate name raises 23505 → 409 DUPLICATE_NAME. Only the fields sent change.
manageRoutes.patch('/manage/teams/:id', ...guard, async (c) => {
  const account = c.get('account');
  const requestId = c.get('requestId');
  const id = c.req.param('id');
  if (!/^\d+$/.test(id)) throw new AppError(400, 'BAD_REQUEST', 'id: This team id is not valid.');
  const body = await jsonBody(c);

  const updated = await uncached(c, (client) =>
    withTx(client, async (tx) => {
      // Lock the team row, then resolve its tournament_sport and tournament for scope and lock state.
      const { rows: [team] } = await tx.query(
        `SELECT tm.id, tm.tournament_sport_id AS "tournamentSportId", tm.label, tm.branch, tm.year, tm.players,
                ts.sport, t.status AS "tournamentStatus"
         FROM teams tm
         JOIN tournament_sports ts ON ts.id = tm.tournament_sport_id
         JOIN tournaments t ON t.id = ts.tournament_id
         WHERE tm.id = $1 FOR UPDATE OF tm`,
        [id],
      );
      if (!team) throw notFound('Team');
      await requireScope(tx, account, { tournamentSportId: team.tournamentSportId });
      if (isLocked(team.tournamentStatus)) throw locked();

      // A locked team (used by a Live, Final or Not_Scored match) cannot be edited (Requirement 11.7).
      // One usage read drives both the lock check and the response flags; match usage cannot change
      // within this transaction after the team row lock.
      const usage = await teamUsage(tx, team.id);
      if (usage.locked) throw teamInUse('edited');

      // Validate only the fields sent; keep the current value otherwise.
      const name = Object.hasOwn(body, 'name') ? text(body.name, 'name', 120, { required: true, what: 'a team name' }) : team.label;
      const branch = Object.hasOwn(body, 'branch') ? (text(body.branch, 'branch', 120, { what: 'a branch' }) || null) : team.branch;
      const year = Object.hasOwn(body, 'year') ? teamYear(body.year) : team.year;
      const players = Object.hasOwn(body, 'players') ? validatePlayers(team.sport, body.players) : (team.players ?? []);

      let row;
      try {
        const result = await tx.query(
          `UPDATE teams SET label = $2, branch = $3, year = $4, players = $5
           WHERE id = $1 RETURNING id, label, branch, year, players`,
          [team.id, name, branch, year, JSON.stringify(players)],
        );
        row = result.rows[0];
      } catch (err) {
        if (err.code === '23505') throw duplicateName(name);
        throw err;
      }
      await audit(tx, {
        actorId: account.id, action: 'TEAM_UPDATED', entity: 'teams', entityId: String(team.id), requestId,
        before: { name: team.label, branch: team.branch, year: team.year, players: team.players ?? [] },
        after: { name, branch, year, players },
      });
      // The team was editable, so locked is false; used may be true (an Upcoming match references it).
      return toTeam({ ...row, used: usage.used, locked: usage.locked });
    }),
  );
  return c.json({ team: updated });
});

// --- DELETE /api/manage/teams/:id ----------------------------------------
// Remove a Side_Record by id (sport scope). 409 TOURNAMENT_LOCKED when the tournament is
// Completed/Archived; 409 TEAM_IN_USE when any match references the team (Requirement 11.8).
manageRoutes.delete('/manage/teams/:id', ...guard, async (c) => {
  const account = c.get('account');
  const requestId = c.get('requestId');
  const id = c.req.param('id');
  if (!/^\d+$/.test(id)) throw new AppError(400, 'BAD_REQUEST', 'id: This team id is not valid.');
  // A DELETE body is optional; read the reason when one is sent.
  const parsed = await c.req.json().catch(() => null);
  const reason = text(parsed && typeof parsed === 'object' ? parsed.reason : '', 'reason', 500, { what: 'a reason' }) || null;

  await uncached(c, (client) =>
    withTx(client, async (tx) => {
      const { rows: [team] } = await tx.query(
        `SELECT tm.id, tm.tournament_sport_id AS "tournamentSportId", tm.label, tm.branch, tm.year, tm.players,
                t.status AS "tournamentStatus"
         FROM teams tm
         JOIN tournament_sports ts ON ts.id = tm.tournament_sport_id
         JOIN tournaments t ON t.id = ts.tournament_id
         WHERE tm.id = $1 FOR UPDATE OF tm`,
        [id],
      );
      if (!team) throw notFound('Team');
      await requireScope(tx, account, { tournamentSportId: team.tournamentSportId });
      if (isLocked(team.tournamentStatus)) throw locked();

      // A team used by any match cannot be deleted (Requirement 11.8).
      const { used } = await teamUsage(tx, team.id);
      if (used) throw teamInUse('deleted');

      await tx.query('DELETE FROM teams WHERE id = $1', [team.id]);
      await audit(tx, {
        actorId: account.id, action: 'TEAM_DELETED', entity: 'teams', entityId: String(team.id), requestId, reason,
        before: { name: team.label, branch: team.branch, year: team.year, players: team.players ?? [] },
      });
    }),
  );
  return c.json({ removed: true });
});

// --- Matches (task 7.4) --------------------------------------------------
// A match belongs to one Tournament_Sport, so every match write is sport level (requireScope with
// tournamentSportId — design "Target resolution"). Each handler follows the same check order as
// 7.1-7.3 on the uncached pool: lock+load the target (404), requireScope, state rules (409), then
// write + one Audit_Row. Lock order (Requirement 15.11): the match row FOR UPDATE first, then the
// owning tournament FOR SHARE, the same order as assign, revoke and START.
//
// Match_Phase, the Not_Scored state and MATCH_CLOSED all use database now() (Requirement 15.12), so
// every statement that needs the clock selects now() in the same query and passes it to matchPhase.

// A BRACKET match (one with a stage) is unique per stage per Tournament_Sport (the matches_one_stage
// partial unique index). A duplicate stage raises 23505 → 409 STAGE_TAKEN.
const stageTaken = (stage) =>
  new AppError(409, 'STAGE_TAKEN', `The ${stage} stage is already scheduled for this sport.`);

// A Live, Final or Not_Scored match refuses an edit or a delete (Requirements 12.8, 12.10).
const matchClosed = () =>
  new AppError(409, 'MATCH_CLOSED', 'This match is no longer scheduled and cannot be changed.');

// The columns a staff match row needs, joined from one match row. `now` is database time in ms,
// selected by the caller so Match_Phase and Not_Scored use database time. `account` is the caller:
// a bound parameter decides holdsAssignment (the caller's own ACTIVE Assignment on the match).
// The SQL mirrors the Manager home statement 1 so staffMatchRow reads the same shape.
const MATCH_SELECT = `
  SELECT m.id, ts.sport, ts.id::text AS "tournamentSportId", m.kind, m.stage, m.status,
         to_json(m.scheduled_at) #>> '{}' AS "scheduledAt", m.venue,
         t.slug AS "tournamentSlug", t.name AS "tournamentName", t.status AS "tournamentStatus",
         json_build_array(
           json_build_object('id', ta.id::text, 'name', ta.label),
           json_build_object('id', tb.id::text, 'name', tb.label)) AS sides,
         a.id::text AS "assignmentId", acc.name AS "scorerName", acc.email AS "scorerEmail",
         (a.account_id = $ACCOUNT) AS "holdsAssignment",
         s.data AS snapshot,
         EXISTS (SELECT 1 FROM score_actions sa WHERE sa.match_id = m.id) AS "hasActions",
         (extract(epoch FROM now()) * 1000)::bigint AS now
  FROM matches m
  JOIN tournament_sports ts ON ts.id = m.tournament_sport_id
  JOIN tournaments t ON t.id = ts.tournament_id
  LEFT JOIN teams ta ON ta.id = m.side_a_team_id
  LEFT JOIN teams tb ON tb.id = m.side_b_team_id
  LEFT JOIN match_operator_assignments a ON a.match_id = m.id AND a.status = 'ACTIVE'
  LEFT JOIN admin_accounts acc ON acc.id = a.account_id
  LEFT JOIN match_snapshots s ON s.match_id = m.id`;

// Build the client row from a joined query row and attach the control flags. `now` is database time.
// inScope is true for every row a scoped read or a located match returns (scopeFilter/requireScope
// already restricted them); holdsAssignment and hasActions come from the query.
function matchRowWithFlags(r, now, account) {
  const row = staffMatchRow(r, now);
  const flags = matchFlags({
    phase: row.phase, status: r.status, tournamentStatus: r.tournamentStatus,
    inScope: true, holdsAssignment: Boolean(r.holdsAssignment), hasActions: Boolean(r.hasActions),
    superAdmin: account?.role === 'SUPER_ADMIN',
  });
  return { ...row, ...flags };
}

// Validate the match write body shared by create and edit. Returns { scheduledAt, stage, kind,
// sideA, sideB, venue } with sideA/sideB as team ids (string) or null. Needs the sport's team ids
// (to reject a side from another Tournament_Sport) and the tournament dates and today's India_Time
// date (to bound the India_Time date). Names the first invalid field (Requirement 12.3).
//   - date/time → India_Time → UTC via istToUtc; NaN → 400.
//   - a stage SF1/SF2/FINAL makes a BRACKET match; no stage makes a CUSTOM match.
//   - both sides required and different, except a FINAL may leave one or both empty.
//   - date ≥ today (India_Time) and within the tournament dates (inclusive).
function validateMatchFields(body, { teamIds, startsOn, endsOn, today, current }) {
  const has = (k) => Object.hasOwn(body, k);
  // Date and time: keep the current instant when neither is sent on an edit.
  const curIst = current?.scheduledAt != null ? ((ms) => ({ date: new Date(ms + EVENT_TIME_ZONE.offsetMinutes * 60000).toISOString().slice(0, 10), time: new Date(ms + EVENT_TIME_ZONE.offsetMinutes * 60000).toISOString().slice(11, 16) }))(current.scheduledAt) : null;
  const date = has('date') ? dateText(body.date, 'date', { what: 'a match date' }) : (curIst ? curIst.date : dateText(undefined, 'date', { what: 'a match date' }));
  const time = has('time') ? timeText(body.time, 'time', { what: 'a match time' }) : (curIst ? curIst.time : timeText(undefined, 'time', { what: 'a match time' }));
  const ms = istToUtc(date, time);
  if (Number.isNaN(ms)) throw new AppError(400, 'BAD_REQUEST', 'date: Enter a real match date and time.');
  if (date < today) throw new AppError(400, 'BAD_REQUEST', 'date: Enter a date that is today or later.');
  if (date < startsOn || date > endsOn) throw new AppError(400, 'BAD_REQUEST', 'date: Enter a date within the tournament dates.');

  // Stage: null (CUSTOM) or one of SF1/SF2/FINAL (BRACKET).
  let stage = has('stage') ? (body.stage == null || body.stage === '' ? null : text(body.stage, 'stage', 10, { what: 'a stage' })) : (current ? current.stage : null);
  if (stage != null && !['SF1', 'SF2', 'FINAL'].includes(stage)) throw new AppError(400, 'BAD_REQUEST', 'stage: Choose Match, SF1, SF2 or FINAL.');
  const kind = stage == null ? 'CUSTOM' : 'BRACKET';

  // Sides: team ids of this Tournament_Sport. A FINAL may leave one or both empty; every other match
  // needs both. The two sides must differ.
  const sideId = (value, field) => {
    if (value == null || value === '') return null;
    const id = String(value);
    if (!/^\d+$/.test(id) || !teamIds.has(id)) throw new AppError(400, 'BAD_REQUEST', `${field}: Choose a team from this sport.`);
    return id;
  };
  const sideA = has('sideA') ? sideId(body.sideA, 'sideA') : (current ? current.sideA : null);
  const sideB = has('sideB') ? sideId(body.sideB, 'sideB') : (current ? current.sideB : null);
  if (stage !== 'FINAL') {
    if (sideA == null) throw new AppError(400, 'BAD_REQUEST', 'sideA: Choose the first team.');
    if (sideB == null) throw new AppError(400, 'BAD_REQUEST', 'sideB: Choose the second team.');
  }
  if (sideA != null && sideB != null && sideA === sideB) throw new AppError(400, 'BAD_REQUEST', 'sideB: Choose two different teams.');

  const venue = has('venue') ? (text(body.venue, 'venue', 200, { what: 'a venue' }) || null) : (current ? current.venue : null);
  return { scheduledAt: new Date(ms).toISOString(), stage, kind, sideA, sideB, venue };
}

// --- GET /api/manage/matches ---------------------------------------------
// Every match in the caller's scope, capped at 500, sorted by scheduled time then id. Optional
// filters: tournament (slug), sport (key), date (India_Time date), phase (live|upcoming|past). Each row is
// a staff match row with its control flags (Requirement 14.1). A bad filter value is a 400.
manageRoutes.get('/manage/matches', ...guard, async (c) => {
  const account = c.get('account');
  const q = c.req.query();
  // Step 3: validate filters before the read; name the first invalid one.
  const tournament = q.tournament ? text(q.tournament, 'tournament', 64, { what: 'a tournament' }) : null;
  const sport = q.sport ? text(q.sport, 'sport', 40, { what: 'a sport' }) : null;
  if (sport && !SPORT_KEYS.has(sport)) throw new AppError(400, 'BAD_REQUEST', 'sport: Choose a supported sport.');
  const date = q.date ? dateText(q.date, 'date', { what: 'a date' }) : null;
  const phase = q.phase ? text(q.phase, 'phase', 10, { what: 'a phase' }) : null;
  if (phase && !['live', 'upcoming', 'past'].includes(phase)) throw new AppError(400, 'BAD_REQUEST', 'phase: Choose Live, Upcoming or Past.');

  const scope = scopeFilter(account, 't', 'ts', 2); // $1 is the caller id (holdsAssignment)
  const params = [account.id];
  const where = [];
  if (scope.text) { where.push(scope.text); params.push(...scope.params); }
  if (tournament) { params.push(tournament); where.push(`t.slug = $${params.length}`); }
  if (sport) { params.push(sport); where.push(`ts.sport = $${params.length}`); }
  if (date) { params.push(ZONE); const zi = params.length; params.push(date); where.push(`(m.scheduled_at AT TIME ZONE $${zi}::text)::date = $${params.length}::date`); }

  const result = await uncached(c, async (client) => {
    const sql = `${MATCH_SELECT.replace('$ACCOUNT', '$1')}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY m.scheduled_at NULLS LAST, m.id
      LIMIT 501`;
    const { rows } = await client.query(sql, params);
    return rows;
  });

  const now = result.length ? Number(result[0].now) : Date.now();
  let rows = result.map((r) => matchRowWithFlags(r, now, account));
  if (phase) rows = rows.filter((row) => row.phase === phase);
  const total = rows.length;
  return c.json({ matches: rows.slice(0, 500), total });
});

// --- POST /api/manage/matches --------------------------------------------
// Create a SCHEDULED match in a Tournament_Sport (sport scope). The body carries the tournament slug
// and sport key so the route resolves the Tournament_Sport, then validates the India_Time date/time, stage
// and sides. 409 STAGE_TAKEN on a duplicate stage; 409 TOURNAMENT_LOCKED when Completed/Archived.
manageRoutes.post('/manage/matches', ...guard, async (c) => {
  const account = c.get('account');
  const requestId = c.get('requestId');
  const body = await jsonBody(c);
  // Step 3a: the target keys must be present and well formed before any lock.
  const slug = text(body.tournament, 'tournament', 64, { required: true, what: 'a tournament' });
  const sport = text(body.sport, 'sport', 40, { required: true, what: 'a sport' });

  const created = await uncached(c, (client) =>
    withTx(client, async (tx) => {
      // Resolve and lock the Tournament_Sport within its tournament (the owning tournament FOR SHARE
      // keeps the lock order match-then-tournament; a create has no match row yet).
      const { rows: [current] } = await tx.query(
        'SELECT id, status, starts_on::text AS "startsOn", ends_on::text AS "endsOn" FROM tournaments WHERE slug = $1 FOR SHARE',
        [slug],
      );
      if (!current) throw notFound('Tournament');
      const { rows: [ts] } = await tx.query(
        'SELECT id FROM tournament_sports WHERE tournament_id = $1 AND sport = $2',
        [current.id, sport],
      );
      if (!ts) throw notFound('Sport');
      await requireScope(tx, account, { tournamentSportId: ts.id });
      if (isLocked(current.status)) throw locked();

      // Step 3b: validate the match fields against this sport's teams and the tournament dates, using
      // database time for "today" so the India_Time date check matches every other staff read.
      const { rows: [{ today, teamIds }] } = await tx.query(
        `SELECT (now() AT TIME ZONE $2::text)::date::text AS today,
                COALESCE((SELECT json_agg(id::text) FROM teams WHERE tournament_sport_id = $1), '[]') AS "teamIds"`,
        [ts.id, ZONE],
      );
      const fields = validateMatchFields(body, {
        teamIds: new Set(teamIds), startsOn: current.startsOn, endsOn: current.endsOn, today, current: null,
      });

      let matchId;
      try {
        const { rows: [row] } = await tx.query(
          `INSERT INTO matches (tournament_sport_id, kind, stage, side_a_team_id, side_b_team_id, scheduled_at, venue)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [ts.id, fields.kind, fields.stage, fields.sideA, fields.sideB, fields.scheduledAt, fields.venue],
        );
        matchId = row.id;
      } catch (err) {
        if (err.code === '23505') throw stageTaken(fields.stage);
        throw err;
      }
      await audit(tx, {
        actorId: account.id, action: 'MATCH_CREATED', entity: 'matches', entityId: String(matchId), requestId,
        after: { tournamentSportId: String(ts.id), kind: fields.kind, stage: fields.stage, scheduledAt: fields.scheduledAt, sideA: fields.sideA, sideB: fields.sideB, venue: fields.venue },
      });
      return matchId;
    }),
  );

  // Read the created row back with flags and the database clock, so the client gets the full shape.
  const match = await readMatchRow(c, account, created);
  return c.json({ match }, 201);
});

// Load one staff match row by id with its flags and the database clock, or throw 404. Shared by the
// create response and GET /api/manage/matches/:id; the caller has already checked scope when needed.
async function readMatchRow(c, account, id) {
  const r = await uncached(c, async (client) => {
    const { rows: [row] } = await client.query(
      `${MATCH_SELECT.replace('$ACCOUNT', '$1')}
       WHERE m.id = $2`,
      [account.id, id],
    );
    return row;
  });
  if (!r) throw notFound('Match');
  return matchRowWithFlags(r, Number(r.now), account);
}

// --- GET /api/manage/matches/:id -----------------------------------------
// One staff match row (sport scope). 400 on a malformed id; 404 when absent or out of scope.
manageRoutes.get('/manage/matches/:id', ...guard, async (c) => {
  const account = c.get('account');
  const id = c.req.param('id');
  if (!/^\d+$/.test(id)) throw new AppError(400, 'BAD_REQUEST', 'id: This match id is not valid.');

  const match = await uncached(c, (client) =>
    withTx(client, async (tx) => {
      const { rows: [located] } = await tx.query(
        'SELECT m.tournament_sport_id AS "tournamentSportId" FROM matches m WHERE m.id = $1',
        [id],
      );
      if (!located) throw notFound('Match');
      await requireScope(tx, account, { tournamentSportId: located.tournamentSportId });
      const { rows: [r] } = await tx.query(
        `${MATCH_SELECT.replace('$ACCOUNT', '$1')}
         WHERE m.id = $2`,
        [account.id, id],
      );
      return matchRowWithFlags(r, Number(r.now), account);
    }),
  );
  return c.json({ match });
});

// --- PATCH /api/manage/matches/:id ---------------------------------------
// Edit a SCHEDULED (Upcoming) match (sport scope). 409 MATCH_CLOSED when the match is Live, Final or
// Not_Scored by database time (Requirement 12.8); 409 STAGE_TAKEN on a stage clash; 409
// TOURNAMENT_LOCKED when the tournament is Completed/Archived. Only the fields sent change.
manageRoutes.patch('/manage/matches/:id', ...guard, async (c) => {
  const account = c.get('account');
  const requestId = c.get('requestId');
  const id = c.req.param('id');
  if (!/^\d+$/.test(id)) throw new AppError(400, 'BAD_REQUEST', 'id: This match id is not valid.');
  const body = await jsonBody(c);

  const updated = await uncached(c, (client) =>
    withTx(client, async (tx) => {
      // Lock order: the match row first, then the owning tournament FOR SHARE.
      const { rows: [match] } = await tx.query(
        `SELECT m.id, m.tournament_sport_id AS "tournamentSportId", m.kind, m.stage, m.status,
                (extract(epoch FROM m.scheduled_at) * 1000)::float8 AS "scheduledAt",
                m.side_a_team_id::text AS "sideA", m.side_b_team_id::text AS "sideB", m.venue,
                (extract(epoch FROM now()) * 1000)::bigint AS now
         FROM matches m WHERE m.id = $1 FOR UPDATE`,
        [id],
      );
      if (!match) throw notFound('Match');
      const { rows: [t] } = await tx.query(
        `SELECT id, status, starts_on::text AS "startsOn", ends_on::text AS "endsOn",
                (now() AT TIME ZONE $2::text)::date::text AS today
         FROM tournaments WHERE id = (SELECT tournament_id FROM tournament_sports WHERE id = $1) FOR SHARE`,
        [match.tournamentSportId, ZONE],
      );
      await requireScope(tx, account, { tournamentSportId: match.tournamentSportId });
      if (isLocked(t.status)) throw locked();
      // Only a SCHEDULED, still-Upcoming match may be edited; Live/Final/Not_Scored → MATCH_CLOSED.
      if (matchPhase({ status: match.status, scheduledAt: match.scheduledAt }, Number(match.now)) !== 'upcoming') throw matchClosed();

      const { rows: [{ teamIds }] } = await tx.query(
        `SELECT COALESCE((SELECT json_agg(id::text) FROM teams WHERE tournament_sport_id = $1), '[]') AS "teamIds"`,
        [match.tournamentSportId],
      );
      const fields = validateMatchFields(body, {
        teamIds: new Set(teamIds), startsOn: t.startsOn, endsOn: t.endsOn, today: t.today,
        current: { scheduledAt: match.scheduledAt, stage: match.stage, sideA: match.sideA, sideB: match.sideB, venue: match.venue },
      });

      try {
        await tx.query(
          `UPDATE matches SET kind = $2, stage = $3, side_a_team_id = $4, side_b_team_id = $5, scheduled_at = $6, venue = $7
           WHERE id = $1`,
          [match.id, fields.kind, fields.stage, fields.sideA, fields.sideB, fields.scheduledAt, fields.venue],
        );
      } catch (err) {
        if (err.code === '23505') throw stageTaken(fields.stage);
        throw err;
      }
      await audit(tx, {
        actorId: account.id, action: 'MATCH_UPDATED', entity: 'matches', entityId: String(match.id), requestId,
        before: { kind: match.kind, stage: match.stage, scheduledAt: match.scheduledAt != null ? new Date(match.scheduledAt).toISOString() : null, sideA: match.sideA, sideB: match.sideB, venue: match.venue },
        after: { kind: fields.kind, stage: fields.stage, scheduledAt: fields.scheduledAt, sideA: fields.sideA, sideB: fields.sideB, venue: fields.venue },
      });
      return match.id;
    }),
  );
  const match = await readMatchRow(c, account, updated);
  return c.json({ match });
});

// --- DELETE /api/manage/matches/:id --------------------------------------
// Super Admin only (Arnav, 24 October 2026), in any match state. A match that is Live, Final, Not_Scored or has a
// score action needs a reason (409 REASON_REQUIRED). Deletes the match with its score data, scorer lease and
// assignments in one transaction (deleteMatchRows), then drops its home card. 409 TOURNAMENT_LOCKED when the
// tournament is Completed/Archived. Lock order: match FOR UPDATE, then the owning tournament FOR SHARE. Writes an
// ASSIGNMENT_REVOKED Audit_Row when an ACTIVE Assignment existed, then a MATCH_DELETED Audit_Row.
manageRoutes.delete('/manage/matches/:id', ...guard, async (c) => {
  const account = c.get('account');
  if (account.role !== 'SUPER_ADMIN') throw new AppError(403, 'ROLE_FORBIDDEN', 'Only a Super Admin can delete a match');
  const requestId = c.get('requestId');
  const id = c.req.param('id');
  if (!/^\d+$/.test(id)) throw new AppError(400, 'BAD_REQUEST', 'id: This match id is not valid.');
  // A DELETE body is optional; read the reason when one is sent.
  const parsed = await c.req.json().catch(() => null);
  const reason = text(parsed && typeof parsed === 'object' ? parsed.reason : '', 'reason', 500, { what: 'a reason' }) || null;

  await uncached(c, (client) =>
    withTx(client, async (tx) => {
      // Lock order: the match row first, then the owning tournament FOR SHARE.
      const { rows: [match] } = await tx.query(
        `SELECT m.id, m.tournament_sport_id AS "tournamentSportId", m.kind, m.stage, m.status,
                (extract(epoch FROM m.scheduled_at) * 1000)::float8 AS "scheduledAt",
                (extract(epoch FROM now()) * 1000)::bigint AS now,
                EXISTS (SELECT 1 FROM score_actions sa WHERE sa.match_id = m.id) AS "hasActions"
         FROM matches m WHERE m.id = $1 FOR UPDATE`,
        [id],
      );
      if (!match) throw notFound('Match');
      const { rows: [t] } = await tx.query(
        `SELECT status FROM tournaments WHERE id = (SELECT tournament_id FROM tournament_sports WHERE id = $1) FOR SHARE`,
        [match.tournamentSportId],
      );
      await requireScope(tx, account, { tournamentSportId: match.tournamentSportId });
      if (t && isLocked(t.status)) throw locked();
      // A Live, Final or Not_Scored match, or one with a score action, has public results: it needs a reason.
      const played = matchPhase({ status: match.status, scheduledAt: match.scheduledAt }, Number(match.now)) !== 'upcoming' || match.hasActions;
      if (played && !reason) throw new AppError(409, 'REASON_REQUIRED', 'A reason is required to delete a played match');

      const { rows: [active] } = await tx.query(
        `SELECT id, account_id FROM match_operator_assignments WHERE match_id = $1 AND status = 'ACTIVE'`,
        [match.id],
      );
      if (active) {
        await audit(tx, {
          actorId: account.id, action: 'ASSIGNMENT_REVOKED', entity: 'match_operator_assignments', entityId: String(active.id), requestId, reason,
          before: { status: 'ACTIVE', accountId: String(active.account_id) }, after: { status: 'REVOKED' },
        });
      }
      await deleteMatchRows(tx, 'SELECT $1::bigint', [match.id]);
      await audit(tx, {
        actorId: account.id, action: 'MATCH_DELETED', entity: 'matches', entityId: String(match.id), requestId, reason,
        before: { tournamentSportId: String(match.tournamentSportId), kind: match.kind, stage: match.stage, status: match.status, hasActions: Boolean(match.hasActions) },
      });
    }),
  );
  dropHomeCards(c, [String(id)]);
  return c.json({ removed: true });
});


