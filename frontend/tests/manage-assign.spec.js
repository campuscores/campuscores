// Assign scorer and Invite scorer (task 16.6; Req 13.1 to 13.8, 20.1 to 20.8, 21.1, 21.6): email outcomes, the invite
// handoff, self assign, reassign with a reason, Remove scorer, the Matches "Score" link and keyboard-only completion.
// Live-mode build with a stub Clerk and a mocked API. The replies copy backend/src/routes/assignments.js and
// invites.js, and the tests check each request body against the fields those routes read. The device clock runs
// outside India time, so the invitation expiry proves the IST text.
import { test, expect } from '@playwright/test';
import { istDate, timeText } from '../../shared/time.mjs';
import { apiError, expectNoCode, held, mockStaff, REPLIES, STAFF_APP as APP, tabTo } from './helpers.js';
import { assignApi, matchRow, ME } from './manage-fakes.js';

test.use({ locale: 'en-GB', timezoneId: 'America/Los_Angeles' });

const main = page => page.getByRole('main');
const heading = page => page.locator('main h1');
const field = (page, label) => main(page).getByLabel(label, { exact: true });
const button = (page, name) => main(page).getByRole('button', { name, exact: true });
const link = (page, name) => main(page).getByRole('link', { name, exact: true });
const dialog = page => page.getByRole('dialog');
const facts = page => main(page).locator('.facts');
const alert = page => main(page).locator('.staff-notice.is-error');
const status = (page, text) => page.getByRole('status').filter({ hasText: text });
const email = page => field(page, 'Scorer email');
async function expectFieldError(input, message) {
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  const id = await input.evaluate(el => el.getAttribute('aria-describedby').split(' ').find(part => part.endsWith('-error')));
  await expect(input.page().locator(`[id="${id}"]`)).toHaveText(`Error: ${message}`);
}
const ASSIGN_21 = '/matches/21/assignments'; // Falcons vs Hawks: Upcoming, no scorer
const ASSIGN_22 = '/matches/22/assignments'; // Eagles vs Owls: Live, scored by Ravi (assignment 91)
// macOS WebKit follows Safari: plain Tab skips links and buttons; Option+Tab reaches every item.
const tabKey = browserName => (browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab');

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', err => page.errors.push(err.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

test('Assign by keyboard only from Matches: the email is normalised, no window is sent, and focus moves to the h1 after the save', async ({ page, browserName }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const api = await assignApi(page);
  const tab = tabKey(browserName);
  await page.goto(`${APP}/manage/matches`);
  await tabTo(page, link(page, 'Assign scorer for Falcons vs Hawks'), tab);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${APP}/manage/matches/21/scorer`);
  await expect(heading(page)).toHaveText('Assign scorer');
  await expect(heading(page)).toBeFocused();
  await expect(facts(page)).toContainText('MatchSF1 (Semi-final 1): Falcons vs Hawks');
  await expect(facts(page)).toContainText('ScorerNo scorer');
  await expect(page.locator('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])')).toHaveCount(0);

  await tabTo(page, email(page), tab);
  await page.keyboard.type(' Asha@Example.com ');
  await tabTo(page, button(page, 'Assign scorer'), tab);
  await page.keyboard.press('Enter');
  await expect(status(page, 'Assigned asha@example.com to Falcons vs Hawks.')).toBeVisible();
  await expect(facts(page)).toContainText('ScorerAsha (fake) (asha@example.com)');
  // The reload replaced the form; focus is on the h1, not lost to the page body, and Tab reaches the new form.
  await expect(heading(page)).toBeFocused();
  await tabTo(page, email(page), tab);
  await expect(button(page, 'Reassign scorer')).toBeVisible();
  await expect(email(page)).toHaveValue('');
  // POST /api/matches/:id/assignments reads self, email, accountId, reason, validFrom and validUntil (Req 13.8: no window).
  expect(api.sent('POST', ASSIGN_21).map(r => r.body)).toEqual([{ email: 'asha@example.com' }]);
});

test('Each email outcome shows below Scorer email with no code and keeps the value; only "No scorer account" offers an invite', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const api = await assignApi(page);
  await page.goto(`${APP}/manage/matches/21/scorer`);
  const outcomes = [
    ['bad@example.com', 'Enter an email address like name@example.com.', 'BAD_REQUEST'],
    ['pending@example.com', 'An invitation to this email is waiting to be accepted.', 'INVITE_PENDING'],
    ['coach@example.com', 'This email belongs to an account that is not a Match Scorer.', 'NOT_A_SCORER'],
    ['nobody@example.com', 'No scorer account uses this email.', 'SCORER_NOT_FOUND'],
  ];
  for (const [address, message, code] of outcomes) {
    await email(page).fill(address);
    await button(page, 'Assign scorer').click();
    await expectFieldError(email(page), message);
    await expect(email(page)).toHaveValue(address);
    await expect(alert(page)).toHaveText('');
    await expect(link(page, 'Invite as Match Scorer')).toHaveCount(code === 'SCORER_NOT_FOUND' ? 1 : 0);
    await expectNoCode(page, [code, 'email:']);
  }
  await expect(facts(page)).toContainText('ScorerNo scorer');
  expect(api.sent('POST', ASSIGN_21).map(r => r.body)).toEqual(outcomes.map(([address]) => ({ email: address })));
});

test('"Invite as Match Scorer" opens Invite scorer with the email; the invitation names its 7-day expiry in India time', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const api = await assignApi(page);
  await page.goto(`${APP}/manage/matches/21/scorer`);
  await email(page).fill('nobody@example.com');
  await email(page).press('Enter');
  await expectFieldError(email(page), 'No scorer account uses this email.');
  await link(page, 'Invite as Match Scorer').click();
  await expect(page).toHaveURL(`${APP}/manage/invite?email=nobody%40example.com`);
  await expect(heading(page)).toHaveText('Invite scorer');
  await expect(heading(page)).toBeFocused();
  await expect(field(page, 'Email')).toHaveValue('nobody@example.com');
  await expect(main(page)).toContainText('Role: Match Scorer');
  await button(page, 'Send invitation').click();
  const ms = Date.parse(api.state.invitations[0].expiresAt);
  const day = new Date(`${istDate(ms)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  await expect(status(page, `Invitation sent to nobody@example.com. It expires on ${day}, ${timeText(ms)}.`)).toBeVisible();
  // POST /api/invites reads email and role; a manager may invite only MATCH_OPERATOR (auth.js canInvite).
  expect(api.sent('POST', '/invites').map(r => r.body)).toEqual([{ email: 'nobody@example.com', role: 'MATCH_OPERATOR' }]);
  expect(api.sent('POST', ASSIGN_21)).toHaveLength(1); // the invitation creates no Assignment (Req 13.4)
});

test('"Score this match myself" sends { self: true }, needs a reason to replace a scorer, and the Score link opens the console with Back to Matches', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const api = await assignApi(page);
  await page.goto(`${APP}/manage/matches`);
  await expect(link(page, 'Assign scorer for Falcons vs Hawks')).toBeVisible();
  await expect(main(page).getByRole('link', { name: /^Score / })).toHaveCount(0); // no row has canScore yet

  await page.goto(`${APP}/manage/matches/21/scorer`);
  await button(page, 'Score this match myself').click();
  await expect(status(page, 'You now score Falcons vs Hawks.')).toBeVisible();
  await expect(facts(page)).toContainText(`Scorer${ME.name} (${ME.email})`);

  await page.goto(`${APP}/manage/matches/22/scorer`);
  await expect(facts(page)).toContainText('ScorerRavi (ravi@example.com)');
  await button(page, 'Score this match myself').click();
  const summary = main(page).locator('.error-summary');
  await expect(summary).toBeFocused();
  await expect(summary.getByRole('link')).toHaveText(['Enter a reason.']);
  expect(api.sent('POST', ASSIGN_22)).toEqual([]);
  await field(page, 'Reason').fill('Ravi is unwell');
  await button(page, 'Score this match myself').click();
  await expect(status(page, 'You now score Eagles vs Owls.')).toBeVisible();
  // Wait for the reload after the save, so the next page.goto cancels no request (WebKit reports a cancelled one as an error).
  await expect(facts(page)).toContainText(`Scorer${ME.name} (${ME.email})`);
  expect(api.sent('POST', ASSIGN_21).map(r => r.body)).toEqual([{ self: true }]);
  expect(api.sent('POST', ASSIGN_22).map(r => r.body)).toEqual([{ self: true, reason: 'Ravi is unwell' }]);

  await page.goto(`${APP}/manage/matches`);
  await expect(main(page).getByRole('link', { name: /^Score / })).toHaveText(['Score Falcons vs Hawks', 'Score Eagles vs Owls']);
  await link(page, 'Score Falcons vs Hawks').click();
  await expect(page).toHaveURL(`${APP}/operator/matches/21/score`);
  await expect(heading(page)).toHaveText('Falcons vs Hawks');
  await expect(page.getByRole('navigation', { name: 'Staff' }).getByRole('link', { name: 'Matches' })).toHaveAttribute('aria-current', 'page');
  await link(page, 'Back to Matches').click();
  await expect(page).toHaveURL(`${APP}/manage/matches`);
  await expect(heading(page)).toHaveText('Matches');
});

test('Reassign needs a Reason: on-blur error, a focused summary that sends nothing, then email and reason in one request', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const api = await assignApi(page);
  await page.goto(`${APP}/manage/matches/22/scorer`);
  await expect(main(page).getByRole('heading', { name: 'Change the scorer' })).toBeVisible();
  await email(page).fill('asha@example.com');
  await field(page, 'Reason').focus();
  await field(page, 'Reason').blur();
  await expectFieldError(field(page, 'Reason'), 'Enter a reason.');
  await button(page, 'Reassign scorer').click();
  const summary = main(page).locator('.error-summary');
  await expect(summary).toBeFocused();
  await expect(summary.getByRole('heading', { level: 2 })).toHaveText('There is 1 problem');
  await expect(summary.getByRole('link')).toHaveText(['Enter a reason.']);
  expect(api.sent('POST', ASSIGN_22)).toEqual([]);
  await field(page, 'Reason').fill('Ravi is unwell');
  await expect(field(page, 'Reason')).not.toHaveAttribute('aria-invalid', 'true');
  await button(page, 'Reassign scorer').click();
  await expect(status(page, 'Assigned asha@example.com to Eagles vs Owls.')).toBeVisible();
  await expect(facts(page)).toContainText('ScorerAsha (fake) (asha@example.com)');
  expect(api.sent('POST', ASSIGN_22).map(r => r.body)).toEqual([{ email: 'asha@example.com', reason: 'Ravi is unwell' }]);
});

