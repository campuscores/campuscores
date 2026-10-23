// StaffShell frame on every Staff_Area screen (Req 2.6–2.9, 4.9, 4.10, 21.4, 21.5): staff navigation per role, Back
// targets, focus, document titles, refresh and Back, no access, signed out, one site header and page-not-found.
// Live-mode build with a stub Clerk and a mocked API (see mockStaff in helpers.js).
import { test, expect } from '@playwright/test';
import { mockStaff, REPLIES, STAFF_APP as APP } from './helpers.js';

const NAV = {
  scorer: ['My Matches', 'Account'],
  manager: ['Home', 'Matches', 'Invite scorer', 'Account'],
  admin: ['Home', 'Tournaments', 'Matches', 'Staff', 'Account'],
};
const ROLE_TEXT = { scorer: 'Match Scorer', manager: 'Tournament Manager', admin: 'Super Admin' };
const staffNav = page => page.getByRole('navigation', { name: 'Staff' });
const heading = page => page.locator('main h1');
const backLink = page => page.getByRole('main').getByRole('link', { name: /^Back to / });

/**
 * [role, path, current nav item, Back { label, to } or null on the start screen, h1 and title or undefined].
 * Tournament screens mark Home for a manager and Tournaments for a Super Admin (design "Staff navigation"). Back and
 * title are checked only where the navigation map has one answer for the screens built so far.
 */
const SCREENS = [
  ['scorer', '/operator/matches', 'My Matches', null, 'My Matches'],
  ['scorer', '/operator/matches/7/score', 'My Matches', { label: 'My Matches', to: '/operator/matches' }],
  ['manager', '/manage', 'Home', null, 'Manager home'],
  ['manager', '/manage/matches', 'Matches', { label: 'Manager home', to: '/manage' }, 'Matches'],
  ['manager', '/manage/matches/new', 'Matches'],
  ['manager', '/manage/matches/12/scorer', 'Matches', { label: 'Matches', to: '/manage/matches' }, 'Assign scorer'],
  ['manager', '/manage/invite', 'Invite scorer', { label: 'Manager home', to: '/manage' }, 'Invite scorer'],
  // A manager or Super Admin opens the Score console from Matches, so it marks Matches and goes back there.
  ['manager', '/operator/matches/7/score', 'Matches', { label: 'Matches', to: '/manage/matches' }],
  ['admin', '/operator/matches/7/score', 'Matches', { label: 'Matches', to: '/manage/matches' }],
  ['manager', '/manage/tournaments/new', 'Home', { label: 'Manager home', to: '/manage' }],
  ['manager', '/manage/tournaments/spring-cup', 'Home', { label: 'Manager home', to: '/manage' }],
  ['manager', '/manage/tournaments/spring-cup/details', 'Home'],
  ['manager', '/manage/tournaments/spring-cup/setup/teams', 'Home'],
  ['manager', '/manage/tournaments/spring-cup/sports/badminton', 'Home'],
  ['manager', '/manage/tournaments/spring-cup/sports/badminton/teams', 'Home'],
  ['admin', '/admin', 'Home', null, 'Admin home'],
  ['admin', '/admin/tournaments', 'Tournaments', { label: 'Admin home', to: '/admin' }, 'All tournaments'],
  ['admin', '/manage/tournaments/spring-cup', 'Tournaments'],
  ['admin', '/manage/tournaments/spring-cup/details', 'Tournaments'],
  ['admin', '/manage/tournaments/spring-cup/sports/badminton/teams', 'Tournaments'],
  ['admin', '/manage/matches', 'Matches', undefined, 'Matches'],
  ['admin', '/manage/invite', 'Staff', { label: 'Admin home', to: '/admin' }, 'Invite scorer'],
  ['admin', '/admin/staff', 'Staff', { label: 'Admin home', to: '/admin' }, 'Staff list'],
  ['admin', '/admin/staff/invite', 'Staff', { label: 'Staff list', to: '/admin/staff' }, 'Invite staff'],
  ['admin', '/admin/staff/5', 'Staff', { label: 'Staff list', to: '/admin/staff' }],
  ['admin', '/admin/invitations', 'Home', { label: 'Admin home', to: '/admin' }, 'Pending invitations'],
];

async function expectFrame(page, role, current) {
  await expect(staffNav(page).getByRole('link')).toHaveText(NAV[role]);
  await expect(staffNav(page).locator('[aria-current="page"]')).toHaveCount(1);
  await expect(staffNav(page).locator('[aria-current="page"]')).toHaveText(current);
  await expect(staffNav(page)).toContainText(`Signed in as ${ROLE_TEXT[role]}`);
  await expect(heading(page)).toHaveCount(1);
  await expect(heading(page)).toBeFocused();
}
async function expectOneSiteHeader(page) {
  await expect(page.locator('header.desktop-banner')).toHaveCount(1);
  await expect(page.locator('header.mobile-header')).toHaveCount(1);
}

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', err => page.errors.push(err.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

