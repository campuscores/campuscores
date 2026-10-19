import { test, expect } from '@playwright/test';
import { assignedMatches } from '../src/features/operator/operatorMatches.js';
import { derive, gameWon } from '../src/features/operator/scoring/useSetScoring.js';
import { volleyballFormat, maxGames, targetFor } from '../src/features/operator/scoring/scoringConfig.js';

const fmt = volleyballFormat();
const liveVB = assignedMatches.find(m => m.sport === 'volleyball' && m.state === 'live');
const schedVB = assignedMatches.find(m => m.sport === 'volleyball' && m.state === 'scheduled');
const route = m => `/operator/matches/${m.key}/score`;

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

// --- Pure engine checks ---
test('FIVB set-won: 25, win by 2, no cap for sets 1-4', () => {
  expect(gameWon(25, 23, fmt, 0)).toBe(true);
  expect(gameWon(25, 24, fmt, 0)).toBe(false);
  expect(gameWon(26, 24, fmt, 0)).toBe(true);
  expect(gameWon(30, 29, fmt, 0)).toBe(false); // no cap
});

test('deciding 5th set is played to 15', () => {
  expect(maxGames(fmt)).toBe(5);
  expect(targetFor(fmt, 4)).toBe(15); // index 4 = 5th set
  expect(targetFor(fmt, 0)).toBe(25);
  expect(gameWon(15, 13, fmt, 4)).toBe(true);
  expect(gameWon(15, 14, fmt, 4)).toBe(false);
  expect(gameWon(14, 12, fmt, 4)).toBe(false); // not yet 15
});

test('match ends at 3 sets and ignores later points', () => {
  const win25 = side => Array.from({ length: 25 }, () => ({ type: 'point', side }));
  const actions = [...win25(0), ...win25(0), ...win25(0)];
  const state = derive(actions, fmt, 0);
  expect(state.score).toEqual([3, 0]);
  expect(state.winner).toBe(0);
});

// --- UI checks ---
test('live volleyball opens at its current set score and +1 updates it', async ({ page }) => {
  await page.goto(route(liveVB));
  await expect(page.locator('.scoring-sport')).toContainText('Volleyball');
  await expect(page.locator('.score-game-no')).toContainText('to 25');
  const points0 = page.locator('.score-side').first().locator('.score-points');
  const before = Number(await points0.textContent());
  await page.locator('.point-btn').first().click();
  await expect(points0).toHaveText(String(before + 1));
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(points0).toHaveText(String(before));
});

test('scheduled volleyball asks who serves first, then scores', async ({ page }) => {
  test.skip(!schedVB, 'no scheduled volleyball assignment');
  await page.goto(route(schedVB));
  await expect(page.locator('.serve-prompt')).toBeVisible();
  await page.locator('.serve-prompt .score-btn').first().click();
  await expect(page.locator('.point-btn')).toHaveCount(2);
  await page.locator('.point-btn').first().click();
  await expect(page.locator('.score-side').first().locator('.score-points')).toHaveText('1');
});

test('the set table shows five set columns', async ({ page }) => {
  await page.goto(route(liveVB));
  await expect(page.locator('.score-table thead th')).toHaveCount(maxGames(fmt) + 2); // side + 5 sets + total
  await expect(page.locator('.scoring-action', { hasText: 'Finish set' })).toBeVisible();
});

test('layout has no body overflow and 44px point buttons', async ({ page }) => {
  await page.goto(route(liveVB));
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      small: [...document.querySelectorAll('.point-btn, .scoring-action, .scoring-back')].filter(el => {
        const b = el.getBoundingClientRect();
        return el.getClientRects().length && b.height < 44;
      }).length,
    }));
    expect(geometry, `at ${width}px`).toEqual({ overflow: false, small: 0 });
  }
});
