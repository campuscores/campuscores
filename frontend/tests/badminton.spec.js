import { test, expect } from '@playwright/test';

const card = (page, id) => page.locator(`[data-match-id="${id}"]`);
const chip = (section, label) => section.locator('.date-chip', { hasText: new RegExp(`^${label}$`) });
const dialog = page => page.locator('dialog.badminton-dialog');
const focusedMatch = page => page.evaluate(() => document.activeElement.closest('[data-match-id]')?.dataset.matchId);
const weight = locator => locator.evaluate(el => getComputedStyle(el).fontWeight);

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

test('three sections render with header-only default cards', async ({ page }) => {
  await page.goto('/sports/badminton/');
  await expect(page.locator('.desktop-banner')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Badminton');
  await expect(page.locator('.badminton-section h2')).toHaveText(['Live Matches', 'Upcoming Matches', 'Past Matches']);
  await expect(page.locator('#live .live-dot')).toHaveCount(1);
  await expect(page.locator('#upcoming .live-dot, #past .live-dot')).toHaveCount(0);
  for (const [id, count] of [['live', 4], ['upcoming', 5], ['past', 6]]) await expect(page.locator(`#${id} .badminton-card`)).toHaveCount(count);
  await expect(page.locator('.badminton-card table, .badminton-card .match-details')).toHaveCount(0);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('#upcoming .date-chip')).toHaveText(['All', '10 Oct', '11 Oct', '12 Oct', '15 Oct']);
  await expect(page.locator('#past .date-chip')).toHaveText(['All', '1 Oct', '2 Oct', '3 Oct']);
  await expect(page.locator('.date-chip[aria-pressed="true"]')).toHaveText(['All', 'All']);
  // Texture covers the whole default card: no white detail area below it.
  const surface = await page.locator('.badminton-card .match-surface').first().evaluate(el => {
    const before = getComputedStyle(el, '::before');
    return { image: before.backgroundImage, bottom: before.bottom };
  });
  expect(surface).toEqual({ image: expect.stringContaining('badminton-background.webp'), bottom: '0px' });
  await expect(card(page, 'live-ms-iyer-khan')).toContainText('Game 2 · 19–17');
  await expect(card(page, 'live-ms-iyer-khan').locator('strong')).toHaveText('1–0');
});

test('layout fits phones to large screens without body overflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/sports/badminton/');
  for (const width of [320, 375, 390, 430, 767, 768, 1023, 1024, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      textOverflows: [...document.querySelectorAll('.badminton-page h1, .match-meta, .match-overview > span, .match-clock, .date-chip, .badminton-empty')]
        .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent),
      smallTargets: [...document.querySelectorAll('.badminton-card-open, .date-chip')].filter(el => {
        const box = el.getBoundingClientRect();
        return el.getClientRects().length && (box.width < 44 || box.height < 44);
      }).length,
      texture: getComputedStyle(document.querySelector('.badminton-card .match-surface'), '::before').backgroundImage,
    }));
    expect(geometry, `layout at ${width}px`).toMatchObject({ overflow: false, textOverflows: [], smallTargets: 0 });
    expect(geometry.texture).toMatch(width < 768 ? /badminton-background-640\.webp/ : /badminton-background\.webp/);
  }
  await expect(page.locator('.badminton-card .match-surface').last()).toHaveCSS('transform', 'none');
  // Doubles rows carry the longest names; the dialog must still fit the narrowest phone.
  await page.setViewportSize({ width: 320, height: 900 });
  await card(page, 'live-wd-rao-sen').locator('button').click();
  await expect(dialog(page)).toBeVisible();
  expect(await dialog(page).evaluate(el => [el, ...el.querySelectorAll('*:not(.sr-only)')]
    .filter(node => node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).overflowX !== 'visible' || node.getBoundingClientRect().right > innerWidth + 1)
    .map(node => node.className || node.tagName))).toEqual([]);
});

