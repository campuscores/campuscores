// One-off: give each THAPARLYMPICS 2026 sport its own Match_Scorer account and assign it every open match of that
// sport. Run only by .github/workflows/seed-event.yml (task assign-scorers):
//   DATABASE_URL=... node backend/scripts/assign-sport-scorers.js
// One transaction; a refusal writes nothing. Idempotent: a second run creates nothing. A match that already has an
// ACTIVE scorer keeps it and is reported. It prints counts only.
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { audit, withTx } from '../src/db.js';
import { OWNER_CLERK_ID } from './seed-thaparlympics-2026.js';

const SLUG = 'thaparlympics-2026';
export const SCORERS = [
  { sport: 'football', email: 'football_tfc_1@gmail.com', clerkUserId: 'user_3L6myWHRXIVfvtT8uvQzcD54m2h', name: 'Football Scorer' },
  { sport: 'basketball', email: 'basketball_tfc_1@gmail.com', clerkUserId: 'user_3L6n4TY4SjyureNgzQkWlshTsJA', name: 'Basketball Scorer' },
  { sport: 'volleyball', email: 'volleyball_tfc_1@gmail.com', clerkUserId: 'user_3L6n9zYS06xLszlgmsKkTbmROyB', name: 'Volleyball Scorer' },
  { sport: 'badminton', email: 'badminton_tfc_1@gmail.com', clerkUserId: 'user_3L6nFljQltnoMmVYbY1rh4sXlWX', name: 'Badminton Scorer' },
  { sport: 'table-tennis', email: 'tabletennis_tfc_1@gmail.com', clerkUserId: 'user_3L6nKlTfOEbZtrm4GpMuSFub4gR', name: 'Table Tennis Scorer' },
  { sport: 'lawn-tennis', email: 'lawntennis_tfc_1@gmail.com', clerkUserId: 'user_3L6nQVHHHA9sB8dqmLUeE9OEvRM', name: 'Lawn Tennis Scorer' },
];

/** Returns per-sport counts. Throws, writing nothing, on any refusal. */
export function assignScorers(client, { ownerClerkId = OWNER_CLERK_ID, scorers = SCORERS } = {}) {
  return withTx(client, async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext('assign-sport-scorers'))");
    const { rows: [owner] } = await tx.query(
      "SELECT id FROM admin_accounts WHERE clerk_user_id = $1 AND role = 'SUPER_ADMIN' AND status = 'ACTIVE'",
      [ownerClerkId],
    );
    if (!owner) throw new Error('The owner is not an active SUPER_ADMIN account; no row was written');
    const { rows: [tournament] } = await tx.query('SELECT id FROM tournaments WHERE slug = $1', [SLUG]);
    if (!tournament) throw new Error(`Tournament ${SLUG} does not exist; no row was written`);

    const report = {};
    for (const s of scorers) {
      // Never change the role of an existing staff account other than a Match_Scorer.
      const { rows: [existing] } = await tx.query('SELECT id, role FROM admin_accounts WHERE clerk_user_id = $1', [s.clerkUserId]);
      if (existing && existing.role !== 'MATCH_OPERATOR') {
        throw new Error(`${s.email} is already a ${existing.role} account; no row was written`);
      }
      const { rows: [clash] } = await tx.query(
        "SELECT 1 FROM admin_accounts WHERE email = $1 AND status = 'ACTIVE' AND clerk_user_id <> $2",
        [s.email, s.clerkUserId],
      );
      if (clash) throw new Error(`Another active account already uses ${s.email}; no row was written`);
      const { rows: [account] } = await tx.query(
        `INSERT INTO admin_accounts (clerk_user_id, email, role, status, name, invited_by)
         VALUES ($1, $2, 'MATCH_OPERATOR', 'ACTIVE', $3, $4)
         ON CONFLICT (clerk_user_id) DO UPDATE SET email = EXCLUDED.email, status = 'ACTIVE', name = EXCLUDED.name, updated_at = now()
         RETURNING id, (xmax = 0) AS created`,
        [s.clerkUserId, s.email, s.name, owner.id],
      );

      // Open matches of this sport: not Final, not past their match day (closed matches cannot be assigned).
      const { rows: matches } = await tx.query(
        `SELECT m.id, a.account_id AS current
         FROM matches m
         JOIN tournament_sports ts ON ts.id = m.tournament_sport_id
         LEFT JOIN match_operator_assignments a ON a.match_id = m.id AND a.status = 'ACTIVE'
         WHERE ts.tournament_id = $1 AND ts.sport = $2 AND m.status IN ('SCHEDULED', 'LIVE')
         ORDER BY m.scheduled_at, m.id FOR UPDATE OF m`,
        [tournament.id, s.sport],
      );
      const r = { account: account.created ? 'created' : 'updated', assigned: 0, alreadyHis: 0, otherScorer: [] };
      for (const m of matches) {
        if (m.current === account.id) { r.alreadyHis++; continue; }
        if (m.current) { r.otherScorer.push(m.id); continue; }
        const { rows: [created] } = await tx.query(
          `INSERT INTO match_operator_assignments (match_id, account_id, assigned_by, permission, valid_from, valid_until, status)
           VALUES ($1, $2, $3, 'SCORE', NULL, NULL, 'ACTIVE') RETURNING id`,
          [m.id, account.id, owner.id],
        );
        await audit(tx, {
          actorId: owner.id, action: 'ASSIGNMENT_CREATED', entity: 'match_operator_assignments', entityId: String(created.id),
          requestId: null, after: { matchId: m.id, accountId: account.id },
        });
        r.assigned++;
      }
      report[s.sport] = r;
    }
    return report;
  });
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const report = await assignScorers(client, { ownerClerkId: process.env.SEED_OWNER_CLERK_ID || OWNER_CLERK_ID });
    for (const [sport, r] of Object.entries(report)) {
      console.log(`${sport}: account ${r.account}, ${r.assigned} assigned, ${r.alreadyHis} already assigned, `
        + `${r.otherScorer.length} kept with another scorer${r.otherScorer.length ? ` (matches ${r.otherScorer.join(', ')})` : ''}`);
    }
  } finally {
    await client.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`Assign failed: ${err.message}`);
    process.exit(1);
  });
}
