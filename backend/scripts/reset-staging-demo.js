// Staging-only demo reset. Run only by .github/workflows/reset-staging-demo.yml:
//   RESET_ENV=staging DATABASE_URL=... node backend/scripts/reset-staging-demo.js
// One transaction: it deletes every tournament and match row, upserts the demo scorer account,
// and creates Test Tournament with six sports, 36 teams and 18 matches assigned to that scorer.
// All matches start at the current minute, so START works at once. It prints counts only.
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { istDate } from '../../shared/time.mjs';
import { audit, withTx } from '../src/db.js';

export const SCORER = {
  clerkUserId: 'user_3L63s7sFhBTRbXZJxTF354467lO', email: 'test_tfc@gmail.com', name: 'TFC Demo Scorer',
};
const SLUG = 'test-tournament';
// FK-safe delete order: children first.
const TABLES = [
  'score_actions', 'match_snapshots', 'outbox_events', 'scorer_leases', 'match_operator_assignments',
  'matches', 'teams', 'tournament_sport_managers', 'tournament_sports', 'tournaments',
];
// Six distinct team names and three distinct venues per sport; no name repeats across sports.
const SPORTS = {
  volleyball: {
    teams: ['SPIKE SQUAD', 'BLOCK PARTY', 'NET NINJAS', 'SERVE SMASHERS', 'DIG DYNAMOS', 'ACE ATTACKERS'],
    venues: ['Volleyball Court 1', 'Volleyball Court 2', 'Volleyball Court 3'],
  },
  football: {
    teams: ['GOAL GETTERS', 'PENALTY KINGS', 'OFFSIDE OUTLAWS', 'CORNER KICKERS', 'STRIKER FORCE', 'MIDFIELD MAESTROS'],
    venues: ['Main Football Ground', 'North Football Field', 'South Football Field'],
  },
  badminton: {
    teams: ['SHUTTLE STORM', 'SMASH BROTHERS', 'DROP SHOT DEMONS', 'FEATHER FLYERS', 'RALLY RAIDERS', 'CLEAR CUTTERS'],
    venues: ['Badminton Hall A', 'Badminton Hall B', 'Badminton Hall C'],
  },
  'lawn-tennis': {
    teams: ['BASELINE BOMBERS', 'DEUCE DEVILS', 'TOPSPIN TITANS', 'VOLLEY VIPERS', 'LOVE ALL LEGENDS', 'GRAND SLAMMERS'],
    venues: ['Tennis Court 1', 'Tennis Court 2', 'Tennis Court 3'],
  },
  'table-tennis': {
    teams: ['PING PONG PIRATES', 'PADDLE PANTHERS', 'LOOP LORDS', 'CHOP CHAMPIONS', 'EDGE BALL EAGLES', 'SPIN DOCTORS'],
    venues: ['Table Tennis Table 1', 'Table Tennis Table 2', 'Table Tennis Table 3'],
  },
  basketball: {
    teams: ['HOOP HEROES', 'DUNK DYNASTY', 'FAST BREAKERS', 'REBOUND REBELS', 'THREE POINT THREATS', 'BUZZER BEATERS'],
    venues: ['Indoor Basketball Court', 'Outdoor Basketball Court 1', 'Outdoor Basketball Court 2'],
  },
};
// Team index pairs: each match has a different pair of sides.
const PAIRS = [[0, 1], [2, 3], [4, 5]];

const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

