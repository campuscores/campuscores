// Super Admin screens (task 20.6; Req 6.1 to 6.14, 20.3 to 20.8, 21.1, 21.6): each Primary_Action by keyboard only,
// the ConfirmDialogs, "Load more", filters in the query string, the cancel 502 message, the last Super Admin and owner
// messages, values kept on every error, one request per double submit and "Sign in again" after a 401.
// Live-mode build with a stub Clerk and the stateful admin fake (admin-fakes.js), whose replies copy
// backend/src/routes/admin.js, accounts.js and invites.js; each test checks the request bodies against the fields those
// routes read. The device clock runs outside India time, so the expiry text proves the IST conversion.
import { test, expect } from '@playwright/test';
import { istDate, timeText } from '../../shared/time.mjs';
import { expectNoCode, held, mockStaff, REPLIES, STAFF_APP as APP, tabKey, tabTo } from './helpers.js';
import { adminApi, fillerStaff, STAFF } from './admin-fakes.js';

test.use({ locale: 'en-GB', timezoneId: 'America/Los_Angeles' });

const main = page => page.getByRole('main');
const heading = page => page.locator('main h1');
const field = (page, label) => main(page).getByLabel(label, { exact: true });
const button = (page, name) => main(page).getByRole('button', { name, exact: true });
const link = (page, name) => main(page).getByRole('link', { name, exact: true });
const radio = (page, name) => main(page).getByRole('radio', { name, exact: true });
const rows = page => main(page).locator('tbody tr');
const dialog = page => page.getByRole('dialog');
const inDialog = (page, name) => dialog(page).getByRole('button', { name, exact: true });
const dialogField = (page, label) => dialog(page).getByLabel(label, { exact: true });
const dialogError = page => dialog(page).getByRole('alert');
const alert = page => main(page).locator('.staff-notice.is-error');
const status = (page, text) => page.getByRole('status').filter({ hasText: text });
const facts = page => main(page).locator('.admin-facts');
async function expectFieldError(input, message) {
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  const id = await input.evaluate(el => el.getAttribute('aria-describedby').split(' ').find(part => part.endsWith('-error')));
  await expect(input.page().locator(`[id="${id}"]`)).toHaveText(`Error: ${message}`);
}
/** "21 Oct 2026, 14:30 IST": the event-zone date and time of a backend `expiresAt`. */
const expiryText = expiresAt => {
  const ms = Date.parse(expiresAt);
  const day = new Date(`${istDate(ms)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${day}, ${timeText(ms)}`;
};
// Every code the admin endpoints return; none may show (Req 20.3).
const CODES = ['INVITE_PENDING', 'CLERK_UNAVAILABLE', 'INVITE_CLOSED', 'LAST_SUPER_ADMIN', 'OWNER_TRANSFER_REQUIRED', 'REASON_REQUIRED',
  'ALREADY_DISABLED', 'ALREADY_ACTIVE', 'ACCOUNT_EXISTS', 'ROLE_FORBIDDEN', 'email:', 'role:'];

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', err => page.errors.push(err.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

test('Admin home shows the pending count; "Invite staff" by keyboard only sends { email, role } and names the IST expiry', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin });
  const api = await adminApi(page);
  const tab = tabKey(page);
  await page.goto(`${APP}/admin`);
  await expect(heading(page)).toHaveText('Admin home');
  await expect(heading(page)).toBeFocused();
  await expect(link(page, 'Pending invitations: 2')).toHaveAttribute('href', '/admin/invitations');
  await expect(page.locator('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])')).toHaveCount(0);

  await tabTo(page, link(page, 'Invite staff'), tab);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${APP}/admin/staff/invite`);
  await expect(heading(page)).toHaveText('Invite staff');
  await expect(heading(page)).toBeFocused();
  await tabTo(page, field(page, 'Email'), tab);
  await page.keyboard.type(' Ravi@Example.com ');
  await tabTo(page, radio(page, 'Super Admin'), tab);
  await page.keyboard.press('ArrowDown');
  await expect(radio(page, 'Tournament Manager')).toBeChecked();
  await tabTo(page, button(page, 'Send invitation'), tab);
  await page.keyboard.press('Enter');
  await expect.poll(() => api.sent('POST', '/invites').length).toBe(1);
  const sent = api.state.invitations.at(-1);
  await expect(status(page, `Invitation sent to ravi@example.com. It expires on ${expiryText(sent.expiresAt)}.`)).toBeVisible();
  await expect(field(page, 'Email')).toHaveValue('');
  await expect(radio(page, 'Tournament Manager')).not.toBeChecked();
  // POST /api/invites reads email and role; a Super_Admin may invite every staff role (auth.js canInvite).
  expect(api.sent('POST', '/invites').map(r => r.body)).toEqual([{ email: 'ravi@example.com', role: 'TOURNAMENT_MANAGER' }]);
});

test('Invite staff keeps the email and role on a field error, a 502 and no response; "Try again" resends', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin });
  // 1: INVITE_PENDING from the fake; 2: 502; 3: no response; 4: accepted.
  const replies = [undefined, REPLIES.clerkDown, 'abort'];
  const api = await adminApi(page, { before: request => (request.method === 'POST' ? replies.shift() : undefined) });
  await page.goto(`${APP}/admin/staff/invite`);
  await button(page, 'Send invitation').click();
  const summary = main(page).locator('.error-summary');
  await expect(summary).toBeFocused();
  await expect(summary.getByRole('link')).toHaveText(['Enter an email address, like name@example.com.', 'Choose a role.']);
  expect(api.sent('POST', '/invites')).toEqual([]);

  await field(page, 'Email').fill('new@example.com'); // already has a pending invitation in the fake
  await radio(page, 'Match Scorer').check();
  await button(page, 'Send invitation').click();
  await expectFieldError(field(page, 'Email'), 'An invitation to this email is waiting to be accepted.');
  await expect(alert(page)).toHaveText('');
  await expect(field(page, 'Email')).toHaveValue('new@example.com');
  await expect(radio(page, 'Match Scorer')).toBeChecked();

  await field(page, 'Email').fill('ravi@example.com');
  await button(page, 'Send invitation').click(); // 502
  await expect(alert(page)).toHaveText('Error: The sign-in service is unavailable.');
  await expect(field(page, 'Email')).toHaveValue('ravi@example.com');
  await expect(radio(page, 'Match Scorer')).toBeChecked();
  await button(page, 'Try again').click(); // no response
  await expect(alert(page)).toHaveText('Error: Could not reach the server. Your changes are still here.');
  await expect(field(page, 'Email')).toHaveValue('ravi@example.com');
  await expectNoCode(page, CODES);
  await button(page, 'Try again').click();
  await expect(status(page, 'Invitation sent to ravi@example.com.')).toBeVisible();
  await expect(button(page, 'Try again')).toHaveCount(0);
  expect(api.sent('POST', '/invites').map(r => r.body)).toEqual([
    { email: 'new@example.com', role: 'MATCH_OPERATOR' },
    ...Array(3).fill({ email: 'ravi@example.com', role: 'MATCH_OPERATOR' }),
  ]);
});

test('A double submit of Invite staff sends one request; a 401 offers "Sign in again" and keeps the values', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin });
  const reply = held();
  const replies = [reply.reply];
  const api = await adminApi(page, { before: request => (request.method === 'POST' ? replies.shift() : undefined) });
  await page.goto(`${APP}/admin/staff/invite`);
  await field(page, 'Email').fill('ravi@example.com');
  await radio(page, 'Super Admin').check();
  const save = main(page).locator('button[type="submit"]');
  await save.click();
  await expect(save).toHaveText('Saving…');
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await save.click({ force: true }); // a user can still press an aria-disabled button
  await field(page, 'Email').press('Enter');
  await page.waitForTimeout(250); // time for a second request to reach the mock, if one were sent
  expect(api.sent('POST', '/invites')).toHaveLength(1);
  reply.release(REPLIES.unauthenticated);
  await expect(alert(page)).toHaveText('Error: Your sign-in has expired.');
  await button(page, 'Sign in again').click();
  await expect.poll(() => page.evaluate(() => window.__openSignInCalls)).toBe(1);
  await expect(field(page, 'Email')).toHaveValue('ravi@example.com');
  await expect(radio(page, 'Super Admin')).toBeChecked();
  await expectNoCode(page, CODES);
  expect(api.sent('POST', '/invites')).toHaveLength(1);
  await button(page, 'Send invitation').click();
  await expect(status(page, 'Invitation sent to ravi@example.com.')).toBeVisible();
  await expect(button(page, 'Sign in again')).toHaveCount(0);
  expect(api.sent('POST', '/invites').map(r => r.body)).toEqual(Array(2).fill({ email: 'ravi@example.com', role: 'SUPER_ADMIN' }));
});

test('Staff list "Load more" by keyboard only appends the next 50-row page and keeps the loaded rows', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin });
  const api = await adminApi(page, { staff: [...STAFF(), ...fillerStaff(51)] });
  await page.goto(`${APP}/admin/staff`);
  await expect(heading(page)).toBeFocused();
  await expect(rows(page)).toHaveCount(50);
  // ACTIVE first, then email (backend admin.js); the one DISABLED account is on page 2.
  await expect(rows(page).first()).toContainText('Arnav Admin');
  await expect(rows(page).first()).toContainText('Super Admin');
  await expect(rows(page).nth(3)).toContainText('Mira Coach');
  await expect(rows(page).nth(3)).toContainText('Spring Cup');
  await expect(rows(page).nth(49)).toContainText('scorer46@example.com');
  await tabTo(page, button(page, 'Load more'), tabKey(page), 80);
  await page.keyboard.press('Enter');
  await expect(rows(page)).toHaveCount(56);
  await expect(rows(page).first()).toContainText('Arnav Admin');
  await expect(rows(page).nth(49)).toContainText('scorer46@example.com');
  await expect(rows(page).nth(50)).toContainText('scorer47@example.com');
  await expect(rows(page).last()).toContainText('Dev Old');
  await expect(rows(page).last()).toContainText('Disabled');
  await expect(button(page, 'Load more')).toHaveCount(0);
  expect(api.sent('GET', '/admin/staff').map(r => r.query)).toEqual([{}, { offset: '50' }]);
});

test('A failed "Load more" keeps the rows and offers "Try again"; a 401 also offers "Sign in again"', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin });
  const replies = ['abort', REPLIES.unauthenticated];
  const api = await adminApi(page, { staff: [...STAFF(), ...fillerStaff(51)], before: request => (request.query.offset ? replies.shift() : undefined) });
  await page.goto(`${APP}/admin/staff`);
  await expect(rows(page)).toHaveCount(50);
  await button(page, 'Load more').click();
  await expect(main(page)).toContainText('Error: Could not load more staff accounts. The loaded staff accounts are still here.');
  await expect(rows(page)).toHaveCount(50);
  await button(page, 'Try again').click(); // 401
  await expect(button(page, 'Sign in again')).toBeVisible();
  await expect(rows(page)).toHaveCount(50);
  await button(page, 'Sign in again').click();
  await expect.poll(() => page.evaluate(() => window.__openSignInCalls)).toBe(1);
  await expectNoCode(page);
  await button(page, 'Try again').click();
  await expect(rows(page)).toHaveCount(56);
  await expect(main(page)).not.toContainText('Could not load more');
  await expect(button(page, 'Sign in again')).toHaveCount(0);
  expect(api.sent('GET', '/admin/staff').map(r => r.query)).toEqual([{}, { offset: '50' }, { offset: '50' }, { offset: '50' }]);
});

test('Staff list filters live in the query string: they survive reload and Back, and an empty result keeps the heading and "Invite staff"', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin });
  const api = await adminApi(page);
  const lastQuery = () => api.sent('GET', '/admin/staff').at(-1)?.query;
  await page.goto(`${APP}/admin/staff?role=BOSS`); // an unknown value counts as no filter
  await expect(rows(page)).toHaveCount(5);
  expect(lastQuery()).toEqual({});
  await expect(field(page, 'Role')).toHaveValue('');

  await field(page, 'Role').selectOption('MATCH_OPERATOR');
  await expect(page).toHaveURL(`${APP}/admin/staff?role=MATCH_OPERATOR`);
  await expect(rows(page)).toHaveCount(2);
  await field(page, 'Status').selectOption('DISABLED');
  await expect(page).toHaveURL(`${APP}/admin/staff?role=MATCH_OPERATOR&status=DISABLED`);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Dev Old');
  expect(lastQuery()).toEqual({ role: 'MATCH_OPERATOR', status: 'DISABLED' });

  await page.reload();
  await expect(heading(page)).toBeFocused();
  await expect(field(page, 'Role')).toHaveValue('MATCH_OPERATOR');
  await expect(field(page, 'Status')).toHaveValue('DISABLED');
  await expect(rows(page)).toHaveCount(1);
  expect(lastQuery()).toEqual({ role: 'MATCH_OPERATOR', status: 'DISABLED' });

  await page.goBack();
  await expect(page).toHaveURL(`${APP}/admin/staff?role=MATCH_OPERATOR`);
  await expect(field(page, 'Status')).toHaveValue('');
  await expect(rows(page)).toHaveCount(2);

  await field(page, 'Role').selectOption('SUPER_ADMIN');
  await field(page, 'Status').selectOption('DISABLED');
  await expect(main(page)).toContainText('No staff accounts match these filters.');
  await expect(heading(page)).toHaveText('Staff list');
  await expect(link(page, 'Invite staff')).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
});

test('Two filter changes before the list renders again keep both filters', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin });
  await adminApi(page);
  await page.goto(`${APP}/admin/staff`);
  await expect(rows(page)).toHaveCount(5);
  // Both change events run in one task, so the router has not rendered the first query change yet.
  await page.evaluate(() => {
    for (const [id, value] of [['staff-role', 'MATCH_OPERATOR'], ['staff-status', 'DISABLED']]) {
      const select = document.getElementById(id);
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await expect(page).toHaveURL(`${APP}/admin/staff?role=MATCH_OPERATOR&status=DISABLED`);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Dev Old');
});

test('Empty Staff list and Pending invitations keep the heading with "Invite staff"; Admin home shows 0', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin });
  await adminApi(page, { staff: [], invitations: [] });
  await page.goto(`${APP}/admin/staff`);
  await expect(main(page)).toContainText('No staff accounts yet.');
  await expect(link(page, 'Invite staff')).toBeVisible();
  await page.goto(`${APP}/admin/invitations`);
  await expect(heading(page)).toHaveText('Pending invitations');
  await expect(main(page)).toContainText('No invitations are waiting to be accepted.');
  await expect(link(page, 'Invite staff')).toBeVisible();
  await page.goto(`${APP}/admin`);
  await expect(link(page, 'Pending invitations: 0')).toBeVisible();
});

test('Role change by keyboard only: the dialog names each effect, opens on Cancel, and sends { role, reason }', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin });
  const api = await adminApi(page);
  const tab = tabKey(page);
  await page.goto(`${APP}/admin/staff/3`);
  await expect(heading(page)).toHaveText('Kabir Rao');
  await expect(heading(page)).toBeFocused();
  await expect(main(page)).toContainText('Football · Spring Cup');
  await tabTo(page, radio(page, 'Super Admin'), tab);
  await page.keyboard.press('ArrowDown');
  await expect(radio(page, 'Match Scorer')).toBeChecked();
  await tabTo(page, button(page, 'Change role'), tab);
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('heading')).toHaveText('Change the role of Kabir Rao?');
  await expect(dialog(page).getByRole('listitem')).toHaveText(['The role changes from Tournament Manager to Match Scorer.', 'They lose access to the sports they manage.']);
  await expect(inDialog(page, 'Cancel')).toBeFocused();
  await tabTo(page, dialogField(page, 'Reason (optional)'), tabKey(page, 'Shift+Tab'));
  await page.keyboard.type('Moved to scoring');
  await tabTo(page, inDialog(page, 'Change role'), tab);
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toHaveCount(0);
  await expect(status(page, 'Kabir Rao is now a Match Scorer.')).toBeVisible();
  // Wait for the reload after the save (a navigation now would cancel it).
  await expect(facts(page)).toContainText('RoleMatch Scorer');
  await expect(main(page).getByRole('heading', { name: 'Sports managed' })).toHaveCount(0);
  // POST /api/accounts/:id/role reads role and an optional reason.
  expect(api.sent('POST', '/accounts/3/role').map(r => r.body)).toEqual([{ role: 'MATCH_OPERATOR', reason: 'Moved to scoring' }]);
});

test('Disable by keyboard only: Escape returns focus, a late close keeps a reopened dialog, a Reason is required, then enable', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin });
  const api = await adminApi(page);
  const tab = tabKey(page);
  await page.goto(`${APP}/admin/staff/4`);
  await expect(heading(page)).toHaveText('Asha Singh');
  const disable = button(page, 'Disable account');
  await tabTo(page, disable, tab);
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('heading')).toHaveText('Disable Asha Singh?');
  await expect(dialog(page).getByRole('listitem')).toHaveText([
    'They can no longer use staff pages.', 'Their 2 active scorer assignments are removed.',
    'You can re-enable the account later. Removed assignments and sport access do not come back.',
  ]);
  await expect(inDialog(page, 'Cancel')).toBeFocused();
  await expect(dialog(page).locator('.field-error')).toHaveCount(0); // opening the dialog is not leaving the Reason field
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(disable).toBeFocused();

  // The `close` event of a closed dialog is queued; a late one must not close the dialog opened again.
  await page.keyboard.press('Enter');
  await expect(inDialog(page, 'Cancel')).toBeFocused();
  await dialog(page).evaluate(box => box.dispatchEvent(new Event('close')));
  await expect(dialog(page).getByRole('heading')).toHaveText('Disable Asha Singh?');

  await tabTo(page, inDialog(page, 'Disable account'), tab);
  await page.keyboard.press('Enter');
  const reason = dialogField(page, 'Reason');
  await expect(reason).toBeFocused();
  await expectFieldError(reason, 'Enter a reason.');
  expect(api.sent('POST', '/accounts/4/disable')).toEqual([]);
  await page.keyboard.type('Left the event');
  await expect(reason).not.toHaveAttribute('aria-invalid', 'true');
  await tabTo(page, inDialog(page, 'Disable account'), tab);
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toHaveCount(0);
  await expect(status(page, 'Asha Singh is disabled.')).toBeVisible();
  await expect(facts(page)).toContainText('StatusDisabled');
  await expect(facts(page)).toContainText('Active scorer assignments0');

  const enable = button(page, 'Re-enable account');
  await expect(enable).toHaveClass(/button-primary/);
  await tabTo(page, enable, tab);
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('heading')).toHaveText('Re-enable Asha Singh?');
  await expect(inDialog(page, 'Cancel')).toBeFocused();
  await tabTo(page, inDialog(page, 'Re-enable account'), tab);
  await page.keyboard.press('Enter');
  await expect(status(page, 'Asha Singh is active again.')).toBeVisible();
  await expect(facts(page)).toContainText('StatusActive');
  // disable reads a required reason; enable an optional one.
  expect(api.sent('POST', '/accounts/4/disable').map(r => r.body)).toEqual([{ reason: 'Left the event' }]);
  expect(api.sent('POST', '/accounts/4/enable').map(r => r.body)).toEqual([{}]);
});

test('Ownership transfer by keyboard only from All tournaments: 400 email errors keep the email, then { email } is sent', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin });
  const api = await adminApi(page);
  const tab = tabKey(page);
  await page.goto(`${APP}/admin/tournaments`);
  await expect(heading(page)).toHaveText('All tournaments');
  await expect(rows(page).first()).toContainText('Mira Coach');
  await expect(rows(page).first()).toContainText('Football: Kabir Rao');
  const open = button(page, 'Transfer ownership of Spring Cup');
  await tabTo(page, open, tab);
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('heading')).toHaveText('Transfer ownership of Spring Cup');
  await expect(dialog(page).getByRole('listitem')).toHaveText([
    'The new owner must be an active Tournament Manager.', 'Mira Coach is no longer its owner.', 'Sport managers and scorers stay as they are.',
  ]);
  await expect(inDialog(page, 'Cancel')).toBeFocused();
  const email = dialogField(page, "New owner's email");
  for (const [address, message] of [
    ['asha@example.com', 'Enter the email of an active tournament manager.'],
    ['mira@example.com', 'This tournament manager already owns this tournament.'],
  ]) {
    await tabTo(page, email, tabKey(page, 'Shift+Tab'));
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(address);
    await tabTo(page, inDialog(page, 'Transfer ownership'), tab);
    await page.keyboard.press('Enter');
    await expectFieldError(email, message);
    await expect(email).toHaveValue(address);
    await expect(dialogError(page)).toHaveCount(0);
    await expect(dialog(page).getByRole('heading')).toHaveText('Transfer ownership of Spring Cup');
    await expectNoCode(page, CODES);
  }
  await tabTo(page, email, tabKey(page, 'Shift+Tab'));
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(' Kabir@Example.com ');
  await tabTo(page, inDialog(page, 'Transfer ownership'), tab);
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toHaveCount(0);
  await expect(status(page, 'kabir@example.com now owns Spring Cup.')).toBeVisible();
  // The new owner's Sport_Manager row in the tournament is gone (backend admin.js).
  await expect(rows(page).first()).toContainText('Kabir Rao');
  await expect(rows(page).first()).toContainText('Football: no sport managers');
  // POST /api/admin/tournaments/:slug/owner reads email and an optional reason.
  expect(api.sent('POST', '/admin/tournaments/spring-cup/owner').map(r => r.body)).toEqual([
    { email: 'asha@example.com' }, { email: 'mira@example.com' }, { email: 'kabir@example.com' },
  ]);
});

test('An owner gets no role change or disable control, only "Transfer ownership" with the tournament link; after it the controls return', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin });
  const api = await adminApi(page);
  await page.goto(`${APP}/admin/staff/2`);
  await expect(heading(page)).toHaveText('Mira Coach');
  await expect(link(page, 'Spring Cup')).toHaveAttribute('href', '/manage/tournaments/spring-cup');
  await expect(main(page)).toContainText('Transfer ownership of Spring Cup first. Then you can change the role or disable the account.');
  await expect(button(page, 'Change role')).toHaveCount(0);
  await expect(button(page, 'Disable account')).toHaveCount(0);
  const transfer = button(page, 'Transfer ownership of Spring Cup');
  await expect(transfer).toHaveClass(/button-primary/);
  await transfer.click();
  await dialogField(page, "New owner's email").fill('kabir@example.com');
  await dialogField(page, 'Reason (optional)').fill('Mira is away');
  await inDialog(page, 'Transfer ownership').click();
  await expect(status(page, 'kabir@example.com now owns Spring Cup.')).toBeVisible();
  await expect(main(page)).toContainText('This account owns no tournaments.');
  await expect(button(page, 'Change role')).toBeVisible();
  await expect(button(page, 'Disable account')).toBeVisible();
  expect(api.sent('POST', '/admin/tournaments/spring-cup/owner').map(r => r.body)).toEqual([{ email: 'kabir@example.com', reason: 'Mira is away' }]);
});

test('Cancel invitation by keyboard only: soonest expiry first in IST, the dialog opens on Cancel, and the row goes', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin });
  const api = await adminApi(page);
  const tab = tabKey(page);
  const [first, second] = api.state.invitations;
  await page.goto(`${APP}/admin`);
  await tabTo(page, link(page, 'Pending invitations: 2'), tab);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${APP}/admin/invitations`);
  await expect(heading(page)).toBeFocused();
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first()).toContainText('new@example.com');
  await expect(rows(page).first()).toContainText('Tournament Manager');
  await expect(rows(page).first()).toContainText('Arnav Admin');
  await expect(rows(page).first()).toContainText(expiryText(first.expiresAt));
  await expect(rows(page).nth(1)).toContainText(expiryText(second.expiresAt));

  const open = button(page, 'Cancel invitation to new@example.com');
  await tabTo(page, open, tab);
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('heading')).toHaveText('Cancel the invitation to new@example.com?');
  await expect(inDialog(page, 'Cancel')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(open).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(inDialog(page, 'Cancel')).toBeFocused();
  await tabTo(page, inDialog(page, 'Cancel invitation'), tab);
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toHaveCount(0);
  await expect(status(page, 'The invitation to new@example.com is cancelled.')).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('later@example.com');
  // POST /api/invites/:id/cancel reads an optional reason.
  expect(api.sent('POST', '/invites/61/cancel').map(r => r.body)).toEqual([{}]);
});