test('Remove scorer: ConfirmDialog opens on Cancel, Escape returns focus, a late close event keeps a reopened dialog, and the reason is sent', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const api = await assignApi(page);
  await page.goto(`${APP}/manage/matches/22/scorer`);
  const remove = button(page, 'Remove scorer');
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('heading')).toHaveText('Remove Ravi from this match?');
  await expect(dialog(page).getByRole('listitem')).toHaveText(['The match has no scorer until you assign one.', 'Score actions they have not sent yet are refused.']);
  await expect(dialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(remove).toBeFocused();

  // The `close` event of a closed dialog is queued; a late one must not close the dialog opened again (the CI flake).
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog(page).evaluate(box => box.dispatchEvent(new Event('close')));
  await expect(dialog(page).getByRole('heading')).toHaveText('Remove Ravi from this match?');

  const confirm = dialog(page).getByRole('button', { name: 'Remove scorer' });
  await confirm.click();
  await expect(dialog(page).getByLabel('Reason', { exact: true })).toBeFocused();
  await expect(dialog(page).locator('.field-error')).toHaveText('Error: Enter a reason.');
  expect(api.sent('POST', '/assignments/91/revoke')).toEqual([]);
  await dialog(page).getByLabel('Reason', { exact: true }).fill('Ravi left the event');
  await confirm.click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(status(page, 'Removed Ravi from Eagles vs Owls.')).toBeVisible();
  await expect(facts(page)).toContainText('ScorerNo scorer');
  await expect(heading(page)).toBeFocused(); // the opener is gone with the old scorer, so focus goes to the h1
  // POST /api/assignments/:id/revoke reads only reason.
  expect(api.sent('POST', '/assignments/91/revoke').map(r => r.body)).toEqual([{ reason: 'Ravi left the event' }]);
});

