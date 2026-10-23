import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { withClient, withTx } from '../src/db.js';

// Collects waitUntil promises so each test can await client.end().
const testCtx = () => {
  const pending = [];
  return { waitUntil: (p) => pending.push(p), done: () => Promise.all(pending) };
};

describe('withTx statement order', () => {
  const recorder = (failOn) => ({
    sql: [],
    async query(text) {
      this.sql.push(text);
      if (text === failOn) throw new Error('boom');
    },
  });

  it('commits and returns the callback result', async () => {
    const client = recorder();
    expect(await withTx(client, async (c) => (await c.query('WORK'), 7))).toBe(7);
    expect(client.sql).toEqual(['BEGIN', 'WORK', 'COMMIT']);
  });

  it('rolls back and rethrows when the callback fails', async () => {
    const client = recorder('WORK');
    await expect(withTx(client, (c) => c.query('WORK'))).rejects.toThrow('boom');
    expect(client.sql).toEqual(['BEGIN', 'WORK', 'ROLLBACK']);
  });
});

// Needs TEST_DATABASE_URL (CI Postgres or a personal Neon branch); see vitest.config.js.
describe.skipIf(!env.HYPERDRIVE_UNCACHED)('database helpers against Postgres', () => {
  it('both bindings reach the database', async () => {
    const ctx = testCtx();
    for (const hd of [env.HYPERDRIVE_CACHED, env.HYPERDRIVE_UNCACHED]) {
      const { rows } = await withClient(hd, ctx, (c) => c.query('SELECT 1 AS ok'));
      expect(rows).toEqual([{ ok: 1 }]);
    }
    await ctx.done();
  });

  it('commits on success and rolls back on failure', async () => {
    const ctx = testCtx();
    const kept = await withClient(env.HYPERDRIVE_UNCACHED, ctx, async (client) => {
      // A temp table lives only in this session, so the test leaves no rows behind.
      await client.query('CREATE TEMP TABLE db_helper_probe (n int)');
      await withTx(client, (c) => c.query('INSERT INTO db_helper_probe VALUES (1)'));
      await expect(
        withTx(client, async (c) => {
          await c.query('INSERT INTO db_helper_probe VALUES (2)');
          throw new Error('abort');
        }),
      ).rejects.toThrow('abort');
      const { rows } = await client.query('SELECT n FROM db_helper_probe');
      return rows.map((r) => r.n);
    });
    expect(kept).toEqual([1]);
    await ctx.done();
  });
});

// 20261022090000_manager_scope rules, against the migrated, seeded CI Postgres (db/seed/fake.sql IDs).
// DB-gated like the other database suites: they run with REQUIRE_DB=1 in the deploy gate and skip locally
// without a database. Each case runs its statements in a transaction that always rolls back, so one failure
// never poisons the connection and no case mutates shared state.
const UNIQUE = '23505'; // unique_violation
const CHECK = '23514'; // check_violation
const NOT_NULL = '23502'; // not_null_violation
const rollback = new Error('rollback');

const testCtxGate = () => {
  const pending = [];
  return { waitUntil: (p) => pending.push(p), done: () => Promise.all(pending) };
};

