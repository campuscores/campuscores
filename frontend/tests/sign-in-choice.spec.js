// Sign-in choice, /start and the GET /api/me states (Req 2.7, 4.2–4.8) on the live-mode build with a stub Clerk and a
// mocked API. The stub exists only in this test's init script; the app code is the production build.
import { test, expect } from '@playwright/test';
import { mockStaff, REPLIES, STAFF_APP as APP } from './helpers.js';

const START = { scorer: '/operator/matches', manager: '/manage', admin: '/admin' };
const H1 = { scorer: 'My Matches', manager: 'Manager home', admin: 'Admin home' };
const staffNav = page => page.getByRole('navigation', { name: 'Staff' });
const loadingAccount = page => page.getByText('Loading your account…');
/** A reply the test sends later: `reply` goes to the mock, `release(pair)` answers it. */
function held() {
  let release;
  const reply = new Promise(resolve => { release = resolve; });
  return { reply: () => reply, release };
}

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', err => page.errors.push(err.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

test('signed out, /sign-in offers three choices, no Super Admin entry, and guest opens Home with no API call', async ({ page }) => {
  const calls = await mockStaff(page, { signedOut: true });
  await page.goto(`${APP}/sign-in`);
  await expect(page.locator('h1')).toHaveText('Sign in');
  const main = page.getByRole('main');
  await expect(main.getByRole('link')).toHaveText(['Continue as guest', 'Sign in as Match Scorer', 'Sign in as Tournament Manager']);
  await expect(main.getByRole('link', { name: 'Sign in as Match Scorer' })).toHaveAttribute('href', '/sign-in/scorer');
  await expect(main.getByRole('link', { name: 'Sign in as Tournament Manager' })).toHaveAttribute('href', '/sign-in/manager');
  await expect(page.getByRole('link', { name: /Super Admin/ })).toHaveCount(0);
  await main.getByRole('link', { name: 'Continue as guest' }).click();
  await expect(page).toHaveURL(`${APP}/`);
  await expect(page).toHaveTitle('Campuscores');
  expect(calls).toEqual({ me: 0, accept: 0, other: 0 });
});

for (const role of ['scorer', 'manager', 'admin']) {
  test(`signed-in ${role} on /sign-in opens ${START[role]}`, async ({ page }) => {
    const calls = await mockStaff(page, { me: REPLIES[role] });
    await page.goto(`${APP}/privacy`);
    await page.goto(`${APP}/sign-in`);
    await expect(page).toHaveURL(`${APP}${START[role]}`);
    await expect(staffNav(page)).toBeVisible();
    await expect(page.locator('main h1')).toHaveText(H1[role]);
    expect(calls.accept).toBe(0);
    await page.goBack(); // /sign-in was replaced, so Back skips it
    await expect(page).toHaveURL(`${APP}/privacy`);
  });
}

test('signed-in Viewer on /sign-in opens Home', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.viewer });
  await page.goto(`${APP}/sign-in`);
  await expect(page).toHaveURL(`${APP}/`);
  await expect(page).toHaveTitle('Campuscores');
});

for (const [result, accept] of [['200', null], ['404 INVITE_NOT_FOUND', REPLIES.inviteNotFound], ['409 ACCOUNT_EXISTS', REPLIES.accountExists]]) {
  for (const role of ['scorer', 'manager', 'admin']) {
    test(`/start with accept ${result} sends one accept and opens the ${role} start screen`, async ({ page }) => {
      const calls = await mockStaff(page, { me: REPLIES[role], accept: accept ?? REPLIES[role] });
      await page.goto(`${APP}/start`);
      await expect(page).toHaveURL(`${APP}${START[role]}`);
      await expect(staffNav(page)).toBeVisible();
    await expect(page.locator('main h1')).toHaveText(H1[role]);
      await page.waitForLoadState('networkidle');
      expect(calls.accept).toBe(1);
      expect(calls.me).toBe(2); // one for /start, one for the start screen's own role gate
    });
  }
}

test('/start for a Viewer says the account has no staff access and links to Home', async ({ page }) => {
  const calls = await mockStaff(page, { me: REPLIES.viewer, accept: REPLIES.inviteNotFound });
  await page.goto(`${APP}/start`);
  await expect(page.locator('h1')).toHaveText('This account has no staff access');
  await expect(page).toHaveURL(`${APP}/start`);
  await expect(staffNav(page)).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  expect(calls.accept).toBe(1);
  await page.getByRole('main').getByRole('link', { name: 'Go to Home' }).click();
  await expect(page).toHaveURL(`${APP}/`);
});

