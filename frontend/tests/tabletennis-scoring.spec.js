import { test, expect } from '@playwright/test';
import { assignedMatches } from '../src/features/operator/operatorMatches.js';
import { derive, gameWon, alternateServer } from '../src/features/operator/scoring/useSetScoring.js';
import { tableTennisFormat, maxGames } from '../src/features/operator/scoring/scoringConfig.js';

const fmt = tableTennisFormat();
const liveTT = assignedMatches.find(m => m.sport === 'table-tennis' && m.state === 'live');
const schedTT = assignedMatches.find(m => m.sport === 'table-tennis' && m.state === 'scheduled');
const route = m => `/operator/matches/${m.key}/score`;

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

// --- Pure engine checks ---
test('ITTF game-won: 11, win by 2, no cap (deuce continues)', () => {
  expect(gameWon(11, 9, fmt)).toBe(true);
  expect(gameWon(11, 10, fmt)).toBe(false);
  expect(gameWon(12, 10, fmt)).toBe(true);
  expect(gameWon(15, 14, fmt)).toBe(false); // no cap, deuce continues
  expect(gameWon(16, 14, fmt)).toBe(true);
});

test('match is best of 5 (gamesToWin 3 -> 5 game columns)', () => {
  expect(maxGames(fmt)).toBe(5);
});

test('serve alternates every 2 points, every point at deuce', () => {
  // First server 0. Points 0,1 served by 0; 2,3 by 1; 4,5 by 0 ...
  expect(alternateServer(0, 0, fmt, 0)).toBe(0);
  expect(alternateServer(1, 0, fmt, 0)).toBe(0);
  expect(alternateServer(1, 1, fmt, 0)).toBe(1); // 2 points played -> swap
  expect(alternateServer(2, 1, fmt, 0)).toBe(1);
  expect(alternateServer(2, 2, fmt, 0)).toBe(0); // 4 points played -> swap back
  // At deuce (10-10 and beyond) serve swaps every single point, so consecutive totals alternate.
  const atDeuce = [alternateServer(10, 10, fmt, 0), alternateServer(11, 10, fmt, 0), alternateServer(11, 11, fmt, 0)];
  expect(atDeuce[0]).not.toBe(atDeuce[1]);
  expect(atDeuce[1]).not.toBe(atDeuce[2]);
});

test('serve model derives a serving side once a first server is chosen', () => {
  const state = derive([{ type: 'serve', side: 0 }, { type: 'point', side: 1 }], fmt, null);
  expect([0, 1]).toContain(state.serve);
});

// --- UI checks ---
test('live table-tennis match opens at its current score and +1 updates it', async ({ page }) => {
  await page.goto(route(liveTT));
  await expect(page.locator('.scoring-sport')).toContainText('Table Tennis');
  const points0 = page.locator('.score-side').first().locator('.score-points');
  const before = Number(await points0.textContent());
  await page.locator('.point-btn').first().click();
  await expect(points0).toHaveText(String(before + 1));
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(points0).toHaveText(String(before));
});

test('scheduled table-tennis asks who serves first, then scores', async ({ page }) => {
  test.skip(!schedTT, 'no scheduled table-tennis assignment');
  await page.goto(route(schedTT));
  await expect(page.locator('.serve-prompt')).toBeVisible();
  await page.locator('.serve-prompt .score-btn').first().click();
  await expect(page.locator('.point-btn')).toHaveCount(2);
  await page.locator('.point-btn').first().click();
  await expect(page.locator('.score-side').first().locator('.score-points')).toHaveText('1');
});

test('the board shows "to 11" and Finish game dialog uses radios', async ({ page }) => {
  await page.goto(route(liveTT));
  await expect(page.locator('.score-game-no')).toContainText('to 11');
  await page.getByRole('button', { name: 'Finish game' }).click();
  const dialog = page.locator('dialog.scoring-dialog[open]');
  await expect(dialog.locator('input[type="radio"]')).toHaveCount(2);
});

test('layout has no body overflow and 44px point buttons', async ({ page }) => {
  await page.goto(route(liveTT));
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