test('a live card opens fullscreen with scores, serving and current game, then closes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/sports/badminton/');
  const url = page.url();
  const history = await page.evaluate(() => window.history.length);
  await card(page, 'live-ms-iyer-khan').locator('button').click();
  const details = page.getByRole('dialog', { name: /Iyer/ });
  await expect(details).toBeVisible();
  expect(await details.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');
  await expect(details.getByRole('button', { name: 'Close match details' })).toBeFocused();
  await expect(details.locator('.badminton-dialog-status')).toHaveText('Live · Game 2 · 19–17');
  const [iyer, khan] = [details.locator('tbody tr').nth(0), details.locator('tbody tr').nth(1)];
  await expect(iyer.locator('th')).toContainText('CSE · Year 3');
  await expect(iyer.locator('th')).toContainText('Arjun Iyer');
  await expect(khan.locator('th')).toContainText('Sameer Khan');
  // Game 1: Iyer won 21–18, so only his score is bold.
  await expect(iyer.locator('td').nth(0).locator('strong')).toHaveText('21');
  await expect(khan.locator('td').nth(0)).toHaveText('18');
  await expect(khan.locator('td').nth(0).locator('strong')).toHaveCount(0);
  expect(Number(await weight(iyer.locator('td').nth(0).locator('strong')))).toBeGreaterThan(Number(await weight(khan.locator('td').nth(0))));
  // Game 2 is current: red cells and a labelled column header.
  for (const row of [iyer, khan]) await expect(row.locator('td').nth(1)).toHaveClass(/is-current/);
  await expect(iyer.locator('td').nth(1)).toHaveCSS('color', 'rgb(213, 32, 62)');
  await expect(details.locator('thead th').nth(2)).toHaveAttribute('aria-label', 'Game 2, current');
  await expect(iyer.locator('td').nth(2)).toHaveText('—');
  await expect(details.locator('.serve-dot')).toHaveCount(2); // player + legend
  await expect(iyer.locator('.badminton-player', { has: page.locator('.serve-dot') })).toHaveText('Arjun Iyer, serving');
  await expect(details.locator('.winner-tag')).toHaveCount(0);
  await details.getByRole('button', { name: 'Close match details' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  expect(await focusedMatch(page)).toBe('live-ms-iyer-khan');
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => window.history.length)).toBe(history);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden');
});

test('keyboard opens details and Escape returns focus to the card', async ({ page }) => {
  await page.goto('/sports/badminton/');
  for (const [id, key] of [['live-xd-kapoor-nair', 'Enter'], ['past-ms-chopra-yadav', 'Space']]) {
    await card(page, id).locator('button').focus();
    await page.keyboard.press(key);
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    expect(await focusedMatch(page)).toBe(id);
  }
});

test('a just-ended live match shows its winner in text', async ({ page }) => {
  await page.goto('/sports/badminton/');
  const ended = card(page, 'live-ms-mehta-bose');
  await expect(ended.locator('.match-clock')).toHaveText('Ended · Mehta won');
  expect(await weight(ended.locator('.is-winner'))).toBe('800');
  expect(await weight(ended.locator('.is-loser'))).toBe('500');
  await expect(ended.locator('.is-winner')).toHaveText('Mehta (winner)');
  for (const id of ['live-ms-iyer-khan', 'live-wd-rao-sen', 'live-xd-kapoor-nair']) await expect(card(page, id)).not.toContainText('Ended');
  await ended.locator('button').click();
  await expect(dialog(page).locator('.badminton-dialog-status')).toHaveText('Match ended · Mehta won 2–1 · Provisional result');
  await expect(dialog(page).locator('.winner-tag')).toHaveCount(1);
  await expect(dialog(page).locator('tbody tr').nth(0).locator('.winner-tag')).toHaveText('Winner');
  await expect(dialog(page).locator('.is-current, .serve-dot')).toHaveCount(0);
});

test('doubles details list both players and the serving player', async ({ page }) => {
  await page.goto('/sports/badminton/');
  await card(page, 'live-wd-rao-sen').locator('button').click();
  const rows = dialog(page).locator('tbody tr');
  await expect(rows.nth(0).locator('.badminton-player')).toHaveText(['Meera Rao', 'Kavya Sen, serving']);
  await expect(rows.nth(1).locator('.badminton-player')).toHaveText(['Riya Das', 'Anika Paul']);
  for (const index of [0, 1]) await expect(rows.nth(index).locator('td').nth(2)).toHaveClass(/is-current/);
  await expect(rows.nth(0).locator('td').nth(0).locator('strong')).toHaveCount(0);
  await expect(rows.nth(1).locator('td').nth(0).locator('strong')).toHaveText('21');
});