test('Cancel 502: the dialog says the invitation is still active, keeps the reason, and "Try again" resends it', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin });
  const replies = [REPLIES.clerkDown];
  const api = await adminApi(page, { before: request => (request.method === 'POST' ? replies.shift() : undefined) });
  await page.goto(`${APP}/admin/invitations`);
  await button(page, 'Cancel invitation to new@example.com').click();
  await dialogField(page, 'Reason (optional)').fill('Sent to the wrong person');
  await inDialog(page, 'Cancel invitation').click();
  await expect(dialogError(page)).toHaveText('Error: The sign-in service is unavailable. The invitation is still active.');
  await expect(dialogField(page, 'Reason (optional)')).toHaveValue('Sent to the wrong person');
  await expect(rows(page)).toHaveCount(2);
  await expectNoCode(page, CODES);
  await inDialog(page, 'Try again').click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(status(page, 'The invitation to new@example.com is cancelled.')).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
  expect(api.sent('POST', '/invites/61/cancel').map(r => r.body)).toEqual(Array(2).fill({ reason: 'Sent to the wrong person' }));
});

test('Cancel of a closed invitation keeps the dialog with a plain message and a reload link; the list reloads behind it', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin });
  const api = await adminApi(page, {
    before: (request, state) => {
      if (request.method === 'POST') state.invitations = state.invitations.filter(invitation => invitation.id !== '61'); // accepted meanwhile
      return undefined;
    },
  });
  await page.goto(`${APP}/admin/invitations`);
  await button(page, 'Cancel invitation to new@example.com').click();
  await inDialog(page, 'Cancel invitation').click();
  await expect(dialogError(page)).toHaveText('Error: This invitation was already accepted, cancelled or has expired.');
  await expect(dialog(page).getByRole('link', { name: 'Reload the page' })).toHaveAttribute('href', '/admin/invitations');
  await expect(rows(page)).toHaveCount(1);
  await expectNoCode(page, CODES);
  await inDialog(page, 'Cancel').click();
  await expect(dialog(page)).toHaveCount(0);
  expect(api.sent('POST', '/invites/61/cancel')).toHaveLength(1);
  expect(api.sent('GET', '/admin/invitations')).toHaveLength(2);
});

