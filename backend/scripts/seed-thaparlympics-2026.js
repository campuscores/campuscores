// One-off, idempotent seed of the THAPARLYMPICS 2026 event. Run only by .github/workflows/seed-event.yml:
//   DATABASE_URL=... node backend/scripts/seed-thaparlympics-2026.js
// SEED_OWNER_CLERK_ID overrides the owner (local tests and staging use the fake seed Super Admin, test_super_admin).
// SEED_START_DATE (YYYY-MM-DD, India_Time) moves day 1; SEED_UPDATE_DATES=1 also sets the dates of an existing tournament.
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { EVENT_TIME_ZONE, istToUtc } from '../../shared/time.mjs';
import { audit, withTx } from '../src/db.js';

export const OWNER_CLERK_ID = 'user_3Ktrm1iGrpR6gzhLxsL5MSpfOej';
const SLUG = 'thaparlympics-2026';
const SPORTS = ['volleyball', 'football', 'badminton', 'lawn-tennis', 'table-tennis', 'basketball'];
const TEAMS = ['OCTANE BOOSTERS', 'THE LIVE WIRES', 'ROYAL FALCONS', 'COMPUTER STEEL HEADS', 'INVINCIBLES', 'BLAZING TITANS'];
// India_Time date and time, side A, side B.
const MATCHES = [
  ['2026-10-24', '09:00', 'OCTANE BOOSTERS', 'THE LIVE WIRES'],
  ['2026-10-24', '10:00', 'ROYAL FALCONS', 'COMPUTER STEEL HEADS'],
  ['2026-10-24', '17:30', 'THE LIVE WIRES', 'INVINCIBLES'],
  ['2026-10-24', '18:30', 'COMPUTER STEEL HEADS', 'BLAZING TITANS'],
  ['2026-10-25', '09:00', 'OCTANE BOOSTERS', 'INVINCIBLES'],
  ['2026-10-25', '10:00', 'ROYAL FALCONS', 'BLAZING TITANS'],
];
const key = (name) => name.trim().toLowerCase(); // the teams_unique_name rule
const DAY_ONE = '2026-10-24';
const ZONE = EVENT_TIME_ZONE.name;

const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
/** A valid YYYY-MM-DD calendar date, else an error. */
export function parseStartDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || addDays(value, 0) !== value) throw new Error('SEED_START_DATE must be a YYYY-MM-DD date');
  return value;
}

/**
 * One transaction. Throws, and writes nothing, when the owner is not an ACTIVE SUPER_ADMIN. Returns the counts.
 * `startDate` (India_Time date) moves day 1 of the event to that date: day 2 is the next day, ends_on is day 1 + 2.
 * With a startDate, a seeded pairing that already exists in the sport at any time is skipped, so existing matches stay.
 * `updateDates` sets the dates of an existing tournament. The run fails, and writes nothing, when a match would fall
 * outside the tournament dates (the DATES_EXCLUDE_MATCHES rule).
 */
