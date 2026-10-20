import { test, expect } from '@playwright/test';
import { sports } from '../src/data/sports.js';
import { sportFixtures } from '../src/features/sports/sportFixtures.js';
import { upcomingDates, pastDates } from '../src/features/sports/sportCalendar.js';
import { bundle, serveBundle, replaceLiteral } from './helpers.js';

const card = (page, id) => page.locator(`[data-match-id="${id}"]`);
const chip = (section, label) => section.locator('.date-chip', { hasText: new RegExp(`^${label}$`) });
const dialog = page => page.locator('dialog.sport-dialog');
const focusedMatch = page => page.evaluate(() => document.activeElement.closest('[data-match-id]')?.dataset.matchId);
const count = n => `${n} ${n === 1 ? 'match' : 'matches'}`;
const bodyOverflows = page => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
const players = match => match.sides.reduce((total, side) => total + side.players.length, 0);
// The live match with the most players carries the longest dialog content.
const widest = matches => matches.reduce((best, match) => players(match) > players(best) ? match : best);
const sections = [['upcoming', 'Upcoming Matches', upcomingDates, 'upcomingMatches'], ['past', 'Past Matches', pastDates, 'pastMatches']];

// Same check as the 320px dialog test in sport-pages.spec.js.
async function dialogOverflow(page) {
  const nodes = await dialog(page).evaluate(el => [el, ...el.querySelectorAll('*:not(.sr-only)')]
    .filter(node => node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).overflowX !== 'visible' || node.getBoundingClientRect().right > innerWidth + 1)
    .map(node => node.className || node.tagName));
  const cells = await dialog(page).locator('th, td').evaluateAll(list => list.filter(cell => cell.scrollWidth > cell.clientWidth + 1).map(cell => cell.textContent));
  return [...nodes, ...cells];
}

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

