import { test, expect } from '@playwright/test';
import { toSportMatch } from '../src/features/sports/liveSportMatches.js';
const APP = 'http://127.0.0.1:4176';
const json = body => ({ headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
// Answers GET /api/sports/:sport/matches (backend/src/routes/public.js) with `matches`; returns the requested paths.
async function routeSportMatches(page, matches = []) {
  const calls = [];
  await page.route('http://api.test/api/sports/*/matches', route => { calls.push(new URL(route.request().url()).pathname); return route.fulfill(json({ matches })); });
  return calls;
}
const card = { id: '71', sport: 'football', status: 'LIVE', competition: 'Cup', sides: [{ name: 'Alpha' }, { name: 'Bravo' }], score: [1, 0], format: { model: 'periods', periodCount: 2 }, periods: [{ points: [1, 0], winner: null, current: true }], events: [{ type: 'CARD', side: 0, player: 'Kabir', card: 'yellow' }, { type: 'SUB', side: 1, off: 'Aman', on: 'Rohit' }] };
test('sport route receives real team scores/events, updates its open dialog and moves final matches to Past', async ({ page }) => {
  const errors = [], requests = []; page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(r.url()));
  await routeSportMatches(page);
  let socket; await page.routeWebSocket('ws://api.test/live/home', ws => { socket = ws; });
  await page.goto(APP + '/sports/football/'); await expect.poll(() => Boolean(socket)).toBe(true);
  await expect(page.locator('.sport-card')).toHaveCount(0);
  socket.send(JSON.stringify({ type: 'snapshot', seq: 1, data: [card] }));
  const live = page.locator('#live'); await expect(live.locator('.sport-card')).toHaveCount(1);
  await live.locator('.sport-card-open').click(); const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Yellow card · Kabir'); await expect(dialog).toContainText('Rohit on for Aman');
  await expect(dialog.getByRole('heading', { name: 'Lineups' })).toHaveCount(0);
  socket.send(JSON.stringify({ type: 'snapshot', seq: 2, data: [{ ...card, status: 'APPROVED', winner: 0, score: [2, 0], finalizedAt: '2026-10-20T18:35:00Z', periods: [{ points: [1, 0], winner: 0, current: false }, { points: [1, 0], winner: 0, current: false }] }] }));
  await expect(dialog).toContainText('Alpha won'); await expect(dialog.locator('td strong')).toHaveText(['1', '1']);
  await page.keyboard.press('Escape'); await expect(live.locator('.sport-card')).toHaveCount(0); await expect(page.locator('#past .sport-card')).toHaveCount(1);
  expect(requests.filter(u => u.includes('clerk.'))).toEqual([]); expect(errors).toEqual([]);
});
test('tournament routes read the API once on entry, group by phase, merge only this read\'s cards and show 404', async ({ page }) => {
  const errors = [], calls = [], requests = []; page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(r.url()));
  // Shapes copy backend/src/routes/public.js and the Public_DTO allow-list in backend/src/http.js.
  const cup = { id: '5', slug: 'cup', name: 'Cup', startsOn: '2026-10-20', endsOn: '2026-10-30', status: 'ONGOING', phase: 'live', imageKey: 'court', venue: 'Main ground', description: 'Inter-branch cup.' };
  const match = (id, more) => ({ id, tournamentId: '5', sport: 'football', kind: 'CUSTOM', stage: null, status: 'SCHEDULED', phase: 'upcoming', scheduledAt: '2026-10-25T09:00:00.000Z', venue: 'Main ground', seq: 0, sides: [{ name: 'Alpha' }, { name: 'Bravo' }], ...more });
  const matches = [match('71', { status: 'LIVE', phase: 'live' }), match('72', { stage: 'FINAL', sides: [{ name: 'Alpha' }, { name: null }] }), match('73', { phase: 'past' }), match('74', { sport: 'badminton' })];
  await page.route('http://api.test/api/**', route => {
    const path = new URL(route.request().url()).pathname; calls.push(path);
    const body = path === '/api/tournaments' ? { tournaments: [cup, { ...cup, id: '6', slug: 'old-cup', name: 'Old Cup', status: 'COMPLETED', phase: 'past', imageKey: 'track' }] }
      : path === '/api/tournaments/cup' ? { tournament: { ...cup, sports: ['badminton', 'football'], matches } }
      : { error: { code: 'NOT_FOUND', message: 'Tournament not found', requestId: 'req-test' } };
    return route.fulfill({ status: path.endsWith('/missing') ? 404 : 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
  });
  let socket; await page.routeWebSocket('ws://api.test/live/home', ws => { socket = ws; });
  await page.goto(APP + '/tournaments');
  await expect(page).toHaveTitle('Tournaments | Campuscores');
  await expect(page.locator('#live-tournaments .tournament-card')).toHaveCount(1);
  await expect(page.locator('#past-tournaments .tournament-card')).toHaveCount(1);
  await expect(page.locator('#upcoming-tournaments')).toContainText('Nothing on the calendar yet');
  await page.locator('#live-tournaments .tournament-card').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cup');
  await expect(page.locator('.tournament-facts')).toContainText('Main ground');
  await page.locator('.tournament-sports a[href="/tournaments/cup/football"]').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Football · Cup');
  await expect(page.locator('#live .sport-card')).toHaveCount(1);
  await expect(page.locator('#upcoming .sport-card')).toHaveText(/25 Oct · 14:30 IST · Cup/);
  await expect(page.locator('#upcoming .sport-card')).toContainText('To be decided');
  await expect(page.locator('#past .sport-card')).toContainText('Not scored');
  await expect.poll(() => Boolean(socket)).toBe(true);
  // Card 71 is in this read and turns Final. Card 98 names this tournament but is not in the read yet, so it is
  // appended (Req 17.13). Card 99 names another tournament and must not appear. Card 73 has no tournamentId (an old
  // room snapshot), so it applies only because this read has match 73; SCHEDULED, it keeps the API's past phase
  // (Not scored), since the page has no clock to decide it.
  socket.send(JSON.stringify({ type: 'snapshot', seq: 1, data: [{ ...card, tournamentId: '5', status: 'APPROVED', winner: 0, score: [2, 0], competition: 'Cup' }, { ...card, id: '98', tournamentId: '5', sides: [{ name: 'Delta' }, { name: 'Echo' }] }, { ...card, id: '99', tournamentId: '6' }, { ...card, id: '73', status: 'SCHEDULED', score: [0, 0] }] }));
  await expect(page.locator('#live .sport-card')).toHaveCount(1);
  await expect(page.locator('#live [data-match-id="98"]')).toContainText('Delta');
  await expect(page.locator('#past .sport-card')).toHaveCount(2);
  await expect(page.locator('#past [data-match-id="73"]')).toContainText('Not scored');
  await expect(page.locator('#past [data-match-id="71"]')).toContainText('2–0');
  await expect(page.locator('[data-match-id="99"]')).toHaveCount(0);
  expect(calls).toEqual(['/api/tournaments', '/api/tournaments/cup', '/api/tournaments/cup']);
  await page.goto(APP + '/tournaments/missing');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tournament not found');
  await expect(page.getByRole('main').getByRole('link', { name: 'Return home' })).toHaveAttribute('href', '/');
  // This build has a Clerk key; public tournament pages still load no Clerk code (Req 4.1).
  expect(requests.filter(url => /clerk|AuthArea/i.test(url))).toEqual([]);
  expect(errors).toEqual([]);
});
// Tournament page failure, empty, 404 and Display_Fixtures cases live in public-tournaments.spec.js.
test('tennis public adapter keeps current game, serve, set tie-break and India final date', () => {
  const match = toSportMatch({ ...card, sport: 'lawn-tennis', format: { model: 'tennis' }, gamePoints: ['Ad', '40'], serve: 1, periods: [{ points: [7, 6], tiebreak: [7, 5], winner: 0 }] });
  expect(match.gamePoints).toEqual(['Ad', '40']); expect(match.sides[1].serving).toBe(true); expect(match.periods[0].tiebreak).toEqual([7, 5]);
  const final = toSportMatch({ ...card, status: 'APPROVED', finalizedAt: '2026-10-20T18:35:00Z', winner: 0 });
  expect(final.date).toBe('2026-10-21'); expect(final.winner).toBe(0);
});

test('a custom 15-set final keeps long names and its whole scorecard inside a small phone dialog', async ({ page }) => {
  let socket; await page.routeWebSocket('ws://api.test/live/home', ws => { socket = ws; });
  await routeSportMatches(page);
  await page.setViewportSize({ width: 320, height: 900 }); await page.goto(APP + '/sports/badminton/'); await expect.poll(() => Boolean(socket)).toBe(true);
  socket.send(JSON.stringify({ type: 'snapshot', seq: 1, data: [{ ...card, sport: 'badminton', status: 'APPROVED', winner: 0, sides: [{ name: 'Chattopadhyay / Venkataraghavan' }, { name: 'Bhattacharya / Ramachandran' }], score: [8, 7], format: { model: 'sets', bestOf: 15 }, periods: Array.from({ length: 15 }, (_, i) => ({ points: i % 2 ? [9, 15] : [15, 9], winner: i % 2, current: false })) }] }));
  await page.locator('#past .sport-card-open').click(); const dialog = page.getByRole('dialog');
  const scroll = dialog.getByRole('region', { name: 'Score by set or period, scroll horizontally' }); await expect(scroll).toHaveAttribute('tabindex', '0');
  expect(await scroll.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(await dialog.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
  await expect(dialog.locator('thead th')).toHaveCount(17); await expect(dialog.getByText('Winner', { exact: true })).toBeVisible();
});

test('sport page fills Upcoming and Past from one sports read by API phase, with date chips from the read', async ({ page }) => {
  const errors = [], requests = []; page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(r.url()));
  // Shape copies GET /api/sports/:sport/matches in backend/src/routes/public.js (match DTO plus tournament name and slug).
  const match = (id, more) => ({ id, tournamentId: '5', sport: 'football', kind: 'CUSTOM', stage: null, status: 'SCHEDULED', phase: 'upcoming', scheduledAt: '2026-10-25T09:00:00.000Z', venue: 'Main ground', seq: 0, sides: [{ name: 'Alpha' }, { name: 'Bravo' }], tournamentName: 'Cup', tournamentSlug: 'cup', ...more });
  const calls = await routeSportMatches(page, [
    match('81'), match('82', { scheduledAt: '2026-10-26T04:00:00.000Z', tournamentName: 'Open', stage: 'FINAL', sides: [{ name: 'Alpha' }, { name: null }] }),
    match('83', { phase: 'past', scheduledAt: '2026-10-19T09:00:00.000Z' }),
    match('84', { status: 'APPROVED', phase: 'past', scheduledAt: '2026-10-18T09:00:00.000Z' }),
    // A device-clock-free phase: this match's time is long past, but the API says upcoming, so it stays Upcoming.
    match('85', { phase: 'upcoming', scheduledAt: '2020-01-01T09:00:00.000Z' }),
  ]);
  let socket; await page.routeWebSocket('ws://api.test/live/home', ws => { socket = ws; });
  await page.goto(APP + '/sports/football/');
  const upcoming = page.locator('#upcoming'), past = page.locator('#past');
  await expect(upcoming.locator('.sport-card')).toHaveCount(3);
  await expect(upcoming.locator('[data-match-id="81"]')).toContainText('25 Oct · 14:30 IST · Cup');
  await expect(upcoming.locator('[data-match-id="82"]')).toContainText('To be decided');
  await expect(upcoming.locator('.date-chip')).toHaveText(['All', '1 Jan', '25 Oct', '26 Oct']);
  await upcoming.locator('.date-chip', { hasText: '26 Oct' }).click();
  await expect(upcoming.locator('.sport-card')).toHaveCount(1);
  await expect(upcoming.locator('.date-chip', { hasText: '26 Oct' })).toHaveAttribute('aria-pressed', 'true');
  await expect(past.locator('.sport-card')).toHaveCount(2);
  await expect(past.locator('[data-match-id="83"]')).toContainText('Not scored');
  await expect(past.locator('.date-chip')).toHaveText(['All', '18 Oct', '19 Oct']);
  // Live keeps the home-room cards: a LIVE card for read match 81 moves it to Live; a final card the read lacks joins Past.
  await expect.poll(() => Boolean(socket)).toBe(true);
  await upcoming.locator('.date-chip', { hasText: 'All' }).click();
  socket.send(JSON.stringify({ type: 'snapshot', seq: 1, data: [{ ...card, id: '81', tournamentId: '5' }, { ...card, id: '86', tournamentId: '5', status: 'APPROVED', winner: 0, score: [2, 0], finalizedAt: '2026-10-20T12:00:00Z' }] }));
  await expect(page.locator('#live [data-match-id="81"]')).toHaveCount(1);
  await expect(upcoming.locator('.sport-card')).toHaveCount(2);
  await expect(past.locator('[data-match-id="86"]')).toContainText('2–0');
  await expect(past.locator('.date-chip')).toHaveText(['All', '18 Oct', '19 Oct', '20 Oct']);
  expect(calls).toEqual(['/api/sports/football/matches']);
  expect(requests.filter(url => /clerk|AuthArea/i.test(url))).toEqual([]);
  expect(errors).toEqual([]);
});
test('sport page read failure marks only Upcoming and Past and Try again reads once more', async ({ page }) => {
  let reads = 0;
  await page.route('http://api.test/api/sports/*/matches', route => { reads += 1; return reads === 1 ? route.abort() : route.fulfill(json({ matches: [] })); });
  let socket; await page.routeWebSocket('ws://api.test/live/home', ws => { socket = ws; });
  await page.goto(APP + '/sports/volleyball/');
  await expect(page.locator('#upcoming .sport-empty')).toHaveText('Scores are unavailable right now.');
  await expect(page.locator('#past .sport-empty')).toHaveText('Scores are unavailable right now.');
  await expect.poll(() => Boolean(socket)).toBe(true);
  socket.send(JSON.stringify({ type: 'snapshot', seq: 1, data: [{ ...card, sport: 'volleyball' }] }));
  await expect(page.locator('#live .sport-card')).toHaveCount(1);
  await page.locator('#upcoming').getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('#upcoming .public-empty')).toBeVisible();
  await expect(page.locator('#past .public-empty')).toBeVisible();
  expect(reads).toBe(2);
});