test('A double submit of Cancel invitation sends one request; a 401 closes the dialog for "Sign in again" and resends nothing', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin });
  const reply = held();
  const replies = [reply.reply];
  const api = await adminApi(page, { before: request => (request.method === 'POST' ? replies.shift() : undefined) });
  await page.goto(`${APP}/admin/invitations`);
  await button(page, 'Cancel invitation to new@example.com').click();
  const confirm = dialog(page).locator('button[type="submit"]');
  await confirm.click();
  await expect(confirm).toHaveText('Saving…');
  await expect(confirm).toHaveAttribute('aria-disabled', 'true');
  await confirm.click({ force: true });
  await dialogField(page, 'Reason (optional)').press('Enter'); // a textarea: Enter adds a line, it sends nothing
  await inDialog(page, 'Cancel').click({ force: true }); // nothing is cancelled while the request is in flight
  await page.waitForTimeout(250);
  await expect(dialog(page)).toBeVisible();
  expect(api.sent('POST', '/invites/61/cancel')).toHaveLength(1);
  reply.release(REPLIES.unauthenticated);
  await expect(dialogError(page)).toHaveText('Error: Your sign-in has expired.');
  await inDialog(page, 'Sign in again').click();
  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__openSignInCalls)).toBe(1);
  await expect(rows(page)).toHaveCount(2);
  await expectNoCode(page, CODES);
  expect(api.sent('POST', '/invites/61/cancel').map(r => r.body)).toEqual([{}]);
});