for (const [role, path, current, back, title] of SCREENS) {
  test(`${role} ${path}: navigation marks ${current}, one header, focused h1${back === null ? ', no Back' : back ? `, Back to ${back.label}` : ''}`, async ({ page }) => {
    await mockStaff(page, { me: REPLIES[role] });
    await page.goto(`${APP}${path}`);
    await expectFrame(page, role, current);
    await expectOneSiteHeader(page);
    if (back === null) await expect(backLink(page)).toHaveCount(0);
    if (back) {
      await expect(backLink(page)).toHaveText(`Back to ${back.label}`);
      await expect(backLink(page)).toHaveAttribute('href', back.to);
    }
    if (title) {
      await expect(heading(page)).toHaveText(title);
      await expect(page).toHaveTitle(`${title} | Campuscores`);
    }
  });
}

// Manager screens (tasks 14.6, 16.4): each path opens its page, which reads /api/manage. Create tournament and Invite
// scorer read nothing; their forms show instead.
const FORM_ONLY = { '/manage/tournaments/new': 'Save and continue', '/manage/invite': 'Send invitation' };
for (const path of ['/manage', '/manage/tournaments/new', '/manage/tournaments/spring-cup/setup', '/manage/tournaments/spring-cup/setup/teams',
  '/manage/tournaments/spring-cup', '/manage/tournaments/spring-cup/details', '/manage/tournaments/spring-cup/sports/badminton',
  '/manage/tournaments/spring-cup/sports/badminton/teams', '/manage/matches', '/manage/matches/new', '/manage/matches/12',
  '/manage/matches/12/scorer', '/manage/invite']) {
  test(`manager ${path} opens its page`, async ({ page }) => {
    const reads = [];
    page.on('request', request => { if (request.method() === 'GET' && request.url().startsWith('http://api.test/api/manage/')) reads.push(request.url()); });
    await mockStaff(page, { me: REPLIES.manager });
    await page.goto(`${APP}${path}`);
    if (FORM_ONLY[path]) await expect(page.getByRole('button', { name: FORM_ONLY[path] })).toBeVisible();
    else await expect.poll(() => reads.length).toBeGreaterThan(0);
    await expect(heading(page)).toHaveCount(1);
  });
}

// Super Admin screens (task 20.5): each path reads its API. Invite staff reads nothing; its form shows instead.
for (const path of ['/admin', '/admin/tournaments', '/admin/staff', '/admin/staff/invite', '/admin/staff/5', '/admin/invitations']) {
  test(`admin ${path} opens its page`, async ({ page }) => {
    const reads = [];
    page.on('request', request => { if (request.method() === 'GET' && /^http:\/\/api\.test\/api\/(manage|admin)\//.test(request.url())) reads.push(request.url()); });
    await mockStaff(page, { me: REPLIES.admin });
    await page.goto(`${APP}${path}`);
    if (path === '/admin/staff/invite') await expect(page.getByRole('button', { name: 'Send invitation' })).toBeVisible();
    else await expect.poll(() => reads.length).toBeGreaterThan(0);
    await expect(heading(page)).toHaveCount(1);
  });
}

test('manager: nav click, refresh, Back link and browser Back keep the right screen, title, focus and current item', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  await page.goto(`${APP}/manage`);
  await expectFrame(page, 'manager', 'Home');
  await staffNav(page).getByRole('link', { name: 'Matches' }).click();
  await expect(page).toHaveURL(`${APP}/manage/matches`);
  await expect(heading(page)).toHaveText('Matches');
  await expectFrame(page, 'manager', 'Matches');
  await page.reload();
  await expect(heading(page)).toHaveText('Matches');
  await expectFrame(page, 'manager', 'Matches');
  await expect(page).toHaveTitle('Matches | Campuscores');
  await staffNav(page).getByRole('link', { name: 'Invite scorer' }).click();
  await expect(heading(page)).toHaveText('Invite scorer');
  await expectFrame(page, 'manager', 'Invite scorer');
  await page.goBack();
  await expect(page).toHaveURL(`${APP}/manage/matches`);
  await expect(heading(page)).toHaveText('Matches');
  await expectFrame(page, 'manager', 'Matches');
  await expect(page).toHaveTitle('Matches | Campuscores');
  await backLink(page).click();
  await expect(page).toHaveURL(`${APP}/manage`);
  await expectFrame(page, 'manager', 'Home');
  await expect(page).toHaveTitle('Manager home | Campuscores');
  await page.goBack();
  await expect(page).toHaveURL(`${APP}/manage/matches`);
  await expectFrame(page, 'manager', 'Matches');
});

test('Super Admin: Tournaments and Staff items open their screens and refresh keeps them', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin });
  await page.goto(`${APP}/admin`);
  await staffNav(page).getByRole('link', { name: 'Tournaments' }).click();
  await expect(page).toHaveURL(`${APP}/admin/tournaments`);
  await expectFrame(page, 'admin', 'Tournaments');
  await staffNav(page).getByRole('link', { name: 'Staff' }).click();
  await expect(page).toHaveURL(`${APP}/admin/staff`);
  await expectFrame(page, 'admin', 'Staff');
  await page.reload();
  await expect(heading(page)).toHaveText('Staff list');
  await expectFrame(page, 'admin', 'Staff');
  await page.goBack();
  await expect(heading(page)).toHaveText('All tournaments');
  await expect(page).toHaveTitle('All tournaments | Campuscores');
});