test('A double submit sends one assignment request and shows "Saving…" until the reply', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const reply = held();
  const api = await assignApi(page, { before: request => (request.method === 'POST' ? reply.reply.then(() => undefined) : undefined) });
  await page.goto(`${APP}/manage/matches/21/scorer`);
  await email(page).fill('asha@example.com');
  const save = main(page).locator('button[type="submit"]');
  await save.click();
  await expect(save).toHaveText('Saving…');
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await save.click({ force: true }); // a user can still press an aria-disabled button
  await email(page).press('Enter');
  await button(page, 'Score this match myself').click({ force: true });
  await page.waitForTimeout(250); // time for a second request to reach the mock, if one were sent
  expect(api.sent('POST', ASSIGN_21)).toHaveLength(1);
  reply.release();
  await expect(status(page, 'Assigned asha@example.com to Falcons vs Hawks.')).toBeVisible();
  expect(api.sent('POST', ASSIGN_21).map(r => r.body)).toEqual([{ email: 'asha@example.com' }]);
});

test('A 401 offers "Sign in again", keeps the email and resends nothing until the next submit', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const replies = [REPLIES.unauthenticated];
  const api = await assignApi(page, { before: request => (request.method === 'POST' ? replies.shift() : undefined) });
  await page.goto(`${APP}/manage/matches/21/scorer`);
  await email(page).fill('asha@example.com');
  await button(page, 'Assign scorer').click();
  await expect(alert(page)).toHaveText('Error: Your sign-in has expired.');
  await button(page, 'Sign in again').click();
  await expect.poll(() => page.evaluate(() => window.__openSignInCalls)).toBe(1);
  await expect(email(page)).toHaveValue('asha@example.com');
  await expectNoCode(page);
  expect(api.sent('POST', ASSIGN_21)).toHaveLength(1);
  await button(page, 'Assign scorer').click();
  await expect(status(page, 'Assigned asha@example.com')).toBeVisible();
  await expect(button(page, 'Sign in again')).toHaveCount(0);
  expect(api.sent('POST', ASSIGN_21).map(r => r.body)).toEqual([{ email: 'asha@example.com' }, { email: 'asha@example.com' }]);
});

