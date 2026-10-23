// Creates the first active SUPER_ADMIN in one environment. Run only by .github/workflows/bootstrap.yml:
//   DATABASE_URL=... BOOTSTRAP_ENV=staging|production node backend/scripts/bootstrap-super-admin.js --clerk-user-id user_...
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { withTx } from '../src/db.js';
// Clerk user IDs are `user_` plus base62 characters.
export const isClerkUserId = (id) => typeof id === 'string' && /^user_[A-Za-z0-9]{1,64}$/.test(id);
// Fail closed: only the exact value 'staging' ignores the fake seed accounts (clerk_user_id test_...).
export const ignoresSeedAdmins = (environment) => environment === 'staging';
// One transaction on a connected pg client. Throws, and changes no row, if an active SUPER_ADMIN exists.
export function bootstrapSuperAdmin(client, clerkUserId, environment) {
  if (!isClerkUserId(clerkUserId)) throw new Error('Invalid Clerk user ID: expected user_ followed by letters and digits');
  return withTx(client, async (tx) => {
    // Blocks concurrent inserts, so two runs on an empty table cannot both create a Super Admin.
    await tx.query('LOCK TABLE admin_accounts IN SHARE ROW EXCLUSIVE MODE');
    const existing = await tx.query(
      `SELECT 1 FROM admin_accounts WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE'
         AND NOT ($1::boolean AND left(clerk_user_id, 5) = 'test_') FOR UPDATE`,
      [ignoresSeedAdmins(environment)],
    );
    if (existing.rowCount > 0) throw new Error('An active SUPER_ADMIN already exists; no row was changed');
    const taken = await tx.query('SELECT role, status FROM admin_accounts WHERE clerk_user_id = $1', [clerkUserId]);
    if (taken.rowCount > 0) throw new Error('This Clerk user already has an account; no row was changed');
    const { rows: [account] } = await tx.query(
      `INSERT INTO admin_accounts (clerk_user_id, role, status) VALUES ($1, 'SUPER_ADMIN', 'ACTIVE') RETURNING id, clerk_user_id, role, status`,
      [clerkUserId],
    );
    await tx.query(
      `INSERT INTO admin_audit_log (actor_label, action, entity, entity_id, after)
       VALUES ('bootstrap-workflow', 'SUPER_ADMIN_BOOTSTRAPPED', 'admin_accounts', $1, $2)`,
      [account.id, { clerkUserId, role: 'SUPER_ADMIN', status: 'ACTIVE' }],
    );
    return account;
  });
}
async function main(argv) {
  const i = argv.indexOf('--clerk-user-id');
  const clerkUserId = i === -1 ? undefined : argv[i + 1];
  if (!isClerkUserId(clerkUserId)) throw new Error('Usage: bootstrap-super-admin.js --clerk-user-id user_...');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const account = await bootstrapSuperAdmin(client, clerkUserId, process.env.BOOTSTRAP_ENV);
    console.log(`Created SUPER_ADMIN account ${account.id} for ${account.clerk_user_id}`);
  } finally {
    await client.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Print only the message: pg errors never include the connection string, but a stack is noise here.
  main(process.argv.slice(2)).catch((err) => {
    console.error(`Bootstrap failed: ${err.message}`);
    process.exit(1);
  });
}
