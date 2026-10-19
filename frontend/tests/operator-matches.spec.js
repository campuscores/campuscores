// My Matches section map (pure, Node) and the operator routes in the keyless test build.
// The mocked-API console flow is in the operator console spec (task 12.3).
import { test, expect } from '@playwright/test';
import { dayOf, isClosed, sectionOf } from '../src/features/operator/operatorMatches.js';
test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });
test('section map follows the confirmed My Matches rule (doc/memory.md)', ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'Pure Node logic: run in one project only.');
  const cases = [
    [{ status: 'SCHEDULED', correctionRoute: null }, 'scheduled'],
    [{ status: 'LIVE', correctionRoute: null }, 'live'],
    [{ status: 'REJECTED', correctionRoute: 'OPERATOR' }, 'live'],
    [{ status: 'PENDING_APPROVAL', correctionRoute: null }, 'completed'],
    [{ status: 'APPROVED', correctionRoute: null }, 'completed'],
    [{ status: 'REJECTED', correctionRoute: 'MANAGER' }, 'completed'],
    [{ status: 'SOMETHING_NEW' }, 'completed'], // unknown states stay read-only
  ];
  for (const [match, section] of cases) expect(sectionOf(match), JSON.stringify(match)).toBe(section);
  expect([isClosed({ status: 'PENDING_APPROVAL' }), isClosed({ status: 'APPROVED' }), isClosed({ status: 'REJECTED' })]).toEqual([true, true, false]);
  expect(dayOf(null)).toBeNull();
  expect(dayOf('not a date')).toBeNull();
  expect(dayOf('2026-10-12T09:30:00.000Z')).toMatchObject({ date: expect.stringMatching(/^2026-10-1[12]$/), label: expect.stringMatching(/Oct$/) });
});
test('operator routes need sign-in and load no Clerk code without a key', async ({ page }) => {
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  for (const route of ['/operator/matches', '/operator/matches/1/score']) {
    await page.goto(route);
    await expect(page.locator('h1'), route).toHaveText('Sign-in unavailable');
    await expect(page).toHaveTitle('My Matches | Thaparlympics');
  }
  expect(requests.filter(url => /clerk/i.test(url))).toEqual([]);
});
test('the header My Matches tab navigates from the home page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const tab = page.locator('.desktop-nav .nav-link', { hasText: 'My Matches' });
  await expect(tab).toHaveAttribute('href', '/operator/matches');
  await tab.click();
  await expect(page).toHaveURL(/\/operator\/matches$/);
  await expect(page.locator('h1')).toHaveText('Sign-in unavailable');
  await expect(tab).toHaveAttribute('aria-current', 'page');
});