test('The last active Super Admin: disable and role change show the cause in plain words, keep the dialog and the reason', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin });
  const api = await adminApi(page);
  await page.goto(`${APP}/admin/staff/1`);
  await expect(heading(page)).toHaveText('Arnav Admin');
  const message = 'Error: This is the last active Super Admin. Invite or enable another Super Admin first.';

  await button(page, 'Disable account').click();
  await dialogField(page, 'Reason').fill('Handing over');
  await inDialog(page, 'Disable account').click();
  await expect(dialogError(page)).toHaveText(message);
  await expect(dialogField(page, 'Reason')).toHaveValue('Handing over');
  await expect(dialog(page).getByRole('link', { name: 'Reload the page' })).toHaveAttribute('href', '/admin/staff/1');
  await expectNoCode(page, CODES);
  await inDialog(page, 'Cancel').click();
  await expect(dialog(page)).toHaveCount(0);

  await radio(page, 'Tournament Manager').check();
  await button(page, 'Change role').click();
  await expect(dialogError(page)).toHaveCount(0); // a new dialog starts with no old error
  await inDialog(page, 'Change role').click();
  await expect(dialogError(page)).toHaveText(message);
  await expectNoCode(page, CODES);
  await inDialog(page, 'Cancel').click();
  await expect(radio(page, 'Tournament Manager')).toBeChecked();
  await expect(facts(page)).toContainText('RoleSuper Admin');
  expect(api.sent('POST', '/accounts/1/disable').map(r => r.body)).toEqual([{ reason: 'Handing over' }]);
  expect(api.sent('POST', '/accounts/1/role').map(r => r.body)).toEqual([{ role: 'TOURNAMENT_MANAGER' }]);
});

