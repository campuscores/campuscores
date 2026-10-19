import { test, expect } from '@playwright/test';
import { assignedMatches } from '../src/features/operator/operatorMatches.js';
import { derive, normalGameWon, tiebreakWon } from '../src/features/operator/scoring/useTennisScoring.js';
import { tennisFormat, maxSets } from '../src/features/operator/scoring/scoringConfig.js';

const fmt = tennisFormat();
const liveTN = assignedMatches.find(m => m.sport === 'lawn-tennis' && m.state === 'live');
const schedTN = assignedMatches.find(m => m.sport === 'lawn-tennis' && m.state === 'scheduled');
const route = m => `/operator/matches/${m.key}/score`;
const pts = (side, n) => Array.from({ length: n }, () => ({ type: 'point', side }));

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

// --- Pure engine checks ---
test('advantage game: must reach 4 with a 2-point lead', () => {
  expect(normalGameWon(4, 2, fmt)).toBe(true);
  expect(normalGameWon(4, 3, fmt)).toBe(false); // deuce/advantage continues
  expect(normalGameWon(5, 3, fmt)).toBe(true);
});

test('7-point tiebreak: win by 2', () => {
  expect(tiebreakWon(7, 5, fmt)).toBe(true);
  expect(tiebreakWon(7, 6, fmt)).toBe(false);
  expect(tiebreakWon(8, 6, fmt)).toBe(true);
});

test('points roll into games into sets; 6-0 6-0 wins best of 3', () => {
  // Win 12 straight games (4 points each) -> 6-0, 6-0 -> match to side 0.
  const actions = pts(0, 4 * 12);
  const state = derive(actions, fmt, 0);
  expect(state.score).toEqual([2, 0]);
  expect(state.winner).toBe(0);
});

test('game score labels show 0/15/30/40 and the point rolls into a game', () => {
  const state = derive(pts(0, 3), fmt, 0); // 3 points -> 40
  expect(state.gameLabels[0]).toBe('40');
  expect(state.setGames[0]).toBe(0); // not yet a game (need 4 with lead)
  const won = derive(pts(0, 4), fmt, 0);
  expect(won.setGames[0]).toBe(1); // 4th point closes the game
});

test('6-6 triggers a tiebreak', () => {
  // Alternate winning games to reach 6-6: 12 games split evenly.
  const actions = [];
  for (let g = 0; g < 6; g++) { actions.push(...pts(0, 4)); actions.push(...pts(1, 4)); }
  const state = derive(actions, fmt, 0);
  expect(state.setGames).toEqual([6, 6]);
  expect(state.inTiebreak).toBe(true);
});

// --- UI checks ---
test('live tennis opens at its current games and shows set columns', async ({ page }) => {
  await page.goto(route(liveTN));
  await expect(page.locator('.scoring-sport')).toContainText('Tennis');
  await expect(page.locator('.score-table thead th')).toHaveCount(maxSets(fmt) + 2);
});

test('tennis +1 adds a point and undo reverts it', async ({ page }) => {
  test.skip(!schedTN, 'no scheduled tennis assignment');
  await page.goto(route(schedTN));
  await page.locator('.serve-prompt .score-btn').first().click();
  await page.locator('.point-btn').first().click();
  await expect(page.locator('.score-points').first()).toHaveText('15');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.score-points').first()).toHaveText('0');
});

test('layout has no body overflow and 44px point buttons', async ({ page }) => {
  await page.goto(route(liveTN));
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