test('an empty Live section shows its empty state on every sport', async ({ page }) => {
  const { url, text } = await bundle(page);
  let replaced = 0;
  const patched = text.replace(/liveMatches:\(\)=>[\w$]+/g, () => { replaced++; return 'liveMatches:()=>[]'; });
  expect(replaced, 'one liveMatches export per fixture module').toBe(6);
  await serveBundle(page, url, patched);
  for (const sport of sports) {
    const { upcomingMatches, pastMatches } = sportFixtures[sport.id];
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/sports/${sport.id}/`);
    await expect(page.locator('#live .sport-empty')).toHaveText('No live matches right now.');
    await expect(page.locator('#live [role=status]')).toHaveText('Live Matches: 0 matches.');
    await expect(page.locator('#live .sport-card')).toHaveCount(0);
    await expect(page.locator('#live .live-dot')).toHaveCount(1);
    await expect(page.locator('#upcoming .sport-card')).toHaveCount(upcomingMatches.length);
    await expect(page.locator('#past .sport-card')).toHaveCount(pastMatches.length);
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await bodyOverflows(page), `${sport.id} at ${width}px`).toBe(false);
    }
  }
});

test('Back with the dialog open leaves the sport page', async ({ page }) => {
  // Pins the current behaviour (doc/memory.md Open: match detail URL). Change only with that decision.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('.desktop-nav .sports-dropdown summary').click();
  await page.locator('.desktop-nav a[href="/sports/badminton/"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Badminton' })).toBeVisible();
  await card(page, sportFixtures.badminton.liveMatches[0].id).locator('button').click();
  await expect(dialog(page)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.hero')).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Badminton');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('.date-chip[aria-pressed="true"]')).toHaveText(['All', 'All']);
});

test('routes: trailing slashes, refresh, unknown sports, blank tournaments and history', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const sport of sports) {
    for (const route of [`/sports/${sport.id}`, `/sports/${sport.id}/`]) {
      // Firefox revalidates the cached SPA fallback, so a repeat load can be 304 Not Modified.
      expect([200, 304], route).toContain((await page.goto(route)).status());
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(sport.label);
      expect([200, 304], route).toContain((await page.reload()).status());
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(sport.label);
    }
  }
  for (const route of ['/sports/cricket/', '/sports/cricket', '/sports/']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { name: 'Page not found' }), route).toBeVisible();
  }
  for (const route of ['/tournaments/racquet-open/', '/tournaments/racquet-open']) {
    expect([200, 304], route).toContain((await page.goto(route)).status());
    await expect(page.locator('#root'), route).toHaveText('');
  }
  await page.goto('/sports/badminton/');
  await page.locator('.desktop-nav .sports-dropdown summary').click();
  await page.locator('.desktop-nav a[href="/sports/football/"]').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Football');
  await page.goto('/sports/basketball/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Basketball');
  for (const [move, label] of [['goBack', 'Football'], ['goBack', 'Badminton'], ['goForward', 'Football']]) {
    await page[move]();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
  }
});

for (const sport of sports) {
  const fixtures = sportFixtures[sport.id];
  const { liveMatches, upcomingMatches, pastMatches } = fixtures;
  const route = `/sports/${sport.id}/`;
  const big = widest(liveMatches);

  test.describe(`${sport.label} edge cases`, () => {
    test('single-match day, empty day and All restore', async ({ page }) => {
      await page.goto(route);
      const upcoming = page.locator('#upcoming');
      const single = upcomingDates.find(day => upcomingMatches.filter(match => match.date === day.date).length === 1);
      expect(single, 'an upcoming day with exactly one match').toBeTruthy();
      await chip(upcoming, single.label).click();
      await expect(upcoming.getByRole('status')).toHaveText(`Upcoming Matches, ${single.label}: 1 match.`);
      await expect(upcoming.locator('.sport-card')).toHaveCount(1);
      await expect(upcoming.locator('.sport-card')).not.toHaveClass(/is-peek/);

      await chip(upcoming, '12 Oct').click();
      await expect(upcoming.locator('.sport-empty')).toHaveText('No upcoming matches on 12 Oct.');
      expect(await page.locator('#upcoming-results').evaluate(el => el.tagName)).toBe('P');
      await expect(upcoming.locator('.sport-card')).toHaveCount(0);
      await expect(upcoming.getByRole('status')).toHaveText('Upcoming Matches, 12 Oct: 0 matches.');
      await chip(upcoming, 'All').click();
      await expect(upcoming.locator('.sport-card')).toHaveCount(upcomingMatches.length);
      await expect.poll(() => page.locator('#upcoming-results').evaluate(el => el.scrollLeft)).toBe(0);
    });

    test('rapid chip clicks settle on the last chip', async ({ page }) => {
      await page.goto(route);
      for (const [id, title, dates, key] of sections) {
        const section = page.locator(`#${id}`);
        const other = page.locator(`#${id === 'past' ? 'upcoming' : 'past'}`);
        for (let click = 0; click < 5; click++) await chip(section, dates[0].label).click({ noWaitAfter: true });
        for (const day of dates) await chip(section, day.label).click({ noWaitAfter: true });
        const last = dates.at(-1);
        const expected = fixtures[key].filter(match => match.date === last.date);
        await expect(section.locator('.date-chip[aria-pressed="true"]')).toHaveText([last.label]);
        await expect(section.locator('.sport-card')).toHaveCount(expected.length);
        await expect(section.getByRole('status')).toHaveText(`${title}, ${last.label}: ${count(expected.length)}.`);
        await expect(other.locator('.date-chip[aria-pressed="true"]')).toHaveText(['All']);
        await chip(section, 'All').click();
      }
    });

    test('a chosen date survives opening and closing details', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      const past = page.locator('#past');
      const day = pastDates[1];
      const expected = pastMatches.filter(match => match.date === day.date);
      await chip(past, day.label).click();
      const closers = [
        () => dialog(page).getByRole('button', { name: 'Close match details' }).click(),
        () => page.keyboard.press('Escape'),
        () => page.mouse.click(10, 10),
      ];
      for (const closeDialog of closers) {
        await card(page, expected[0].id).locator('button').click();
        await expect(dialog(page)).toBeVisible();
        await closeDialog();
        await expect(page.locator('dialog[open]')).toHaveCount(0);
        await expect(past.locator('.date-chip[aria-pressed="true"]')).toHaveText([day.label]);
        await expect(past.locator('.sport-card')).toHaveCount(expected.length);
      }
    });

    test('very long names fit a 320px phone', async ({ page }) => {
      const { url, text } = await bundle(page);
      let patched = text;
      const values = [
        [big.sides[0].name, 'Chattopadhyay / Venkataraghavan'],
        [big.sides[1].name, 'Bhattacharya / Ramachandran'],
        ...[...new Set(big.sides.map(side => side.team))].map(team => [team, 'Electronics and Communication · Year 3 · Section B']),
        ...big.sides.map(side => [side.players[0].name, 'Venkataraghavan Subramanian Chattopadhyay']),
      ];
      for (const [from, to] of values) {
        const result = replaceLiteral(patched, from, to);
        expect(result.count, `literal ${from}`).toBeGreaterThan(0);
        patched = result.text;
      }
      await serveBundle(page, url, patched);
      await page.setViewportSize({ width: 320, height: 900 });
      await page.goto(route);
      const target = card(page, big.id);
      await expect(target).toContainText('Chattopadhyay / Venkataraghavan');
      expect(await target.evaluate(el => {
        const right = el.getBoundingClientRect().right;
        return [...el.querySelectorAll('.match-overview > span')]
          .filter(span => span.scrollWidth > span.clientWidth + 1 || span.getBoundingClientRect().right > right + 1)
          .map(span => span.textContent);
      })).toEqual([]);
      expect(await bodyOverflows(page)).toBe(false);
      await target.locator('button').click();
      await expect(dialog(page)).toBeVisible();
      await expect(dialog(page)).toContainText('Venkataraghavan Subramanian Chattopadhyay');
      expect(await dialogOverflow(page)).toEqual([]);
    });

    test('dialog lifecycle: one dialog, focus trap, focus return and scroll lock', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      const close = dialog(page).getByRole('button', { name: 'Close match details' });
      await card(page, liveMatches[0].id).locator('button').click();
      await expect(close).toBeFocused();
      await close.click();
      await card(page, pastMatches[0].id).locator('button').click();
      await expect(page.locator('#sport-dialog-title')).toContainText(pastMatches[0].sides[0].name);
      await expect(page.locator('#sport-dialog-title')).toContainText(pastMatches[0].sides[1].name);
      await expect(page.locator('dialog.sport-dialog')).toHaveCount(1);
      await expect(page.locator('dialog[open]')).toHaveCount(1);
      await expect(close).toBeFocused();
      for (const key of ['Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
        await page.keyboard.press(key);
        expect(await page.evaluate(() => {
          const el = document.activeElement;
          return !el || el === document.body || el === document.documentElement || Boolean(el.closest('dialog[open]'));
        }), `focus stays in the dialog after ${key}`).toBe(true);
      }
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      await expect.poll(() => focusedMatch(page)).toBe(pastMatches[0].id);

      await page.locator('#past').evaluate(el => el.scrollIntoView());
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY).toBeGreaterThan(0);
      await page.locator('#past .sport-card').first().locator('button').click();
      await expect(dialog(page)).toBeVisible();
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');
      await page.mouse.move(10, 10);
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(200);
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden');
      expect(Math.abs(await page.evaluate(() => window.scrollY) - scrollY)).toBeLessThanOrEqual(1);
      // Wheel up: the page may already be at its bottom.
      await page.mouse.wheel(0, -300);
      await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(scrollY);
    });

    test('reduced motion, no console errors and no failed or external requests', async ({ page }) => {
      const problems = [];
      page.on('console', message => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
      page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
      page.on('requestfailed', request => problems.push(`failed: ${request.url()} ${request.failure()?.errorText}`));
      page.on('response', response => { if (response.status() >= 400) problems.push(`${response.status()}: ${response.url()}`); });
      page.on('request', request => { if (new URL(request.url()).origin !== 'http://127.0.0.1:4175') problems.push(`external: ${request.url()}`); });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(route);
      for (const [id, , dates] of sections) {
        const section = page.locator(`#${id}`);
        for (const label of [...dates.map(day => day.label), 'All']) await chip(section, label).click();
      }
      for (const id of ['live', 'upcoming', 'past']) {
        await page.locator(`#${id} .sport-card`).first().locator('button').click();
        await expect(dialog(page)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('dialog[open]')).toHaveCount(0);
      }
      await expect(page.locator('.sport-card .match-surface').last()).toHaveCSS('transform', 'none');
      expect(problems).toEqual([]);
    });

    test('200% and 400% zoom keep the dialog readable', async ({ page }) => {
      await page.goto(route);
      // Playwright has no browser zoom: a 1280×900 window at 200% and 400% has these CSS viewports.
      for (const viewport of [{ width: 640, height: 450 }, { width: 320, height: 225 }]) {
        await page.setViewportSize(viewport);
        await card(page, big.id).locator('button').click();
        const details = dialog(page);
        await expect(details).toBeVisible();
        const box = await details.boundingBox();
        expect([box.x, box.y, box.width, box.height].map(Math.round), `${viewport.width}px`).toEqual([0, 0, viewport.width, viewport.height]);
        const close = details.getByRole('button', { name: 'Close match details' });
        await expect(close).toBeInViewport();
        const closeBox = await close.boundingBox();
        expect(Math.min(closeBox.width, closeBox.height)).toBeGreaterThanOrEqual(44);
        expect(await details.evaluate(el => getComputedStyle(el).overflowY)).toBe('auto');
        await details.evaluate(el => { el.scrollTop = el.scrollHeight; });
        await expect(details.locator('.sport-info dd').last()).toBeInViewport();
        expect(await dialogOverflow(page)).toEqual([]);
        expect(await bodyOverflows(page)).toBe(false);
        await page.keyboard.press('Escape');
        await expect(page.locator('dialog[open]')).toHaveCount(0);
      }
    });

    test('keyboard-only flow through chips, rails and cards', async ({ page, browserName }) => {
      // macOS WebKit follows Safari: plain Tab skips links and buttons; Option+Tab reaches every item.
      const tab = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      const describe = () => page.evaluate(() => {
        const el = document.activeElement;
        const match = el.closest('[data-match-id]')?.dataset.matchId;
        return `${el.closest('section')?.id}:${match ?? (el.id || el.textContent)}`;
      });
      const expected = await page.evaluate(() => [...document.querySelectorAll('#upcoming .date-chip, #upcoming-results, #upcoming-results .sport-card-open, #past .date-chip, #past-results, #past-results .sport-card-open')]
        .map(el => `${el.closest('section').id}:${el.closest('[data-match-id]')?.dataset.matchId ?? (el.id || el.textContent)}`));
      await chip(page.locator('#upcoming'), 'All').focus();
      const seen = [await describe()];
      const last = expected.at(-1);
      for (let press = 0; press < 60 && seen.at(-1) !== last; press++) {
        await page.keyboard.press(tab);
        const focused = page.locator(':focus');
        expect(await focused.evaluate(el => getComputedStyle(el).outlineStyle), await describe()).not.toBe('none');
        await expect(focused).toBeInViewport();
        seen.push(await describe());
      }
      expect(seen).toEqual(expected);
      await page.keyboard.press(`Shift+${tab}`);
      expect(await describe()).toBe(expected.at(-2));
      await page.keyboard.press(tab);
      await page.keyboard.press('Enter');
      await expect(dialog(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      await expect.poll(() => focusedMatch(page)).toBe(pastMatches.at(-1).id);
    });
  });
}