test('past date chips filter in place and cards show the winner, date and tournament', async ({ page }) => {
  await page.goto('/sports/badminton/');
  const url = page.url();
  const history = await page.evaluate(() => window.history.length);
  const past = page.locator('#past');
  const rail = page.locator('#past-results');
  await chip(past, '2 Oct').click();
  await expect(past.locator('.date-chip[aria-pressed="true"]')).toHaveText(['2 Oct']);
  await expect(past.locator('.badminton-card')).toHaveCount(2);
  for (const date of await past.locator('.badminton-card').evaluateAll(cards => cards.map(el => el.dataset.date))) expect(date).toBe('2026-10-02');
  await expect(past.getByRole('status')).toHaveText('Past Matches, 2 Oct: 2 matches.');
  await rail.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await chip(past, '1 Oct').click();
  await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBe(0);
  await expect(page.locator('#upcoming .badminton-card')).toHaveCount(5);
  await expect(page.locator('#upcoming .date-chip[aria-pressed="true"]')).toHaveText('All');
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => window.history.length)).toBe(history);
  await chip(past, 'All').focus();
  await page.keyboard.press('Enter');
  await expect(past.locator('.badminton-card')).toHaveCount(6);
  await chip(past, '3 Oct').focus();
  await page.keyboard.press('Space');
  await expect(past.locator('.badminton-card')).toHaveCount(2);
  // Kaur / Jain lost 1–2 to Rao / Sen: the right-hand side is the bold winner.
  const result = card(page, 'past-wd-kaur-jain');
  await expect(result.locator('.is-winner')).toHaveText('Rao / Sen (winner)');
  expect(await weight(result.locator('.is-winner'))).toBe('800');
  await expect(result.locator('.match-clock')).toHaveText('3 Oct · Thaparlympics 2026');
  await result.locator('button').click();
  await expect(dialog(page).locator('.badminton-dialog-status')).toHaveText('Final · Rao / Sen won 2–1');
  await expect(dialog(page).locator('tbody tr').nth(1).locator('.winner-tag')).toHaveText('Winner');
  await expect(dialog(page).locator('table')).toHaveCount(1);
  await expect(dialog(page).locator('.badminton-info dt')).toHaveText(['Date', 'Time', 'Tournament', 'Round', 'Venue']);
  await expect(dialog(page).locator('.badminton-info')).toContainText('Sports Complex · Court 1');
});

test('upcoming date chips filter, show an empty day and open schedule details', async ({ page }) => {
  await page.goto('/sports/badminton/');
  const upcoming = page.locator('#upcoming');
  await chip(upcoming, '15 Oct').click();
  await expect(upcoming.locator('.badminton-card')).toHaveCount(1);
  await expect(upcoming.locator('.badminton-card')).toContainText('Inter-Hostel Cup');
  await expect(page.locator('#past .badminton-card')).toHaveCount(6);
  await chip(upcoming, '12 Oct').click();
  await expect(upcoming.locator('.badminton-card')).toHaveCount(0);
  await expect(upcoming.locator('.badminton-empty')).toHaveText('No upcoming matches on 12 Oct.');
  await expect(upcoming.getByRole('status')).toHaveText('Upcoming Matches, 12 Oct: 0 matches.');
  await chip(upcoming, '10 Oct').click();
  await expect(upcoming.locator('.badminton-empty')).toHaveCount(0);
  const scheduled = card(page, 'up-md-arora-singh');
  await expect(scheduled.locator('strong')).toHaveText('VS');
  await expect(scheduled.locator('.match-clock')).toHaveText('10 Oct · 6:15 PM · Thaparlympics 2026');
  await expect(scheduled).not.toContainText(/\d+–\d+/);
  await scheduled.locator('button').click();
  await expect(dialog(page).locator('.badminton-dialog-status')).toHaveText('Scheduled · 10 Oct · 6:15 PM');
  await expect(dialog(page).locator('table')).toHaveCount(0);
  await expect(dialog(page).locator('.badminton-player')).toHaveText(['Kabir Arora', 'Jaspreet Singh', 'Faizan Malik', 'Arnav Roy']);
  await expect(dialog(page).locator('.badminton-info dd')).toHaveText(['10 Oct', '6:15 PM', 'Thaparlympics 2026', 'Semifinal 2', 'Sports Complex · Court 2']);
});

test('desktop details are centered and the backdrop closes them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/sports/badminton/');
  await card(page, 'past-ms-iyer-ghosh').locator('button').click();
  const box = await dialog(page).boundingBox();
  expect(box.width).toBeLessThanOrEqual(760);
  expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThanOrEqual(2);
  await page.mouse.click(10, 10);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  expect(await focusedMatch(page)).toBe('past-ms-iyer-ghosh');
});

test('route entry, refresh and back work while other sports stay blank', async ({ page }) => {
  await page.goto('/');
  await page.locator('.desktop-nav .sports-dropdown summary').click();
  await page.locator('.desktop-nav a[href="/sports/badminton/"]').click();
  await expect(page).toHaveURL(/\/sports\/badminton\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Badminton' })).toBeVisible();
  expect((await page.reload()).status()).toBe(200);
  await expect(page.locator('#past .badminton-card')).toHaveCount(6);
  await page.goBack();
  await expect(page.locator('.hero')).toBeVisible();
  for (const sport of ['football', 'basketball', 'lawn-tennis', 'table-tennis', 'volleyball']) {
    await page.goto(`/sports/${sport}/`);
    await expect(page.locator('#root')).toHaveText('');
  }
});
