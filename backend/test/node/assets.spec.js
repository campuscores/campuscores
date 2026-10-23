import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestHarness } from 'wrangler';

// The Workers pool's exports.default.fetch() skips static assets, so this runs the full Wrangler dev routing.
const backendDir = fileURLToPath(new URL('../..', import.meta.url));
const indexHtml = fileURLToPath(new URL('../../../frontend/dist/index.html', import.meta.url));
let harness;

beforeAll(async () => {
  if (!existsSync(indexHtml)) {
    throw new Error('Run `npm run build` at the repo root first (npm run test:backend does this)');
  }
  harness = createTestHarness({ root: backendDir, workers: [{ configPath: './wrangler.jsonc' }] });
  await harness.listen();
});

afterAll(() => harness?.close());

describe('static assets and run_worker_first', () => {
  it('deep link /sports/football returns the built index.html', async () => {
    const res = await harness.fetch('/sports/football', {
      headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('<title>Campuscores</title>');
    expect(html).toContain('id="root"');
  });

  it('/health reaches the Worker', async () => {
    const res = await harness.fetch('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('X-Request-Id')).toBeTruthy();
  });

  it('/api/x returns the JSON Error_Body, not index.html', async () => {
    const res = await harness.fetch('/api/x', { headers: { Accept: 'text/html' } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBe(res.headers.get('X-Request-Id'));
  });
});
