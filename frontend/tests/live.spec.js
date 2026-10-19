import { test, expect } from '@playwright/test';
// Live-mode build (VITE_API_BASE=http://api.test) from the second webServer in playwright.config.js.
const LIVE = 'http://127.0.0.1:4176';
const card = (id, a, b, score) => ({ id, sport: 'football', status: 'LIVE', competition: 'Spring Cup', sides: [{ name: a }, { name: b }], score, clock: null, seq: 1 });
const snapshot = (seq, data) => JSON.stringify({ type: 'snapshot', seq, data });
test.describe('homepage live row', () => {
  let sockets;
  test.beforeEach(async ({ page }) => {
    sockets = [];
    // Fake timers make the reconnect backoff (full jitter, at most 30 s) controllable.
    await page.clock.install();
    await page.routeWebSocket('ws://api.test/live/home', ws => { sockets.push(ws); });
    await page.goto(`${LIVE}/`);
  });
  const status = page => page.locator('#match-filter-status');
  const overview = page => page.locator('.match-card .match-overview');
  const socketCount = n => expect.poll(() => sockets.length).toBe(n);
  async function reconnect(page, n) {
    sockets.at(-1).close();
    await page.clock.fastForward(30000); // fires the pending reconnect timer once
    await socketCount(n);
  }
  test('shows loading, renders the first snapshot, applies newer seq and ignores stale seq', async ({ page }) => {
    await socketCount(1);
    await expect(status(page)).toHaveText('Connecting to live scores…');
    await expect(status(page)).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('.match-card')).toHaveCount(0);
    sockets[0].send(snapshot(5, [card('1', 'Ana', 'Ben', [1, 0])]));
    await expect(overview(page)).toHaveText(['Ana1–0Ben']);
    await expect(status(page)).toHaveText('All Sports: 1 live match.');
    sockets[0].send(snapshot(6, [card('1', 'Ana', 'Ben', [2, 0]), card('2', 'Cy', 'Dee', null)]));
    await expect(overview(page)).toHaveText(['Ana2–0Ben', 'CyVSDee']);
    sockets[0].send(snapshot(6, [card('9', 'Old', 'Same', [0, 0])]));
    sockets[0].send(snapshot(4, [card('9', 'Old', 'Lower', [0, 0])]));
    sockets[0].send('not json');
    // A newer message after the stale ones proves they were processed and discarded.
    sockets[0].send(snapshot(7, [card('1', 'Ana', 'Ben', [3, 0]), card('2', 'Cy', 'Dee', null)]));
    await expect(overview(page)).toHaveText(['Ana3–0Ben', 'CyVSDee']);
  });
  test('a reconnected socket replaces state even with a lower seq', async ({ page }) => {
    await socketCount(1);
    sockets[0].send(snapshot(9, [card('1', 'Ana', 'Ben', [4, 2])]));
    await expect(overview(page)).toHaveText(['Ana4–2Ben']);
    await reconnect(page, 2);
    sockets[1].send(snapshot(1, [card('3', 'Eve', 'Fay', [0, 0])]));
    await expect(overview(page)).toHaveText(['Eve0–0Fay']);
  });
  test('shows the unavailable text after repeated failures and keeps the shell usable', async ({ page }) => {
    await socketCount(1);
    await reconnect(page, 2);
    await reconnect(page, 3);
    await expect(status(page)).toHaveText('Connecting to live scores…');
    sockets[2].close();
    await expect(status(page)).toHaveText('Live scores are unavailable right now.');
    await expect(page.locator('.match-card')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: 'Live Matches' })).toBeVisible();
    await expect(page.locator('header').first()).toBeVisible();
  });
});
test('fixture mode makes no API or live socket request', async ({ page }) => {
  const urls = [];
  page.on('request', request => urls.push(request.url()));
  page.on('websocket', ws => urls.push(ws.url()));
  await page.goto('/');
  await expect(page.locator('.match-card').first()).toBeVisible();
  await expect(page.locator('#match-filter-status')).not.toHaveText(/Connecting|unavailable/);
  await page.waitForLoadState('networkidle');
  expect(urls.filter(url => /\/(api|live)(\/|$)/.test(new URL(url).pathname))).toEqual([]);
});
