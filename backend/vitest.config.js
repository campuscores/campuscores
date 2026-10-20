import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// No Postgres on team devices: without TEST_DATABASE_URL the Hyperdrive bindings are absent and DB suites skip.
const db = process.env.TEST_DATABASE_URL;
// CI sets REQUIRE_DB=1 so a missing database fails the run instead of skipping every DB suite.
if (process.env.REQUIRE_DB === '1' && !db) throw new Error('REQUIRE_DB=1 but TEST_DATABASE_URL is not set');
// Fake Clerk settings: well-formed so @clerk/backend accepts its config; no real instance or secret.
const clerk = {
  CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from('test.clerk.accounts.dev$').toString('base64')}`,
  CLERK_SECRET_KEY: 'sk_test_fake',
  AUTHORIZED_PARTIES: 'http://localhost:4175',
  INVITE_REDIRECT_URL: 'http://localhost:4175/sign-up',
  // Fills process.env.NODE_ENV (nodejs_compat), so @clerk/backend reads the global fetch per call
  // and test/helpers.js stubClerk can intercept Clerk API calls.
  NODE_ENV: 'test',
  ENABLE_TEST_ENGINE: 'true', // legacy cases use Test_Engine; real-format cases turn it off
};
const miniflare = { bindings: clerk, ...(db ? { hyperdrives: { HYPERDRIVE_CACHED: db, HYPERDRIVE_UNCACHED: db } } : {}) };

// shortcut: Vite 8 resolves pg's require() of its dual-format deps to their ESM files in the Workers pool
// (cloudflare/workers-sdk#12984), so pin them to the CommonJS entries; remove when that issue is fixed.
const req = createRequire(import.meta.url);
const pgCjs = ['pg-protocol', 'pg-connection-string', 'pg-pool'].map((name) => ({
  find: new RegExp(`^${name}$`),
  replacement: req.resolve(name),
}));
pgCjs.push({
  find: /^pg-cloudflare$/, // its "workerd" CommonJS entry; Node resolution would pick the empty stub
  replacement: join(dirname(req.resolve('pg-cloudflare/package.json')), 'dist/index.js'),
});

export default defineConfig({
  resolve: { alias: pgCjs },
  test: {
    projects: [
      {
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' }, miniflare })],
        test: { name: 'workers', include: ['test/*.spec.js'] },
      },
      {
        // Static-asset routing runs through Wrangler's dev harness; the Workers pool skips assets.
        test: {
          name: 'node',
          include: ['test/node/*.spec.js'],
          environment: 'node',
          testTimeout: 60000,
          hookTimeout: 60000,
        },
      },
    ],
  },
});