const NO_ACCESS = [
  ['scorer', '/manage', '/operator/matches'],
  ['scorer', '/admin', '/operator/matches'],
  ['manager', '/admin/staff', '/manage'],
  ['manager', '/admin/tournaments', '/manage'],
]; // A Viewer is signed out instead (sign-in-choice.spec.js).
for (const [role, path, start] of NO_ACCESS) {
  test(`${role} on ${path} sees no access with a link to ${start}`, async ({ page }) => {
    await mockStaff(page, { me: REPLIES[role] });
    await page.goto(`${APP}${path}`);
    await expect(heading(page)).toHaveText('You do not have access to this page');
    await expect(heading(page)).toBeFocused();
    await expect(page).toHaveTitle('You do not have access to this page | Campuscores');
    const links = page.getByRole('main').getByRole('link');
    await expect(links).toHaveText(['Go to your start page']);
    await expect(links).toHaveAttribute('href', start);
    await expect(staffNav(page).getByRole('link')).toHaveText(NAV[role]);
    await expectOneSiteHeader(page);
  });
}

for (const [path, title, prompt] of [
  ['/manage', 'Manager home', 'Sign in to use the staff pages.'],
  ['/admin/staff', 'Staff list', 'Sign in to use the staff pages.'],
  ['/operator/matches', 'My Matches', 'Sign in to see and score the matches assigned to you.'],
]) {
  test(`signed out on ${path} sees the sign-in prompt and no API call`, async ({ page }) => {
    const calls = await mockStaff(page, { signedOut: true });
    await page.goto(`${APP}${path}`);
    await expect(heading(page)).toHaveText(title);
    await expect(page).toHaveTitle(`${title} | Campuscores`);
    await expect(page.getByRole('main')).toContainText(prompt);
    await expect(page.getByRole('main').getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
    await expect(staffNav(page)).toHaveCount(0);
    await expectOneSiteHeader(page);
    expect(calls).toEqual({ me: 0, accept: 0, other: 0 });
  });
}

test('/start and /sign-in show exactly one site header in each state', async ({ page }) => {
  // The second GET /api/me (on /sign-in) never answers, so /sign-in stays in its loading state.
  await mockStaff(page, { me: n => n === 1 ? REPLIES.viewer : new Promise(() => {}), accept: REPLIES.inviteNotFound });
  await page.goto(`${APP}/start`);
  await expect(page.locator('h1')).toHaveText('This account has no staff access');
  await expectOneSiteHeader(page);
  await page.goto(`${APP}/sign-in`);
  await expect(page.getByText('Loading your account…')).toBeVisible();
  await expectOneSiteHeader(page);
});

test('signed out /sign-in and /start show exactly one site header', async ({ page }) => {
  await mockStaff(page, { signedOut: true });
  for (const path of ['/sign-in', '/start']) {
    await page.goto(`${APP}${path}`);
    await expect(page.locator('h1')).toHaveText('Sign in');
    await expectOneSiteHeader(page);
  }
});

for (const path of ['/manage/unknown/path', '/manage/tournaments/spring-cup/sports/badminton/teams/9', '/admin/staff/5/extra', '/operator/nope']) {
  test(`${path} shows page-not-found and loads no account`, async ({ page }) => {
    const calls = await mockStaff(page, { me: REPLIES.admin });
    await page.goto(`${APP}${path}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found');
    await expect(page.getByRole('link', { name: 'Return home' })).toHaveAttribute('href', '/');
    await expect(staffNav(page)).toHaveCount(0);
    expect(calls.me).toBe(0);
  });
}