test('An account that became an owner: the refusal asks for a transfer first, and the reload shows the owned tournament link', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin });
  const api = await adminApi(page, {
    before: (request, state) => {
      // Another Super Admin gave Kabir a tournament after this page loaded.
      if (request.method === 'POST' && state.tournaments.length === 1) {
        state.tournaments.push({ slug: 'autumn-open', name: 'Autumn Open', status: 'DRAFT', startsOn: '2026-11-02', endsOn: '2026-11-04', sports: [], ownerId: '3' });
      }
      return undefined;
    },
  });
  await page.goto(`${APP}/admin/staff/3`);
  await expect(main(page)).toContainText('This account owns no tournaments.');
  await radio(page, 'Match Scorer').check();
  await button(page, 'Change role').click();
  await inDialog(page, 'Change role').click();
  const message = 'Error: This account owns a tournament. Transfer ownership first.';
  await expect(dialogError(page)).toHaveText(message);
  await inDialog(page, 'Cancel').click();

  await button(page, 'Disable account').click();
  await dialogField(page, 'Reason').fill('Left the event');
  await inDialog(page, 'Disable account').click();
  await expect(dialogError(page)).toHaveText(message);
  await expect(dialogField(page, 'Reason')).toHaveValue('Left the event');
  await expectNoCode(page, CODES);
  await dialog(page).getByRole('link', { name: 'Reload the page' }).click();
  await expect(heading(page)).toHaveText('Kabir Rao');
  await expect(link(page, 'Autumn Open')).toHaveAttribute('href', '/manage/tournaments/autumn-open');
  await expect(main(page)).toContainText('Transfer ownership of Autumn Open first. Then you can change the role or disable the account.');
  await expect(button(page, 'Disable account')).toHaveCount(0);
  expect(api.sent('POST', '/accounts/3/role').map(r => r.body)).toEqual([{ role: 'MATCH_OPERATOR' }]);
  expect(api.sent('POST', '/accounts/3/disable').map(r => r.body)).toEqual([{ reason: 'Left the event' }]);
});

test('A 500 and no response in the disable dialog keep the reason; "Try again" resends it', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin });
  const replies = [REPLIES.internal, 'abort'];
  const api = await adminApi(page, { before: request => (request.method === 'POST' ? replies.shift() : undefined) });
  await page.goto(`${APP}/admin/staff/4`);
  await button(page, 'Disable account').click();
  await dialogField(page, 'Reason').fill('Left the event');
  await inDialog(page, 'Disable account').click();
  await expect(dialogError(page)).toHaveText('Error: Something went wrong. Nothing was saved.');
  await expect(dialogField(page, 'Reason')).toHaveValue('Left the event');
  await inDialog(page, 'Try again').click();
  await expect(dialogError(page)).toHaveText('Error: Could not reach the server. Your changes are still here.');
  await expect(dialogField(page, 'Reason')).toHaveValue('Left the event');
  await expectNoCode(page, CODES);
  await inDialog(page, 'Try again').click();
  await expect(status(page, 'Asha Singh is disabled.')).toBeVisible();
  await expect(facts(page)).toContainText('StatusDisabled');
  expect(api.sent('POST', '/accounts/4/disable').map(r => r.body)).toEqual(Array(3).fill({ reason: 'Left the event' }));
});
