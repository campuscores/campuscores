// My Matches section map (pure, Node) and the operator routes in the keyless test build.
// The mocked-API console flow is in the operator console spec (task 12.3).
import { test, expect } from '@playwright/test';
import { dayOf, isClosed, sectionOf, stageLabel } from '../src/features/operator/operatorMatches.js';
import { startReasonText } from '../src/features/staff/labels.js';
test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });
test('section map follows the confirmed My Matches rule (doc/memory.md)', ({ browserName }) => {
  test.skip(browserName !== 'chromium', 'Pure Node logic: run in one project only.');
  const cases = [
    [{ status: 'SCHEDULED', correctionRoute: null }, 'scheduled'],
    [{ status: 'SCHEDULED', correctionRoute: null, notScored: false }, 'scheduled'],
    [{ status: 'SCHEDULED', correctionRoute: null, notScored: true }, 'completed'], // Not_Scored is past (Req 15.4)
    [{ status: 'LIVE', correctionRoute: null }, 'live'],
    [{ status: 'REJECTED', correctionRoute: 'OPERATOR' }, 'live'],
    [{ status: 'PENDING_APPROVAL', correctionRoute: null }, 'completed'],
    [{ status: 'APPROVED', correctionRoute: null }, 'completed'],
    [{ status: 'REJECTED', correctionRoute: 'MANAGER' }, 'completed'],
    [{ status: 'SOMETHING_NEW' }, 'completed'], // unknown states stay read-only
  ];
  for (const [match, section] of cases) expect(sectionOf(match), JSON.stringify(match)).toBe(section);
  expect([isClosed({ status: 'PENDING_APPROVAL' }), isClosed({ status: 'APPROVED' }), isClosed({ status: 'REJECTED' })]).toEqual([true, true, false]);
  expect([stageLabel({ kind: 'CUSTOM', stage: null }), stageLabel({ kind: 'BRACKET', stage: 'SF1' })]).toEqual(['Match', 'Semifinal 1']);
  expect(dayOf(null)).toBeNull();
  expect(dayOf('not a date')).toBeNull();
  expect(dayOf('2026-10-12T09:30:00.000Z')).toEqual({ date: '2026-10-12', label: '12 Oct', time: '15:00' });
  expect(dayOf('2026-10-20T18:29:59Z')).toEqual({ date: '2026-10-20', label: '20 Oct', time: '23:59' });
  expect(dayOf('2026-10-20T18:30:00Z')).toEqual({ date: '2026-10-21', label: '21 Oct', time: '00:00' });
  // START reason text (Req 15.3): none when allowed; a later day is named by its India date, across UTC midnight.
  expect(startReasonText({ startReason: null, scheduledAt: '2026-10-20T18:30:00Z', isToday: true })).toBeNull();
  expect(startReasonText({ startReason: 'START_TOO_EARLY', scheduledAt: '2026-10-20T18:30:00Z', isToday: false })).toBe('You can start this match from 00:00 IST on 21 Oct.');
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
// Req 4.1 replaced the header My Matches tab: staff reach My Matches through sign-in and the staff navigation.
test('the public header has no My Matches link on desktop or in the phone menu', async ({ page }) => {
  await page.goto('/');
  // CSS locators include the hidden copy (desktop nav on phones, closed phone menu on desktops). Keyless build: no Sign in.
  for (const nav of ['.desktop-nav', '.mobile-menu-panel']) await expect(page.locator(`${nav} > a`), nav).toHaveText(['Home', 'Tournaments']);
  await expect(page.locator('header a[href^="/operator"]')).toHaveCount(0);
});
