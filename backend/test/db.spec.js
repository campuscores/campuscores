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
