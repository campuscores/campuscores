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
      const { overflowX, snap, scrollWidth, clientWidth } = await row.evaluate(el => ({ overflowX: getComputedStyle(el).overflowX, snap: getComputedStyle(el).scrollSnapType, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
      expect(overflowX, selector).toBe('auto');
      if (selector !== '#upcoming .date-chips') expect(snap, 'touch card snapping at ' + viewport.width + 'px').toBe('x mandatory');
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
    await expect(panel.getByRole('link', { name: 'My Matches' })).toHaveCount(0); // staff roles Req 4.1
    const targets = panel.locator('a:visible, summary:visible');
    for (const box of await targets.evaluateAll(list => list.map(el => el.getBoundingClientRect().height))) expect(box, 'menu target height').toBeGreaterThanOrEqual(44);
    await panel.locator(`a[href="/sports/${id}/"]`).tap();
    await expect(page).toHaveURL(new RegExp(`/sports/${id}/$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
    await expect(menu).not.toHaveAttribute('open');
  }
});


test('phone match details use the larger score and readable table, with facts in two columns', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/sports/badminton/');
  await card(page, sportFixtures.badminton.liveMatches[0].id).locator('button').tap();
  const details = dialog(page);
  await expect(details.locator('.sport-dialog-round')).toHaveText('Semifinal 1');
  await expect(details.locator('.sport-dialog-status')).toHaveText('Live · Game 2 · 19–17');
  expect(await details.locator('.match-overview strong').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(40);
  for (const selector of ['td', '.sport-team', '.sport-info dd', '.sport-dialog-status']) {
    expect(await details.locator(selector).first().evaluate(el => parseFloat(getComputedStyle(el).fontSize)), selector).toBeGreaterThanOrEqual(16);
  }
  await expect(details.locator('thead th')).toHaveText(['Team and players', 'G1', 'G2', 'G3', 'Games']);
  const facts = await details.locator('.sport-info > div').evaluateAll(divs => divs.map(el => { const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width}; }));
  expect(facts[0].y).toBe(facts[1].y);
  expect(facts[2].y).toBe(facts[3].y);
  expect(facts[4].width).toBeGreaterThan(facts[0].width * 1.8);
  expect(await details.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
  await page.screenshot({ path: test.info().outputPath('larger-phone-match.png') });
});

test('phone rails keep a spotlight throughout short drags instead of dimming both cards', async ({ page }) => {
  await page.goto('/');
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const selector of ['.match-scroll', '.tournament-scroll']) {
      const rail = page.locator(selector).first();
      await rail.scrollIntoViewIfNeeded();
      const step = await rail.evaluate(el => {
        el.style.scrollSnapType = 'none'; // Inspect the in-gesture positions before native snapping starts.
        return el.children[1].offsetLeft - el.children[0].offsetLeft;
      });
      for (const fraction of [.2, .35, .49, .65, .35, .2, 0]) {
        await rail.evaluate((el, left) => { el.scrollLeft = left; }, step * fraction);
        await expect.poll(() => rail.locator(':scope > :not(.is-peek)').count(), `${selector} at ${width}px / ${fraction}`).toBe(1);
        if (fraction === .49 || fraction === .65) await expect(rail.locator(':scope > :nth-child(2)')).not.toHaveClass(/is-peek/);
      }
      await rail.evaluate(el => { el.style.scrollSnapType = ''; });
    }
  }
});

test('a short phone swipe advances the rail and settles on a card', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Real touch dragging uses Chromium CDP; WebKit still needs a physical-phone check');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  for (const selector of ['.match-scroll', '.tournament-scroll']) {
    const rail = page.locator(selector).first();
    await swipe(page, rail, 90);
    await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    await expect.poll(() => rail.evaluate(el => {
      const anchors = [...el.children].slice(0, -1).map(card => card.offsetLeft);
      anchors.push(el.scrollWidth - el.clientWidth);
      return Math.min(...anchors.map(left => Math.abs(el.scrollLeft - left)));
    })).toBeLessThan(2);
    await expect(rail.locator(':scope > :not(.is-peek)')).toHaveCount(1);
  }
});


test('slow touch swipes settle on cards in portrait, landscape and tablet layouts', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Touch-drag input uses Chromium CDP; physical Safari and Firefox remain manual checks');
  await page.goto('/');
  for (const width of [390, 844, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    for (const selector of ['.match-scroll', '.tournament-scroll']) {
      const rail = page.locator(selector).first();
      expect(await rail.evaluate(el => getComputedStyle(el).scrollSnapType), 'touch snapping at ' + width + 'px').toBe('x mandatory');
      for (const distance of [140, -140]) {
        await rail.evaluate((el, distance) => { el.scrollLeft = distance > 0 ? 0 : el.scrollWidth; }, distance);
        await swipe(page, rail, distance, 60);
        await expect.poll(() => rail.evaluate(el => {
          const max = el.scrollWidth - el.clientWidth;
          const anchors = [...el.children].map(card => Math.min(max, card.offsetLeft));
          anchors.push(0, max);
          return Math.min(...anchors.map(left => Math.abs(el.scrollLeft - left)));
        }), selector + ' at ' + width + 'px / ' + distance).toBeLessThan(2);
      }
    }
  }
});
