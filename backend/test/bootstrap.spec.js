import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { bootstrapSuperAdmin, isClerkUserId } from '../scripts/bootstrap-super-admin.js';
import { db, one } from './helpers.js';
const probeId = () => `user_probe${crypto.randomUUID().replaceAll('-', '')}`;
describe('isClerkUserId', () => {
  it('accepts user_ IDs and rejects anything else', () => {
    expect(isClerkUserId('user_2abcXYZ09')).toBe(true);
    for (const bad of [undefined, '', 'user_', 'user_a-b', "user_x'; DROP TABLE admin_accounts;--", 'org_abc', ' user_abc']) {
      expect(isClerkUserId(bad), String(bad)).toBe(false);
    }
  });
});
describe.skipIf(!env.HYPERDRIVE_UNCACHED)('bootstrapSuperAdmin against the seed', () => {
  it('refuses while an active SUPER_ADMIN exists and changes no row', async () => {
    const clerkUserId = probeId();
    await expect(db((c) => bootstrapSuperAdmin(c, clerkUserId))).rejects.toThrow('An active SUPER_ADMIN already exists');
    // Other suites write concurrently, so check this run's rows rather than table counts.
    const { rows } = await db((c) =>
      c.query(
        `SELECT (SELECT count(*) FROM admin_accounts WHERE clerk_user_id = $1)::int AS accounts,
                (SELECT count(*) FROM admin_audit_log WHERE after->>'clerkUserId' = $1)::int AS audits`,
        [clerkUserId],
      ),
    );
    expect(rows[0]).toEqual({ accounts: 0, audits: 0 });
  });

  it('creates one active SUPER_ADMIN and an audit row when none exists', async () => {
    const clerkUserId = probeId();
    // The seed Super Admin is disabled in an outer transaction that always rolls back; the script's own
    // BEGIN/COMMIT become a savepoint, so no other suite ever sees the empty state or the new row.
    const SAVEPOINT = { BEGIN: 'SAVEPOINT boot', COMMIT: 'RELEASE SAVEPOINT boot', ROLLBACK: 'ROLLBACK TO SAVEPOINT boot' };
    await db(async (client) => {
      const nested = { query: (text, params) => client.query(SAVEPOINT[text] ?? text, params) };
      await client.query('BEGIN');
      try {
        // The script's lock, taken first so this transaction never upgrades a lock while others wait.
        await client.query('LOCK TABLE admin_accounts IN SHARE ROW EXCLUSIVE MODE');
        await client.query(`UPDATE admin_accounts SET status = 'DISABLED' WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE'`);
        const account = await bootstrapSuperAdmin(nested, clerkUserId);
        expect(account).toMatchObject({ clerk_user_id: clerkUserId, role: 'SUPER_ADMIN', status: 'ACTIVE' });
        const { rows } = await client.query(`SELECT clerk_user_id FROM admin_accounts WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE'`);
        expect(rows).toEqual([{ clerk_user_id: clerkUserId }]);
        const audit = await client.query(`SELECT actor_label, entity FROM admin_audit_log WHERE action = 'SUPER_ADMIN_BOOTSTRAPPED' AND entity_id = $1`, [
          account.id,
        ]);
        expect(audit.rows).toEqual([{ actor_label: 'bootstrap-workflow', entity: 'admin_accounts' }]);
        // A second run now finds the new Super Admin.
        await expect(bootstrapSuperAdmin(nested, probeId())).rejects.toThrow('An active SUPER_ADMIN already exists');
      } finally {
        await client.query('ROLLBACK');
      }
    });
    expect(await one(`SELECT status FROM admin_accounts WHERE clerk_user_id = 'test_super_admin'`)).toEqual({ status: 'ACTIVE' });
    expect(await one('SELECT count(*)::int AS n FROM admin_accounts WHERE clerk_user_id = $1', [clerkUserId])).toEqual({ n: 0 });
  });
});
