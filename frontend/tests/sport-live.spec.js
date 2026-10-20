import { test, expect } from '@playwright/test';
import { toSportMatch } from '../src/features/sports/liveSportMatches.js';
const APP = 'http://127.0.0.1:4176';
const card = { id: '71', sport: 'football', status: 'LIVE', competition: 'Cup', sides: [{ name: 'Alpha' }, { name: 'Bravo' }], score: [1, 0], format: { model: 'periods', periodCount: 2 }, periods: [{ points: [1, 0], winner: null, current: true }], events: [{ type: 'CARD', side: 0, player: 'Kabir', card: 'yellow' }, { type: 'SUB', side: 1, off: 'Aman', on: 'Rohit' }] };
test('sport route receives real team scores/events, updates its open dialog and moves final matches to Past', async ({ page }) => {
  const errors = [], requests = []; page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(r.url()));
  let socket; await page.routeWebSocket('ws://api.test/live/home', ws => { socket = ws; });
  await page.goto(APP + '/sports/football/'); await expect.poll(() => Boolean(socket)).toBe(true);
  await expect(page.locator('.sport-card')).toHaveCount(0);
  socket.send(JSON.stringify({ type: 'snapshot', seq: 1, data: [card] }));
  const live = page.locator('#live'); await expect(live.locator('.sport-card')).toHaveCount(1);
  await live.locator('.sport-card-open').click(); const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Yellow card · Kabir'); await expect(dialog).toContainText('Rohit on for Aman');
  await expect(dialog.getByRole('heading', { name: 'Lineups' })).toHaveCount(0);
  socket.send(JSON.stringify({ type: 'snapshot', seq: 2, data: [{ ...card, status: 'APPROVED', winner: 0, score: [2, 0], finalizedAt: '2026-10-20T18:35:00Z', periods: [{ points: [1, 0], winner: 0, current: false }, { points: [1, 0], winner: 0, current: false }] }] }));
  await expect(dialog).toContainText('Final · Alpha won 2–0'); await expect(dialog.locator('td strong')).toHaveText(['1', '1']);
  await page.keyboard.press('Escape'); await expect(live.locator('.sport-card')).toHaveCount(0); await expect(page.locator('#past .sport-card')).toHaveCount(1);
  expect(requests.filter(u => u.includes('clerk.'))).toEqual([]); expect(errors).toEqual([]);
});
test('tennis public adapter keeps current game, serve, set tie-break and India final date', () => {
  const match = toSportMatch({ ...card, sport: 'lawn-tennis', format: { model: 'tennis' }, gamePoints: ['Ad', '40'], serve: 1, periods: [{ points: [7, 6], tiebreak: [7, 5], winner: 0 }] });
  expect(match.gamePoints).toEqual(['Ad', '40']); expect(match.sides[1].serving).toBe(true); expect(match.periods[0].tiebreak).toEqual([7, 5]);
  const final = toSportMatch({ ...card, status: 'APPROVED', finalizedAt: '2026-10-20T18:35:00Z', winner: 0 });
  expect(final.date).toBe('2026-10-21'); expect(final.winner).toBe(0);
});

test('a custom 15-set final keeps long names and its whole scorecard inside a small phone dialog', async ({ page }) => {
  let socket; await page.routeWebSocket('ws://api.test/live/home', ws => { socket = ws; });
  await page.setViewportSize({ width: 320, height: 900 }); await page.goto(APP + '/sports/badminton/'); await expect.poll(() => Boolean(socket)).toBe(true);
  socket.send(JSON.stringify({ type: 'snapshot', seq: 1, data: [{ ...card, sport: 'badminton', status: 'APPROVED', winner: 0, sides: [{ name: 'Chattopadhyay / Venkataraghavan' }, { name: 'Bhattacharya / Ramachandran' }], score: [8, 7], format: { model: 'sets', bestOf: 15 }, periods: Array.from({ length: 15 }, (_, i) => ({ points: i % 2 ? [9, 15] : [15, 9], winner: i % 2, current: false })) }] }));
  await page.locator('#past .sport-card-open').click(); const dialog = page.getByRole('dialog');
  const scroll = dialog.getByRole('region', { name: 'Score by set or period, scroll horizontally' }); await expect(scroll).toHaveAttribute('tabindex', '0');
  expect(await scroll.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(await dialog.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
  await expect(dialog.locator('thead th')).toHaveCount(17); await expect(dialog.getByText('Winner', { exact: true })).toBeVisible();
});
