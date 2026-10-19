import { test, expect } from '@playwright/test';
import { assignedMatches } from '../src/features/operator/operatorMatches.js';
import { derive, gameWon } from '../src/features/operator/scoring/useSetScoring.js';
import { badmintonFormat, maxGames } from '../src/features/operator/scoring/scoringConfig.js';

const fmt = badmintonFormat();
const liveBad = assignedMatches.find(m => m.sport === 'badminton' && m.state === 'live');
const route = m => `/operator/matches/${m.key}/score`;

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

// --- Pure engine checks (no browser) ---
test('game-won logic follows BWF 21 / win-by-2 / cap 30', () => {
  expect(gameWon(21, 19, fmt)).toBe(true);
  expect(gameWon(21, 20, fmt)).toBe(false);   // must lead by 2
  expect(gameWon(22, 20, fmt)).toBe(true);
  expect(gameWon(30, 29, fmt)).toBe(true);    // cap: 1-point lead wins at 30
  expect(gameWon(20, 18, fmt)).toBe(false);   // not yet at 21
});

test('match ends at gamesToWin and ignores later actions', () => {
  const win21 = side => Array.from({ length: 21 }, () => ({ type: 'point', side }));
  const actions = [...win21(0), ...win21(0), ...win21(1)]; // 0 wins two straight games
  const state = derive(actions, fmt, 0);
  expect(state.score).toEqual([2, 0]);
  expect(state.winner).toBe(0);
  expect(state.games).toHaveLength(2); // the third game's points were ignored after match over
});

test('serve passes to the rally winner', () => {
  expect(derive([{ type: 'point', side: 1 }], fmt, 0).serve).toBe(1);
});

test('manual finishGame awards the current game to the chosen side', () => {
  const state = derive([{ type: 'point', side: 0 }, { type: 'point', side: 0 }, { type: 'finishGame', winner: 1 }], fmt, 0);
  expect(state.score).toEqual([0, 1]);
  expect(state.games[0].manual).toBe(true);
});

// --- UI checks ---
test('live badminton match opens at its current score and +1 updates it', async ({ page }) => {
  await page.goto(route(liveBad));
  await expect(page.getByRole('heading', { level: 1 }).or(page.locator('.scoring-sport'))).toBeTruthy();
  // The seeded live match shows games already won plus the in-progress game points.
  const points0 = page.locator('.score-side').first().locator('.score-points');
  const before = Number(await points0.textContent());
  await page.locator('.point-btn').first().click();
  await expect(points0).toHaveText(String(before + 1));
  // Undo returns to the previous score.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(points0).toHaveText(String(before));
});

test('scheduled badminton match asks who serves first, then scores', async ({ page }) => {
  const scheduled = assignedMatches.find(m => m.sport === 'badminton' && m.state === 'scheduled');
  test.skip(!scheduled, 'no scheduled badminton assignment');
  await page.goto(route(scheduled));
  await expect(page.locator('.serve-prompt')).toBeVisible();
  await page.locator('.serve-prompt .score-btn').first().click();
  await expect(page.locator('.point-btn')).toHaveCount(2);
  await page.locator('.point-btn').first().click();
  await expect(page.locator('.score-side').first().locator('.score-points')).toHaveText('1');
});

test('finish game uses a radio dialog, not a text prompt', async ({ page }) => {
  await page.goto(route(liveBad));
  await page.getByRole('button', { name: 'Finish game' }).click();
  const dialog = page.locator('dialog.scoring-dialog[open]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[type="radio"]')).toHaveCount(2);
  // Award the current game to side 1 (the second radio) and confirm.
  const gamesBefore = Number(await page.locator('.score-games').nth(1).textContent().then(t => t.trim().split(' ')[0]));
  await dialog.locator('input[type="radio"]').nth(1).check();
  await dialog.getByRole('button', { name: 'Finish game' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.score-games').nth(1)).toContainText(String(gamesBefore + 1));
});

test('match point asks to confirm; No reverts the deciding point', async ({ page }) => {
  // Live Iyer–Khan: games 1–0, game 2 at 19–17. Two points for side 0 reach 21 and win the match.
  await page.goto(route(liveBad));
  const points0 = page.locator('.score-side').first().locator('.score-points');
  await page.locator('.point-btn').first().click(); // 19 -> 20
  await expect(points0).toHaveText('20');
  await page.locator('.point-btn').first().click(); // 20 -> 21, match point
  const dialog = page.locator('dialog.scoring-dialog[open]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('wins the match');
  // No reverts the last point: back to 20, match not finished, controls active again.
  await dialog.getByRole('button', { name: 'No, undo point' }).click();
  await expect(dialog).toBeHidden();
  await expect(points0).toHaveText('20');
  await expect(page.locator('.scoring-result')).toHaveCount(0);
  await expect(page.locator('.point-btn').first()).toBeEnabled();
});

test('match point Yes submits and returns to My Matches', async ({ page }) => {
  await page.goto(route(liveBad));
  await page.locator('.point-btn').first().click();
  await page.locator('.point-btn').first().click(); // match point
  const dialog = page.locator('dialog.scoring-dialog[open]');
  await dialog.getByRole('button', { name: 'Yes, submit' }).click();
  await expect(page).toHaveURL(/\/operator\/matches$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My Matches');
});

test('layout has no body overflow and 44px point buttons', async ({ page }) => {
  await page.goto(route(liveBad));
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

test('max games matches the format (best of 3 -> 3 game columns)', async ({ page }) => {
  await page.goto(route(liveBad));
  await expect(page.locator('.score-table thead th')).toHaveCount(maxGames(fmt) + 2); // side + games + total
});