// Runs each statement in order in one never-committed transaction. Returns the last statement's
// { rows } when all succeed, or { err } for the database error that aborted the transaction.
const inRolledBackTx = async (...statements) => {
  const ctx = testCtxGate();
  let out;
  const err = await withClient(env.HYPERDRIVE_UNCACHED, ctx, (client) =>
    withTx(client, async (c) => {
      for (const [sql, params = []] of statements) out = await c.query(sql, params);
      throw rollback;
    }).catch((e) => e),
  );
  await ctx.done();
  return err === rollback ? { rows: out.rows } : { err };
};

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('manager_scope migration constraints', () => {
  const tournament = (status, slug) =>
    inRolledBackTx([
      `INSERT INTO tournaments (slug, name, status, owner_account_id) VALUES ($1, 'Rule Check (fake)', $2, 1)`,
      [slug, status],
    ]);

  it('tournaments_status rejects a status outside the allowed set', async () => {
    const { err } = await tournament('PUBLISHED', 'rule-published');
    expect(err).toMatchObject({ code: CHECK, constraint: 'tournaments_status' });
  });

  it('tournaments_status rejects any other unknown status', async () => {
    const { err } = await tournament('WHATEVER', 'rule-whatever');
    expect(err).toMatchObject({ code: CHECK, constraint: 'tournaments_status' });
  });

  it('tournaments_status accepts each allowed status', async () => {
    for (const status of ['DRAFT', 'ONGOING', 'COMPLETED', 'ARCHIVED']) {
      const { err } = await tournament(status, `rule-${status.toLowerCase()}`);
      expect(err).toBeUndefined();
    }
  });

  it('tournaments_slug rejects an uppercase slug', async () => {
    const { err } = await tournament('DRAFT', 'Rule-Upper');
    expect(err).toMatchObject({ code: CHECK, constraint: 'tournaments_slug' });
  });

  it('tournaments_slug rejects leading, trailing and doubled hyphens', async () => {
    for (const slug of ['-rule', 'rule-', 'rule--cup']) {
      const { err } = await tournament('DRAFT', slug);
      expect(err).toMatchObject({ code: CHECK, constraint: 'tournaments_slug' });
    }
  });

  it('tournaments_slug rejects an all-digit slug (must contain a letter)', async () => {
    const { err } = await tournament('DRAFT', '2026');
    expect(err).toMatchObject({ code: CHECK, constraint: 'tournaments_slug' });
  });

  it('tournaments_slug accepts a valid slug', async () => {
    const { err } = await tournament('DRAFT', 'rule-cup-2026');
    expect(err).toBeUndefined();
  });

  it('no PUBLISHED status remains after the migration', async () => {
    const ctx = testCtxGate();
    const { rows } = await withClient(env.HYPERDRIVE_UNCACHED, ctx, (c) =>
      c.query(`SELECT count(*)::int AS n FROM tournaments WHERE status = 'PUBLISHED'`),
    );
    await ctx.done();
    expect(rows).toEqual([{ n: 0 }]);
  });

  it('every tournament has a non-null owner_account_id', async () => {
    const ctx = testCtxGate();
    const { rows } = await withClient(env.HYPERDRIVE_UNCACHED, ctx, (c) =>
      c.query('SELECT count(*)::int AS n FROM tournaments WHERE owner_account_id IS NULL'),
    );
    await ctx.done();
    expect(rows).toEqual([{ n: 0 }]);
  });

  it('owner_account_id NOT NULL rejects an insert with no owner', async () => {
    const { err } = await inRolledBackTx([
      `INSERT INTO tournaments (slug, name, status, owner_account_id) VALUES ('rule-no-owner', 'No Owner (fake)', 'DRAFT', NULL)`,
    ]);
    expect(err).toMatchObject({ code: NOT_NULL, column: 'owner_account_id' });
  });

  it('image_key rejects a value outside the Venue_Library keys', async () => {
    const { err } = await inRolledBackTx([
      `INSERT INTO tournaments (slug, name, status, owner_account_id, image_key)
       VALUES ('rule-image', 'Image (fake)', 'DRAFT', 1, 'pool')`,
    ]);
    expect(err).toMatchObject({ code: CHECK, constraint: 'tournaments_image_key_check' });
  });

  it('image_key accepts an allowed value', async () => {
    const { err } = await inRolledBackTx([
      `INSERT INTO tournaments (slug, name, status, owner_account_id, image_key)
       VALUES ('rule-image-ok', 'Image Ok (fake)', 'DRAFT', 1, 'stadium')`,
    ]);
    expect(err).toBeUndefined();
  });

  // Seed tournament_sport 2 (badminton) has no seeded teams, so these inserts do not collide.
  it('teams_unique_name rejects a duplicate differing only in case and outer spaces', async () => {
    const { err } = await inRolledBackTx(
      [`INSERT INTO teams (tournament_sport_id, label) VALUES (2, 'Hostel A')`],
      [`INSERT INTO teams (tournament_sport_id, label) VALUES (2, ' hostel a ')`],
    );
    expect(err).toMatchObject({ code: UNIQUE, constraint: 'teams_unique_name' });
  });

  it('teams_unique_name allows the same name in a different tournament sport', async () => {
    const { err } = await inRolledBackTx(
      [`INSERT INTO teams (tournament_sport_id, label) VALUES (2, 'Hostel A')`],
      [`INSERT INTO teams (tournament_sport_id, label) VALUES (1, ' hostel a ')`],
    );
    expect(err).toBeUndefined();
  });

  it('teams_year rejects a college year below 1 and above 4, and a calendar year', async () => {
    for (const year of [0, 5, 2026]) {
      const { err } = await inRolledBackTx([
        `INSERT INTO teams (tournament_sport_id, label, year) VALUES (2, 'Year Edge (fake)', $1)`,
        [year],
      ]);
      expect(err).toMatchObject({ code: CHECK, constraint: 'teams_year' });
    }
  });

  it('teams_year accepts the 1 and 4 boundaries', async () => {
    for (const year of [1, 4]) {
      const { err } = await inRolledBackTx([
        `INSERT INTO teams (tournament_sport_id, label, year) VALUES (2, 'Year Ok (fake)', $1)`,
        [year],
      ]);
      expect(err).toBeUndefined();
    }
  });

  it('teams accepts a null branch and year (both now nullable)', async () => {
    const { err } = await inRolledBackTx([
      `INSERT INTO teams (tournament_sport_id, label, branch, year) VALUES (2, 'Null Details (fake)', NULL, NULL)`,
    ]);
    expect(err).toBeUndefined();
  });

  it('players jsonb rejects 31 entries and accepts 30', async () => {
    const roster = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ name: `P${i}` })));
    const insert = `INSERT INTO teams (tournament_sport_id, label, players) VALUES (2, 'Roster (fake)', $1::jsonb)`;
    const over = await inRolledBackTx([insert, [roster(31)]]);
    expect(over.err).toMatchObject({ code: CHECK, table: 'teams' });
    const ok = await inRolledBackTx([insert, [roster(30)]]);
    expect(ok.err).toBeUndefined();
  });

  it('players jsonb rejects a non-array value', async () => {
    const { err } = await inRolledBackTx([
      `INSERT INTO teams (tournament_sport_id, label, players) VALUES (2, 'Not Array (fake)', '{}'::jsonb)`,
    ]);
    expect(err).toMatchObject({ code: CHECK, table: 'teams' });
  });

  // admin_accounts: a unique partial index on email WHERE status = 'ACTIVE', plus the email = lower(email) CHECK.
  const account = (clerkId, status, email) =>
    `INSERT INTO admin_accounts (clerk_user_id, role, status, email)
     VALUES ('${clerkId}', 'MATCH_OPERATOR', '${status}', '${email}')`;

  it('one_active_account_email rejects a second ACTIVE row with the same email', async () => {
    const { err } = await inRolledBackTx(
      [account('rule_active_1', 'ACTIVE', 'rule-dup@example.test')],
      [account('rule_active_2', 'ACTIVE', 'rule-dup@example.test')],
    );
    expect(err).toMatchObject({ code: UNIQUE, constraint: 'one_active_account_email' });
  });

  it('one_active_account_email allows a DISABLED row with the same email as an ACTIVE row', async () => {
    const { err } = await inRolledBackTx(
      [account('rule_active_3', 'ACTIVE', 'rule-reuse@example.test')],
      [account('rule_disabled_1', 'DISABLED', 'rule-reuse@example.test')],
    );
    expect(err).toBeUndefined();
  });

  it('admin_accounts email CHECK rejects a mixed-case email', async () => {
    const { err } = await inRolledBackTx([account('rule_mixed', 'ACTIVE', 'Rule-Mixed@example.test')]);
    expect(err).toMatchObject({ code: CHECK, table: 'admin_accounts' });
  });
});
