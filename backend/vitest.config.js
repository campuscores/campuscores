import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
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
