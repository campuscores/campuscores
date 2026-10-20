// Runs only in the emulated phone and tablet projects (pixel, iphone, ipad). Emulation is not a real device.
import { test, expect } from '@playwright/test';
import { sports } from '../src/data/sports.js';
import { sportFixtures } from '../src/features/sports/sportFixtures.js';
import { swipe } from './helpers.js';

const card = (page, id) => page.locator(`[data-match-id="${id}"]`);
const dialog = page => page.locator('dialog.sport-dialog');
const focusedMatch = page => page.evaluate(() => document.activeElement.closest('[data-match-id]')?.dataset.matchId);
const closeButton = page => dialog(page).getByRole('button', { name: 'Close match details' });
const landscape = page => { const { width, height } = page.viewportSize(); return { width: height, height: width }; };

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

async function expectTarget(locator) {
  await expect(locator).toBeInViewport();
  const box = await locator.boundingBox();
  expect(Math.min(box.width, box.height), 'touch target size').toBeGreaterThanOrEqual(44);
}

for (const sport of sports) {
  const { liveMatches } = sportFixtures[sport.id];
  const route = `/sports/${sport.id}/`;
  const live = liveMatches[0];

  test.describe(`${sport.label} on a touch device`, () => {
    test('tap opens details fullscreen in portrait and fitted in landscape', async ({ page }) => {
      await page.goto(route);
      for (const viewport of [page.viewportSize(), landscape(page)]) {
        await page.setViewportSize(viewport);
        await card(page, live.id).locator('button').tap();
        await expect(dialog(page)).toBeVisible();
        const box = await dialog(page).boundingBox();
        if (viewport.width < 768) {
          expect([box.x, box.y, box.width, box.height].map(Math.round), `${viewport.width}×${viewport.height}`).toEqual([0, 0, viewport.width, viewport.height]);
        } else {
          expect(box.width).toBeLessThanOrEqual(760);
          expect(box.height).toBeLessThanOrEqual(viewport.height - 64 + 1);
        }
        await expectTarget(closeButton(page));
        await closeButton(page).tap();
        await expect(page.locator('dialog[open]')).toHaveCount(0);
        await expect.poll(() => focusedMatch(page)).toBe(live.id);
      }
    });

    test('portrait and landscape layout: no sideways scroll, 44px targets, no clipped text', async ({ page }) => {
      await page.goto(route);
      for (const viewport of [page.viewportSize(), landscape(page)]) {
        await page.setViewportSize(viewport);
        const geometry = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          textOverflows: [...document.querySelectorAll('.sport-page h1, .match-meta, .match-overview > span, .match-clock, .date-chip, .sport-empty')]
            .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent),
          smallTargets: [...document.querySelectorAll('.sport-card-open, .date-chip, .mobile-menu > summary')].filter(el => {
            const box = el.getBoundingClientRect();
            return el.getClientRects().length && (box.width < 44 || box.height < 44);
          }).map(el => el.className || el.tagName),
        }));
        expect(geometry, `${viewport.width}×${viewport.height}`).toEqual({ overflow: false, textOverflows: [], smallTargets: [] });
        await card(page, live.id).locator('button').tap();
        await expectTarget(closeButton(page));
        await closeButton(page).tap();
        await expect(page.locator('dialog[open]')).toHaveCount(0);
      }
    });
  });
}

test('rails and date chips are native touch scroll containers', async ({ page }) => {
  await page.goto('/sports/badminton/');
  for (const viewport of [page.viewportSize(), landscape(page)]) {
    await page.setViewportSize(viewport);
    let overflowing = 0;
    for (const selector of ['#past-results', '#upcoming-results', '#upcoming .date-chips']) {
      const row = page.locator(selector);
      await row.evaluate(el => { el.scrollLeft = 0; });
      const { overflowX, scrollWidth, clientWidth } = await row.evaluate(el => ({ overflowX: getComputedStyle(el).overflowX, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
      expect(overflowX, selector).toBe('auto');
      // Wide screens can fit every chip; such a row has nothing to scroll.
      if (scrollWidth <= clientWidth) continue;
      overflowing++;
      // Scroll to the end: rails snap, so a small offset can snap back to 0.
      await row.evaluate(el => { el.scrollLeft = el.scrollWidth; });
      await expect.poll(() => row.evaluate(el => el.scrollLeft), selector).toBeGreaterThan(0);
      await row.evaluate(el => { el.scrollLeft = 0; });
    }
    expect(overflowing, `${viewport.width}px: at least one row scrolls`).toBeGreaterThan(0);
    const rail = page.locator('#past-results');
    await rail.focus();
    await expect(rail).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => rail.evaluate(el => el.scrollLeft), 'ArrowRight on the focused rail').toBeGreaterThan(0);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => rail.evaluate(el => el.scrollLeft), 'ArrowLeft returns to the first card').toBe(0);
    const lastChip = page.locator('#upcoming .date-chip').last();
    await lastChip.tap();
    await expect(lastChip).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#upcoming .date-chip').first().tap();
  }
});

test('touch swipe scrolls the card rail and the date chips', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Touch-drag input exists only through Chromium CDP; WebKit swipe is a manual real-device check');
  await page.goto('/sports/badminton/');
  for (const selector of ['#past-results', '#upcoming .date-chips']) {
    const row = page.locator(selector);
    await swipe(page, row);
    await expect.poll(() => row.evaluate(el => el.scrollLeft), selector).toBeGreaterThan(0);
  }
});

test('phone header menu opens sports and closes after navigation', async ({ page }) => {
  await page.goto('/sports/badminton/');
  const menu = page.locator('.mobile-menu');
  const panel = page.locator('.mobile-menu-panel');
  for (const [id, label] of [['football', 'Football'], ['badminton', 'Badminton']]) {
    await menu.locator(':scope > summary').tap();
    await expect(menu).toHaveAttribute('open', '');
    await panel.locator('summary').tap();
    const targets = panel.locator('a:visible, summary:visible');
    for (const box of await targets.evaluateAll(list => list.map(el => el.getBoundingClientRect().height))) expect(box, 'menu target height').toBeGreaterThanOrEqual(44);
    await panel.locator(`a[href="/sports/${id}/"]`).tap();
    await expect(page).toHaveURL(new RegExp(`/sports/${id}/$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
    await expect(menu).not.toHaveAttribute('open');
  }
});
