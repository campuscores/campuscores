import { test, expect } from '@playwright/test';
import { assignedMatches } from '../src/features/operator/operatorMatches.js';
import { derive } from '../src/features/operator/scoring/usePeriodScoring.js';

const liveBB = assignedMatches.find(m => m.sport === 'basketball' && m.state === 'live');
const route = m => `/operator/matches/${m.key}/score`;

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

// --- Pure engine checks ---
test('baskets of 1/2/3 add to the team and the player', () => {
  const s = derive([
    { type: 'score', side: 0, player: 'Arjun', value: 3 },
    { type: 'score', side: 0, player: 'Arjun', value: 2 },
    { type: 'score', side: 1, player: 'Nikhil', value: 1 },
  ]);
  expect(s.score).toEqual([5, 1]);
  expect(s.players[0].Arjun.points).toBe(5);
});

test('fouls accumulate per player and per team', () => {
  const s = derive([
    { type: 'foul', side: 0, player: 'Arjun' },
    { type: 'foul', side: 0, player: 'Kunal' },
    { type: 'foul', side: 1, player: 'Nikhil' },
  ]);
  expect(s.teamFouls).toEqual([2, 1]);
  expect(s.players[0].Arjun.fouls).toBe(1);
});

// --- UI checks ---
test('Basket dialog picks team, player, then +1/+2/+3', async ({ page }) => {
  await page.goto(route(liveBB));
  await expect(page.locator('.scoring-sport')).toContainText('Basketball');
  const before = Number(await page.locator('.score-points').first().textContent());
  await page.getByRole('button', { name: 'Basket' }).click();
  const dialog = page.locator('dialog.scoring-dialog[open]');
  await dialog.locator('input[name="team"]').first().check();
  await dialog.getByRole('button', { name: 'Next' }).click();
  // Choose +3 then a player.
  await dialog.getByRole('button', { name: '+3' }).click();
  await dialog.locator('input[name="player"]').first().check();
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.locator('.score-points').first()).toHaveText(String(before + 3));
});

test('Foul is offered (not cards) and increments team fouls', async ({ page }) => {
  await page.goto(route(liveBB));
  await expect(page.getByRole('button', { name: 'Foul' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Card', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Foul' }).click();
  const dialog = page.locator('dialog.scoring-dialog[open]');
  await dialog.locator('input[name="team"]').first().check();
  await dialog.getByRole('button', { name: 'Next' }).click();
  await dialog.locator('input[name="player"]').first().check();
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.locator('.score-games').first()).toContainText('1 fouls');
});

test('period tabs include Q1-Q4 and OT', async ({ page }) => {
  await page.goto(route(liveBB));
  await expect(page.locator('.period-tab')).toHaveText(['Q1', 'Q2', 'Q3', 'Q4', 'OT']);
});

test('layout has no body overflow and 44px event buttons', async ({ page }) => {
  await page.goto(route(liveBB));
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