test('/start accept 5xx shows an error; Try again sends a second accept and continues', async ({ page }) => {
  const calls = await mockStaff(page, { me: REPLIES.manager, accept: n => n === 1 ? REPLIES.clerkDown : REPLIES.manager });
  await page.goto(`${APP}/start`);
  await expect(page.getByRole('alert')).toHaveText('Could not load your account.');
  await expect(page.locator('h1')).toHaveText('Signing you in');
  expect(calls).toMatchObject({ accept: 1, me: 0 });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page).toHaveURL(`${APP}/manage`);
  await expect(staffNav(page)).toBeVisible();
  await expect(page.locator('main h1')).toHaveText('Manager home');
  await page.waitForLoadState('networkidle');
  expect(calls.accept).toBe(2);
});

test('/start shows a loading status while accept and GET /api/me are in progress', async ({ page }) => {
  const accept = held();
  const me = held();
  const calls = await mockStaff(page, { me: me.reply, accept: accept.reply });
  await page.goto(`${APP}/start`);
  await expect(loadingAccount(page)).toBeVisible();
  await expect.poll(() => calls.accept).toBe(1);
  accept.release(REPLIES.inviteNotFound);
  await expect.poll(() => calls.me).toBe(1);
  await expect(loadingAccount(page)).toBeVisible();
  await expect(staffNav(page)).toHaveCount(0);
  me.release(REPLIES.scorer);
  await expect(page).toHaveURL(`${APP}/operator/matches`);
});

test('a staff screen shows a text loading status and no navigation or content while GET /api/me is in progress', async ({ page }) => {
  const me = held();
  await mockStaff(page, { me: me.reply });
  await page.goto(`${APP}/manage`);
  await expect(loadingAccount(page)).toBeVisible();
  await expect(staffNav(page)).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('link')).toHaveCount(0);
  me.release(REPLIES.manager);
  await expect(staffNav(page)).toBeVisible();
  await expect(loadingAccount(page)).toHaveCount(0);
});

test('GET /api/me 5xx on a staff screen shows an error with Try again and no content; Try again loads the screen', async ({ page }) => {
  const calls = await mockStaff(page, { me: n => n === 1 ? REPLIES.internal : REPLIES.manager });
  await page.goto(`${APP}/manage`);
  await expect(page.getByText('Could not load your account.')).toBeVisible();
  await expect(staffNav(page)).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('link')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(staffNav(page)).toBeVisible();
  await expect(page.getByText('Could not load your account.')).toHaveCount(0);
  expect(calls.me).toBe(2);
});

test('GET /api/me 5xx on /sign-in shows an error; Try again opens the start screen', async ({ page }) => {
  const calls = await mockStaff(page, { me: n => n === 1 ? REPLIES.internal : REPLIES.admin });
  await page.goto(`${APP}/sign-in`);
  await expect(page.getByRole('alert')).toHaveText('Could not load your account.');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page).toHaveURL(`${APP}/admin`);
  await expect(staffNav(page)).toBeVisible(); // the role gate's own GET /api/me has answered
  await expect(page.locator('main h1')).toHaveText('Admin home');
  expect(calls.me).toBe(3); // two on /sign-in, one for the start screen's role gate
});

test('GET /api/me 401 on a staff screen offers Sign in again, which opens the Clerk sign-in', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.unauthenticated });
  await page.goto(`${APP}/manage`);
  await expect(page.getByText('Your sign-in has expired.')).toBeVisible();
  await expect(staffNav(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__openSignInCalls)).toBe(0);
  await page.getByRole('button', { name: 'Sign in again' }).click();
  await expect.poll(() => page.evaluate(() => window.__openSignInCalls)).toBe(1);
  await expect(page).toHaveURL(`${APP}/manage`);
});

test('GET /api/me 401 on /start offers Sign in again, which opens the Clerk sign-in', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.unauthenticated, accept: REPLIES.inviteNotFound });
  await page.goto(`${APP}/start`);
  await expect(page.getByText('Your sign-in has expired.')).toBeVisible();
  await page.getByRole('button', { name: 'Sign in again' }).click();
  await expect.poll(() => page.evaluate(() => window.__openSignInCalls)).toBe(1);
});

test('signed out, /start links to sign-in and sends no accept', async ({ page }) => {
  const calls = await mockStaff(page, { signedOut: true });
  await page.goto(`${APP}/start`);
  await expect(page.getByRole('main').getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
  expect(calls).toEqual({ me: 0, accept: 0, other: 0 });
});
