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
  test('real per-set scores become a visible locked result in Final Results', async ({ page }) => {
    await socketCount(1);
    const match = { ...card('7', 'Alpha', 'Bravo', [1, 0]), sport: 'badminton', format: { model: 'sets', bestOf: 3 }, periods: [{ points: [21, 19], winner: 0, current: false }, { points: [9, 8], winner: null, current: true }] };
    sockets[0].send(snapshot(1, [match]));
    const live = page.getByRole('region', { name: 'Live Matches', exact: true });
    await expect(live.locator('.match-card')).toHaveCount(1);
    await expect(live.locator('tbody tr').first().locator('td')).toHaveText(['21', '9', '1']);
    await expect(live.locator('tbody tr').first().locator('strong')).toHaveText('21');
    sockets[0].send(snapshot(2, [{ ...match, status: 'APPROVED', score: [2, 0], winner: 0, periods: [match.periods[0], { points: [21, 10], winner: 0, current: false }] }]));
    await expect(live.locator('.match-card')).toHaveCount(0);
    const finals = page.getByRole('region', { name: 'Final Results', exact: true });
    await expect(finals.locator('.match-clock')).toHaveText('Final · Alpha won');
    await expect(finals.locator('tbody tr').first().locator('td')).toHaveText(['21', '21', '2']);
    await page.locator('.sports-nav [data-sport="basketball"]').click();
    await expect(finals.locator('.match-card')).toHaveCount(1);
  });
  test('a live card opens the match dialog, follows new snapshots and Escape closes it', async ({ page }) => {
    await socketCount(1);
    sockets[0].send(snapshot(1, [card('1', 'Ana', 'Ben', [1, 0])]));
    const open = page.getByRole('button', { name: 'Open match details: Ana vs Ben' });
    await open.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('#sport-dialog-title')).toHaveText('Ana1–0Ben');
    sockets[0].send(snapshot(2, [card('1', 'Ana', 'Ben', [2, 0])]));
    await expect(dialog.locator('#sport-dialog-title')).toHaveText('Ana2–0Ben');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();
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
test.describe('homepage tournament row', () => {
  const json = body => ({ headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
  // Shape copies GET /api/tournaments in backend/src/routes/public.js.
  const cup = { id: '5', slug: 'cup', name: 'Cup', startsOn: '2026-10-20', endsOn: '2026-10-30', status: 'ONGOING', phase: 'live', imageKey: 'court', venue: null, description: null };
  const row = page => page.locator('#tournaments');
  test('shows only API Live tournaments, linked by slug, from one read', async ({ page }) => {
    const calls = [];
    // The second tournament's dates cover today, but its API phase is upcoming, so device time must not show it.
    await page.route('http://api.test/api/tournaments', route => { calls.push(route.request().url()); return route.fulfill(json({ tournaments: [cup, { ...cup, id: '6', slug: 'later', name: 'Later', startsOn: '2000-01-01', endsOn: '2999-12-31', phase: 'upcoming' }, { ...cup, id: '7', slug: 'old', name: 'Old', phase: 'past' }] })); });
    await page.goto(`${LIVE}/`);
    await expect(row(page).locator('.tournament-card')).toHaveCount(1);
    await expect(row(page).locator('.tournament-card')).toHaveAttribute('href', '/tournaments/cup');
    await expect(row(page).locator('.tournament-card h3')).toHaveText('Cup');
    await expect(row(page).locator('img')).toHaveAttribute('src', '/assets/tournament-court.webp');
    expect(calls).toHaveLength(1);
  });
  test('keeps the heading with the empty message when none are live', async ({ page }) => {
    await page.route('http://api.test/api/tournaments', route => route.fulfill(json({ tournaments: [{ ...cup, phase: 'past' }] })));
    await page.goto(`${LIVE}/`);
    await expect(row(page).getByRole('heading', { level: 2, name: 'Tournaments' })).toBeVisible();
    await expect(row(page)).toContainText('No tournaments just yet');
    await expect(row(page).locator('.tournament-card')).toHaveCount(0);
  });
  test('a failed read shows the unavailable message in the row only and Try again reads once more', async ({ page }) => {
    let reads = 0;
    await page.route('http://api.test/api/tournaments', route => { reads += 1; return reads === 1 ? route.abort() : route.fulfill(json({ tournaments: [cup] })); });
    await page.goto(`${LIVE}/`);
    await expect(row(page).getByRole('status')).toHaveText('Scores are unavailable right now.');
    await expect(page.getByRole('heading', { level: 2, name: 'Live Matches' })).toBeVisible();
    await row(page).getByRole('button', { name: 'Try again' }).click();
    await expect(row(page).locator('.tournament-card')).toHaveCount(1);
    expect(reads).toBe(2);
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


test('the homepage dialog reads match facts once and keeps live scores current', async ({ page }) => {
  const calls = [];
  await page.route('http://api.test/api/matches/71', route => {
    calls.push(route.request().url());
    return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ match: { id: '71', tournamentId: '5', sport: 'badminton', status: 'LIVE', stage: 'SF1', scheduledAt: '2026-10-25T09:00:00.000Z', venue: 'Court 2', sides: [{ name: 'Ana' }, { name: 'Ben' }] } }) });
  });
  let socket;
  await page.routeWebSocket('ws://api.test/live/home', ws => { socket = ws; });
  await page.goto(`${LIVE}/`);
  await expect.poll(() => Boolean(socket)).toBe(true);
  const match = { ...card('71', 'Ana', 'Ben', [1, 0]), sport: 'badminton', format: { model: 'sets', bestOf: 3 }, periods: [{ points: [21, 18], winner: 0 }, { points: [19, 17], current: true }] };
  socket.send(snapshot(1, [match]));
  await page.getByRole('button', { name: 'Open match details: Ana vs Ben' }).click();
  const details = page.getByRole('dialog');
  await expect.poll(() => calls.length).toBe(1);
  await expect(details.locator('.sport-info dd')).toHaveText(['25 Oct', '14:30 IST', 'Spring Cup', 'SF1 (Semi-final 1)', 'Court 2']);
  await expect(details.locator('.sport-dialog-status')).toHaveText('Live · Game 2 · 19–17');
  await expect(details.locator('thead th')).toHaveText(['Team and players', 'G1', 'G2', 'G3', 'Games']);
  socket.send(snapshot(2, [{ ...match, periods: [match.periods[0], { points: [20, 17], current: true }] }]));
  await expect(details.locator('.sport-dialog-status')).toHaveText('Live · Game 2 · 20–17');
  expect(calls).toHaveLength(1);
  await page.keyboard.press('Escape');
  await expect(details).toBeHidden();
});