test('"Try again" resends the failed assign, self assign and invitation after no response, a 500 or a 502', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  // assign: no response; self: 500; its retry: accepted; invitation: 502; its retry: accepted.
  const replies = ['abort', REPLIES.internal, undefined, [502, apiError('CLERK_UNAVAILABLE', 'Clerk unavailable')]];
  const api = await assignApi(page, { before: request => (request.method === 'POST' ? replies.shift() : undefined) });
  await page.goto(`${APP}/manage/matches/21/scorer`);
  await email(page).fill('asha@example.com');
  await button(page, 'Assign scorer').click();
  await expect(alert(page)).toHaveText('Error: Could not reach the server. Your changes are still here.');
  await expect(email(page)).toHaveValue('asha@example.com');
  await expect(button(page, 'Try again')).toBeVisible();
  await button(page, 'Score this match myself').click(); // 500
  await expect(alert(page)).toHaveText('Error: Something went wrong. Nothing was saved.');
  await button(page, 'Try again').click(); // resends the self assign, not the email in the form
  await expect(status(page, 'You now score Falcons vs Hawks.')).toBeVisible();
  await expect(button(page, 'Try again')).toHaveCount(0);
  expect(api.sent('POST', ASSIGN_21).map(r => r.body)).toEqual([{ email: 'asha@example.com' }, { self: true }, { self: true }]);

  await page.goto(`${APP}/manage/invite?email=nobody%40example.com`);
  await button(page, 'Send invitation').click(); // 502
  await expect(field(page, 'Email')).toHaveValue('nobody@example.com');
  await expectNoCode(page, ['CLERK_UNAVAILABLE']);
  await button(page, 'Try again').click();
  await expect(status(page, 'Invitation sent to nobody@example.com.')).toBeVisible();
  expect(api.sent('POST', '/invites')).toHaveLength(2);
});

test('A 401 inside the Remove scorer dialog offers "Sign in again", closes the dialog for the sign-in and resends nothing', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const replies = [REPLIES.unauthenticated];
  const api = await assignApi(page, { before: request => (request.method === 'POST' ? replies.shift() : undefined) });
  await page.goto(`${APP}/manage/matches/22/scorer`);
  await button(page, 'Remove scorer').click();
  await dialog(page).getByLabel('Reason', { exact: true }).fill('Ravi left the event');
  await dialog(page).getByRole('button', { name: 'Remove scorer' }).click();
  await expect(dialog(page).locator('.field-error')).toHaveText('Error: Your sign-in has expired.');
  await dialog(page).getByRole('button', { name: 'Sign in again' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__openSignInCalls)).toBe(1);
  await expect(button(page, 'Sign in again')).toBeVisible();
  await expect(facts(page)).toContainText('ScorerRavi (ravi@example.com)');
  expect(api.sent('POST', '/assignments/91/revoke').map(r => r.body)).toEqual([{ reason: 'Ravi left the event' }]);
});

test('A 409 MATCH_CLOSED names the cause in plain words and the closed match shows no form', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  await assignApi(page, {
    before: (request, state) => {
      if (request.method === 'POST') state.matches[0] = matchRow({ id: '21', stage: 'SF1', status: 'APPROVED', phase: 'past', score: '2\u20130', hasActions: true });
      return undefined; // the fake refuses an assign to a past match with 409 MATCH_CLOSED
    },
  });
  await page.goto(`${APP}/manage/matches/21/scorer`);
  await email(page).fill('asha@example.com');
  await button(page, 'Assign scorer').click();
  await expect(alert(page)).toHaveText('Error: This match is live, final or not scored, so it cannot change.');
  await expect(main(page)).toContainText('The scorer of this match cannot change now, because the match is over or the tournament is locked.');
  await expect(main(page).locator('form')).toHaveCount(0);
  await expectNoCode(page, ['MATCH_CLOSED', 'closed to assignment']);
});