/** One transaction; any failure writes nothing. Returns the counts. */
export function resetDemo(client, nowMs = Date.now()) {
  const startsOn = istDate(nowMs);
  const endsOn = addDays(startsOn, 2);
  return withTx(client, async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('reset-staging-demo'))");
    const deleted = {};
    for (const table of TABLES) deleted[table] = (await tx.query(`DELETE FROM ${table}`)).rowCount;
    deleted.admin_audit_log = (await tx.query('DELETE FROM admin_audit_log WHERE entity = ANY($1::text[])', [TABLES])).rowCount;

    const { rows: [clash] } = await tx.query(
      "SELECT 1 FROM admin_accounts WHERE email = $1 AND status = 'ACTIVE' AND clerk_user_id <> $2",
      [SCORER.email, SCORER.clerkUserId],
    );
    if (clash) throw new Error(`Another ACTIVE account already has the email ${SCORER.email}; no row was written`);
    const { rows: [scorer] } = await tx.query(
      `INSERT INTO admin_accounts (clerk_user_id, email, role, status, name) VALUES ($1, $2, 'MATCH_OPERATOR', 'ACTIVE', $3)
       ON CONFLICT (clerk_user_id) DO UPDATE
         SET email = EXCLUDED.email, role = EXCLUDED.role, status = EXCLUDED.status, name = EXCLUDED.name, updated_at = now()
       RETURNING id, (xmax = 0) AS created`,
      [SCORER.clerkUserId, SCORER.email, SCORER.name],
    );

    const { rows: [owner] } = await tx.query(
      "SELECT id FROM admin_accounts WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE' ORDER BY id LIMIT 1",
    );
    if (!owner) throw new Error('No ACTIVE SUPER_ADMIN account exists; no row was written');

    const { rows: [tournament] } = await tx.query(
      `INSERT INTO tournaments (slug, name, starts_on, ends_on, status, image_key, venue, description, owner_account_id)
       VALUES ($1, 'Test Tournament', $2, $3, 'ONGOING', 'stadium', NULL, NULL, $4) RETURNING id`,
      [SLUG, startsOn, endsOn, owner.id],
    );
    const counts = { tournaments: 1, sports: 0, teams: 0, matches: 0, assignments: 0 };
    for (const [sport, { teams, venues }] of Object.entries(SPORTS)) {
      const { rows: [ts] } = await tx.query(
        "INSERT INTO tournament_sports (tournament_id, sport, config, config_version) VALUES ($1, $2, '{}', 1) RETURNING id",
        [tournament.id, sport],
      );
      counts.sports++;
      const teamIds = [];
      for (const label of teams) {
        const { rows: [team] } = await tx.query(
          "INSERT INTO teams (tournament_sport_id, label, branch, year, players) VALUES ($1, $2, NULL, NULL, '[]') RETURNING id",
          [ts.id, label],
        );
        teamIds.push(team.id);
        counts.teams++;
      }
      for (const [i, [a, b]] of PAIRS.entries()) {
        const { rows: [match] } = await tx.query(
          `INSERT INTO matches (tournament_sport_id, kind, stage, side_a_team_id, side_b_team_id, scheduled_at, venue, status)
           VALUES ($1, 'CUSTOM', NULL, $2, $3, date_trunc('minute', now()), $4, 'SCHEDULED') RETURNING id`,
          [ts.id, teamIds[a], teamIds[b], venues[i]],
        );
        counts.matches++;
        await tx.query(
          `INSERT INTO match_operator_assignments (match_id, account_id, assigned_by, permission, valid_from, valid_until, status)
           VALUES ($1, $2, $3, 'SCORE', NULL, NULL, 'ACTIVE')`,
          [match.id, scorer.id, owner.id],
        );
        counts.assignments++;
      }
    }

    // admin_audit_log.action has no CHECK constraint, so the reset uses its own action name.
    await audit(tx, {
      actorId: owner.id, action: 'DEMO_RESET', entity: 'tournaments', entityId: String(tournament.id), requestId: null,
      after: { deleted, created: counts, scorerAccount: scorer.created ? 'created' : 'updated', startsOn, endsOn },
    });
    return { deleted, counts, scorerAccount: scorer.created ? 'created' : 'updated', startsOn, endsOn };
  });
}

async function main() {
  if (process.env.RESET_ENV !== 'staging') throw new Error('RESET_ENV must be staging; this reset never runs elsewhere');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { deleted, counts, scorerAccount, startsOn, endsOn } = await resetDemo(client);
    for (const [name, n] of Object.entries(deleted)) console.log(`deleted ${name}: ${n}`);
    console.log(`scorer account: ${scorerAccount}`);
    console.log(`dates: ${startsOn} to ${endsOn}`);
    for (const [name, n] of Object.entries(counts)) console.log(`${name}: ${n} created`);
  } finally {
    await client.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Print only the message: pg errors never include the connection string, but a stack is noise here.
  main().catch((err) => {
    console.error(`Reset failed: ${err.message}`);
    process.exit(1);
  });
}