export function seedEvent(client, ownerClerkId = OWNER_CLERK_ID, { startDate = null, updateDates = false } = {}) {
  const shift = startDate ? Math.round((Date.parse(startDate) - Date.parse(DAY_ONE)) / 86400000) : 0;
  const startsOn = addDays(DAY_ONE, shift);
  const endsOn = addDays(startsOn, 2);
  return withTx(client, async (tx) => {
    // Two runs at once wait for each other, so the second one only skips.
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('seed-thaparlympics-2026'))");
    const { rows: [owner] } = await tx.query(
      "SELECT id FROM admin_accounts WHERE clerk_user_id = $1 AND role = 'SUPER_ADMIN' AND status = 'ACTIVE'",
      [ownerClerkId],
    );
    if (!owner) throw new Error('The owner is not an active SUPER_ADMIN account; no row was written');
    const counts = { tournaments: [0, 0], sports: [0, 0], teams: [0, 0], matches: [0, 0] }; // [created, skipped]

    const inserted = await tx.query(
      `INSERT INTO tournaments (slug, name, starts_on, ends_on, status, image_key, venue, description, owner_account_id)
       VALUES ($1, 'THAPARLYMPICS 2026', $3, $4, 'ONGOING', 'stadium', NULL, NULL, $2)
       ON CONFLICT (slug) DO NOTHING RETURNING id`,
      [SLUG, owner.id, startsOn, endsOn],
    );
    counts.tournaments[inserted.rowCount ? 0 : 1]++;
    const { rows: [tournament] } = await tx.query('SELECT id FROM tournaments WHERE slug = $1', [SLUG]);
    if (!inserted.rowCount && updateDates) {
      await tx.query('UPDATE tournaments SET starts_on = $2, ends_on = $3 WHERE id = $1', [tournament.id, startsOn, endsOn]);
    }

    for (const sport of SPORTS) {
      const added = await tx.query(
        `INSERT INTO tournament_sports (tournament_id, sport, config, config_version) VALUES ($1, $2, '{}', 1)
         ON CONFLICT (tournament_id, sport) DO NOTHING RETURNING id`,
        [tournament.id, sport],
      );
      counts.sports[added.rowCount ? 0 : 1]++;
      const { rows: [ts] } = await tx.query('SELECT id FROM tournament_sports WHERE tournament_id = $1 AND sport = $2', [tournament.id, sport]);

      for (const name of TEAMS) {
        const team = await tx.query(
          `INSERT INTO teams (tournament_sport_id, label, branch, year, players) VALUES ($1, $2, NULL, NULL, '[]')
           ON CONFLICT (tournament_sport_id, lower(btrim(label))) DO NOTHING RETURNING id`,
          [ts.id, name],
        );
        counts.teams[team.rowCount ? 0 : 1]++;
      }
      const { rows: teamRows } = await tx.query('SELECT id, label FROM teams WHERE tournament_sport_id = $1', [ts.id]);
      const teamId = new Map(teamRows.map((t) => [key(t.label), t.id]));

      for (const [date, time, a, b] of MATCHES) {
        const scheduledAt = new Date(istToUtc(addDays(date, shift), time)).toISOString();
        const [sideA, sideB] = [teamId.get(key(a)), teamId.get(key(b))];
        // The same pairing at the same time, in either side order, is the same match.
        // With a startDate, the same pairing at any time is the same match.
        const exists = await tx.query(
          `SELECT 1 FROM matches WHERE tournament_sport_id = $1 AND ($5 OR scheduled_at = $2)
             AND ((side_a_team_id = $3 AND side_b_team_id = $4) OR (side_a_team_id = $4 AND side_b_team_id = $3))`,
          [ts.id, scheduledAt, sideA, sideB, Boolean(startDate)],
        );
        if (exists.rowCount) { counts.matches[1]++; continue; }
        await tx.query(
          `INSERT INTO matches (tournament_sport_id, kind, stage, side_a_team_id, side_b_team_id, scheduled_at, venue, status)
           VALUES ($1, 'CUSTOM', NULL, $2, $3, $4, NULL, 'SCHEDULED')`,
          [ts.id, sideA, sideB, scheduledAt],
        );
        counts.matches[0]++;
      }
    }

    if (startDate) {
      // The PATCH DATES_EXCLUDE_MATCHES rule: no match may fall outside the tournament dates.
      const { rows: [{ outside }] } = await tx.query(
        `SELECT count(*)::int AS outside
         FROM matches m JOIN tournament_sports ts ON ts.id = m.tournament_sport_id JOIN tournaments t ON t.id = ts.tournament_id
         WHERE t.id = $1 AND m.scheduled_at IS NOT NULL
           AND (m.scheduled_at AT TIME ZONE $2::text)::date NOT BETWEEN t.starts_on AND t.ends_on`,
        [tournament.id, ZONE],
      );
      if (outside > 0) throw new Error(`${outside} matches fall outside the tournament dates; no row was written`);
    }

    // admin_audit_log.action has no CHECK constraint, so the seed uses its own action name.
    const after = Object.fromEntries(Object.entries(counts).map(([k, [created, skipped]]) => [k, { created, skipped }]));
    if (startDate) after.dates = { startsOn, endsOn, updated: Boolean(!inserted.rowCount && updateDates) };
    await audit(tx, {
      actorId: owner.id, action: 'EVENT_SEEDED', entity: 'tournaments', entityId: String(tournament.id), requestId: null, after,
    });
    return counts;
  });
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const startDate = process.env.SEED_START_DATE ? parseStartDate(process.env.SEED_START_DATE) : null;
    const updateDates = process.env.SEED_UPDATE_DATES === '1' || process.env.SEED_UPDATE_DATES === 'true';
    const counts = await seedEvent(client, process.env.SEED_OWNER_CLERK_ID || OWNER_CLERK_ID, { startDate, updateDates });
    if (startDate) console.log(`dates: ${startDate} start, ${updateDates ? 'update existing' : 'keep existing'}`);
    for (const [name, [created, skipped]] of Object.entries(counts)) console.log(`${name}: ${created} created, ${skipped} skipped`);
  } finally {
    await client.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Print only the message: pg errors never include the connection string, but a stack is noise here.
  main().catch((err) => {
    console.error(`Seed failed: ${err.message}`);
    process.exit(1);
  });
}
