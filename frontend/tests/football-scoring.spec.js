import { test, expect } from '@playwright/test';
import { assignedMatches } from '../src/features/operator/operatorMatches.js';
import { derive } from '../src/features/operator/scoring/usePeriodScoring.js';

const liveFB = assignedMatches.find(m => m.sport === 'football' && m.state === 'live');
const route = m => `/operator/matches/${m.key}/score`;

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

// --- Pure engine checks ---
test('goals add to the team and the scorer', () => {
  const s = derive([{ type: 'score', side: 0, player: 'Aman', value: 1 }, { type: 'score', side: 0, player: 'Aman', value: 1 }]);
  expect(s.score).toEqual([2, 0]);
  expect(s.players[0].Aman.points).toBe(2);
});

test('a second yellow to the same player becomes a red', () => {
  const s = derive([{ type: 'card', side: 1, player: 'Kabir', card: 'yellow' }, { type: 'card', side: 1, player: 'Kabir', card: 'yellow' }]);
  expect(s.players[1].Kabir.yellow).toBe(2);
  expect(s.players[1].Kabir.red).toBe(1);
});

test('substitution marks the player off', () => {
  const s = derive([{ type: 'sub', side: 0, off: 'Aman', on: 'Rohit' }]);
  expect(s.players[0].Aman.off).toBe(true);
  expect(s.players[0].Rohit).toBeTruthy();
});

// --- UI checks: full player attribution via dialogs ---
test('Goal opens a team then player picker and increments the score', async ({ page }) => {
  await page.goto(route(liveFB));
  await expect(page.locator('.scoring-sport')).toContainText('Football');
  const before = Number(await page.locator('.score-points').first().textContent());
  await page.getByRole('button', { name: 'Goal' }).click();
  const dialog = page.locator('dialog.scoring-dialog[open]');
  await expect(dialog).toContainText('Which team?');
  await dialog.locator('input[name="team"]').first().check();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog).toContainText('Player');
  await dialog.locator('input[name="player"]').first().check();
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.score-points').first()).toHaveText(String(before + 1));
});

test('Card dialog offers Yellow/Red for a chosen player', async ({ page }) => {
  await page.goto(route(liveFB));
  await page.getByRole('button', { name: 'Card', exact: true }).click();
  const dialog = page.locator('dialog.scoring-dialog[open]');
  await dialog.locator('input[name="team"]').first().check();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog.locator('input[name="card"]')).toHaveCount(2);
  await dialog.locator('input[name="player"]').first().check();
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.locator('.timeline-list')).toContainText('Yellow card');
});

test('Substitute dialog picks player off then on', async ({ page }) => {
  await page.goto(route(liveFB));
  await page.getByRole('button', { name: 'Substitute' }).click();
  const dialog = page.locator('dialog.scoring-dialog[open]');
  await dialog.locator('input[name="team"]').first().check();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await expect(dialog).toContainText('Player off');
  await expect(dialog).toContainText('Player on');
  await dialog.locator('input[name="off"]').first().check();
  await dialog.locator('input[name="on"]').first().check();
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.locator('.timeline-list')).toContainText('Sub ·');
});

test('period tabs are the two halves; submit confirms and returns to My Matches', async ({ page }) => {
  await page.goto(route(liveFB));
  await expect(page.locator('.period-tab')).toHaveText(['First half', 'Second half']);
  await page.getByRole('button', { name: 'Submit result' }).click();
  const dialog = page.locator('dialog.scoring-dialog[open]');
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page).toHaveURL(/\/operator\/matches$/);
});

test('layout has no body overflow and 44px event buttons', async ({ page }) => {
  await page.goto(route(liveFB));
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      small: [...document.querySelectorAll('.event-btn, .period-tab, .scoring-action, .scoring-back')].filter(el => {
        const b = el.getBoundingClientRect();
        return el.getClientRects().length && b.height < 44;
      }).length,
    }));
    expect(geometry, `at ${width}px`).toEqual({ overflow: false, small: 0 });
  }
});
