// Matches and the Match editor (task 14.7; Req 19.4, 19.5, 20.1 to 20.9, 21.1, 21.6, 21.8): filters in the query
// string, row controls from the API flags, create, edit, read-only summary and delete. Live-mode build with a stub
// Clerk and a mocked API whose rows copy the staff match row of backend/src/routes/manage.js; the tests check the
// request bodies and filter values against the fields manage.js reads. The device clock runs outside India time.
import { test, expect } from '@playwright/test';
import { apiError, expectNoCode, held, mockStaff, REPLIES, STAFF_APP as APP, tabTo } from './helpers.js';
import { matchesApi, matchRow, TODAY } from './manage-fakes.js';

test.use({ locale: 'en-GB', timezoneId: 'America/Los_Angeles' });

const main = page => page.getByRole('main');
const heading = page => page.locator('main h1');
const field = (page, label) => main(page).getByLabel(label, { exact: true });
const button = (page, name) => main(page).getByRole('button', { name, exact: true });
const link = (page, name) => main(page).getByRole('link', { name, exact: true });
const dialog = page => page.getByRole('dialog');
const rows = page => main(page).locator('.data-cards > li:visible, .data-table tbody tr:visible');
const alert = page => main(page).locator('.staff-notice.is-error');
const status = (page, text) => page.getByRole('status').filter({ hasText: text });
/** "21 Oct 2026": the Views' dateText, computed in the page so the browser's own date names are used. */
const dateText = (page, date) => page.evaluate(d => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }), date);
async function expectFieldError(input, message) {
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  const id = await input.evaluate(el => el.getAttribute('aria-describedby').split(' ').find(part => part.endsWith('-error')));
  await expect(input.page().locator(`[id="${id}"]`)).toHaveText(`Error: ${message}`);
}
const NEW_MATCH = `${APP}/manage/matches/new?tournament=spring-cup&sport=badminton`;
const EDIT_BODY = { date: TODAY, time: '14:30', stage: 'SF1', sideA: '11', sideB: '12', venue: 'Court 2' };

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', err => page.errors.push(err.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

test('Matches: filters live in the query string, send the API phase, survive reload and Back, and Clear filters empties them', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const api = await matchesApi(page);
  await page.goto(`${APP}/manage/matches`);
  await expect(rows(page)).toHaveCount(4);
  await expect(main(page).getByRole('heading', { name: '4 matches' })).toBeVisible();
  expect(api.lastList()).toEqual({});
  await expect(main(page)).toContainText('SF1 (Semi-final 1): Falcons vs Hawks');
  await expectNoCode(page, ['SCHEDULED', 'APPROVED', 'LIVE', 'CUSTOM', 'BRACKET', 'table-tennis', 'badminton']);

  // Row controls follow the API flags.
  await expect(link(page, 'Edit Falcons vs Hawks')).toBeVisible();
  await expect(link(page, 'Assign scorer for Falcons vs Hawks')).toBeVisible();
  await expect(button(page, 'Delete Falcons vs Hawks')).toBeVisible();
  await expect(link(page, 'Change scorer for Eagles vs Owls')).toBeVisible();
  await expect(main(page).getByRole('link', { name: /Eagles vs Owls$/ }).or(main(page).getByRole('button', { name: /Eagles vs Owls$/ }))).toHaveText(['Change scorer for Eagles vs Owls']);
  await expect(rows(page).filter({ hasText: 'Lions vs Tigers' }).getByRole('link').or(rows(page).filter({ hasText: 'Lions vs Tigers' }).getByRole('button'))).toHaveCount(0);

  await field(page, 'Sport').selectOption({ label: 'Badminton' });
  await expect(page).toHaveURL(`${APP}/manage/matches?sport=badminton`);
  await expect(rows(page)).toHaveCount(2);
  expect(api.lastList()).toEqual({ sport: 'badminton' });

  await field(page, 'Status').selectOption({ label: 'Scheduled' });
  await expect(page).toHaveURL(`${APP}/manage/matches?sport=badminton&phase=scheduled`);
  await expect(rows(page)).toHaveText([/Falcons vs Hawks/]);
  expect(api.lastList()).toEqual({ sport: 'badminton', phase: 'upcoming' });

  await field(page, 'Sport').selectOption({ label: 'All sports' });
  await field(page, 'Status').selectOption({ label: 'Not scored' });
  await expect(page).toHaveURL(`${APP}/manage/matches?phase=not-scored`);
  await expect(rows(page)).toHaveText([/Aces vs Spins/]); // API "past" also returns the Final row; the page keeps Not scored
  await expect(main(page).getByRole('heading', { name: '1 match' })).toBeVisible();
  expect(api.lastList()).toEqual({ phase: 'past' });

  await field(page, 'Status').selectOption({ label: 'Final' });
  await expect(rows(page)).toHaveText([/Lions vs Tigers/]);
  await page.reload();
  await expect(page).toHaveURL(`${APP}/manage/matches?phase=final`);
  await expect(field(page, 'Status')).toHaveValue('final');
  await expect(rows(page)).toHaveText([/Lions vs Tigers/]);
  await page.goBack();
  await expect(page).toHaveURL(`${APP}/manage/matches?phase=not-scored`);
  await expect(field(page, 'Status')).toHaveValue('not-scored');
  await expect(rows(page)).toHaveText([/Aces vs Spins/]);

  await field(page, 'Date').fill(TODAY);
  await expect(page).toHaveURL(`${APP}/manage/matches?phase=not-scored&date=${TODAY}`);
  await expect(main(page)).toContainText('No matches match these filters.');
  expect(api.lastList()).toEqual({ date: TODAY, phase: 'past' });

  await button(page, 'Clear filters').click();
  await expect(page).toHaveURL(`${APP}/manage/matches`);
  await expect(rows(page)).toHaveCount(4);
  await expect(button(page, 'Clear filters')).toHaveCount(0);
  await expect(field(page, 'Status')).toHaveValue('');
  expect(api.lastList()).toEqual({});
});

test('Matches: Delete opens ConfirmDialog on Cancel, Escape returns focus, and a double confirm sends one DELETE with the reason', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const reply = held();
  const api = await matchesApi(page, { before: request => (request.method === 'DELETE' ? reply.reply.then(() => undefined) : undefined) });
  await page.goto(`${APP}/manage/matches`);
  const remove = button(page, 'Delete Falcons vs Hawks');
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('heading')).toHaveText('Delete Falcons vs Hawks?');
  await expect(dialog(page).getByRole('listitem')).toHaveText(['Removes the match from the schedule.', 'Removes its scorer assignment.', 'This cannot be undone.']);
  await expect(dialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(remove).toBeFocused();
  expect(api.sent('DELETE', '/manage/matches/21')).toEqual([]);

  await page.keyboard.press('Enter');
  await dialog(page).getByLabel('Reason (optional)').fill('Rain');
  const confirm = dialog(page).locator('button[type="submit"]');
  await confirm.click();
  await expect(confirm).toHaveText('Saving…');
  await expect(confirm).toHaveAttribute('aria-disabled', 'true');
  await confirm.click({ force: true }); // a user can still press an aria-disabled button
  await page.waitForTimeout(250); // time for a second request to reach the mock, if one were sent
  expect(api.sent('DELETE', '/manage/matches/21')).toHaveLength(1);
  reply.release();
  await expect(dialog(page)).toHaveCount(0);
  await expect(status(page, 'Deleted Falcons vs Hawks.')).toBeVisible();
  await expect(rows(page)).toHaveCount(3);
  expect(api.sent('DELETE', '/manage/matches/21').map(r => r.body)).toEqual([{ reason: 'Rain' }]);
});

test('Add match by keyboard only: date and venue prefilled, India time, and the POST body matches the API contract', async ({ page, isMobile, browserName }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const api = await matchesApi(page);
  await page.goto(NEW_MATCH);
  await expect(heading(page)).toHaveText('Add match');
  await expect(heading(page)).toBeFocused();
  await expect(main(page).getByRole('radio', { name: 'Badminton · Spring Cup' })).toBeChecked();
  await expect(field(page, 'Date')).toHaveValue(TODAY);
  await expect(field(page, 'Venue (optional)')).toHaveValue('Main Ground');
  await expect(page.locator('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])')).toHaveCount(0);

  await tabTo(page, field(page, 'Time (IST)'));
  // Mobile Chromium renders a time input as a picker button with no typed segments; a phone user picks the time there.
  // WebKit's time field takes typed digits differently on each platform (CI typed "1430" and kept ""), so like a
  // phone picker it gets the value set directly. Chromium and Firefox desktop take the typed 14 30.
  if (isMobile || browserName === 'webkit') await field(page, 'Time (IST)').fill('14:30');
  else await page.keyboard.type('1430');
  await expect(field(page, 'Time (IST)')).toHaveValue('14:30');
  await tabTo(page, field(page, 'Side A'));
  await page.keyboard.type('F');
  await expect(field(page, 'Side A')).toHaveValue('11');
  await tabTo(page, field(page, 'Side B'));
  await page.keyboard.type('H');
  await expect(field(page, 'Side B')).toHaveValue('12');
  await tabTo(page, button(page, 'Save match'));
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(`${APP}/manage/matches?tournament=spring-cup&sport=badminton`);
  await expect(status(page, `Saved Falcons vs Hawks, ${await dateText(page, TODAY)}, 14:30 IST.`)).toBeVisible();
  // POST /api/manage/matches reads tournament, sport, date, time (India time), stage, sideA, sideB and venue.
  expect(api.sent('POST', '/manage/matches').map(r => r.body)).toEqual([
    { tournament: 'spring-cup', sport: 'badminton', date: TODAY, time: '14:30', stage: null, sideA: '11', sideB: '12', venue: 'Main Ground' },
  ]);
});

test('Match form: on-blur errors and a focused summary send nothing; API errors keep values with no code; "Try again" resends', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const replies = [[409, apiError('STAGE_TAKEN', 'The SF1 stage is already scheduled for this sport.')],
    [400, apiError('BAD_REQUEST', 'date: Enter a date that is today or later.')], [500, apiError('INTERNAL', 'Internal error')]];
  const api = await matchesApi(page, { before: request => (request.method === 'POST' ? replies.shift() : undefined) });
  await page.goto(NEW_MATCH);
  const time = field(page, 'Time (IST)');
  await tabTo(page, time);
  // Tab moves between the hour and minute parts of a desktop time input, so leave the field with Shift+Tab.
  await tabTo(page, field(page, 'Date'), 'Shift+Tab');
  await expectFieldError(time, 'Enter the match time.');
  await field(page, 'Side A').selectOption('11');
  await field(page, 'Side B').selectOption('11');
  await field(page, 'Side B').focus();
  await field(page, 'Side B').blur();
  await expectFieldError(field(page, 'Side B'), 'Choose two different sides.');

  await button(page, 'Save match').click();
  const summary = main(page).locator('.error-summary');
  await expect(summary).toBeFocused();
  await expect(summary.getByRole('heading', { level: 2 })).toHaveText('There are 2 problems');
  await expect(summary.getByRole('link')).toHaveText(['Enter the match time.', 'Choose two different sides.']);
  expect(api.sent('POST', '/manage/matches')).toEqual([]);

  await time.fill('14:30');
  await field(page, 'Side B').selectOption('12');
  await field(page, 'Stage').selectOption('SF1');
  await button(page, 'Save match').click();
  await expectFieldError(field(page, 'Stage'), 'This stage is already used in this sport.');
  await expect(alert(page)).toHaveText('');
  const kept = async () => {
    await expect(time).toHaveValue('14:30');
    await expect(field(page, 'Stage')).toHaveValue('SF1');
    await expect(field(page, 'Side B')).toHaveValue('12');
  };
  await kept();
  await expectNoCode(page, ['STAGE_TAKEN']);

  await button(page, 'Save match').click();
  await expectFieldError(field(page, 'Date'), 'Enter a date that is today or later.');
  await kept();

  await button(page, 'Save match').click();
  await expect(alert(page)).toHaveText('Error: Something went wrong. Nothing was saved.');
  await kept();
  await expectNoCode(page);
  await button(page, 'Try again').click();
  await expect(page).toHaveURL(`${APP}/manage/matches?tournament=spring-cup&sport=badminton`);
  const body = { tournament: 'spring-cup', sport: 'badminton', date: TODAY, time: '14:30', stage: 'SF1', sideA: '11', sideB: '12', venue: 'Main Ground' };
  expect(api.sent('POST', '/manage/matches').map(r => r.body)).toEqual([body, body, body, body]);
});

test('Edit an Upcoming match: a double submit sends one PATCH and the save is announced in place', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const reply = held();
  const api = await matchesApi(page, { before: request => (request.method === 'PATCH' ? reply.reply.then(() => undefined) : undefined) });
  await page.goto(`${APP}/manage/matches/21`);
  await expect(heading(page)).toHaveText('Edit match');
  await expect(field(page, 'Date')).toHaveValue(TODAY);
  await expect(field(page, 'Time (IST)')).toHaveValue('14:30');
  await expect(field(page, 'Stage')).toHaveValue('SF1');
  await expect(field(page, 'Side A')).toHaveValue('11');
  await expect(field(page, 'Side B')).toHaveValue('12');
  await field(page, 'Venue (optional)').fill('Court 2');
  const save = main(page).locator('button[type="submit"]');
  await save.click();
  await expect(save).toHaveText('Saving…');
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await save.click({ force: true }); // a user can still press an aria-disabled button
  await field(page, 'Venue (optional)').press('Enter');
  await page.waitForTimeout(250); // time for a second request to reach the mock, if one were sent
  expect(api.sent('PATCH', '/manage/matches/21')).toHaveLength(1);
  reply.release();
  await expect(status(page, `Saved Falcons vs Hawks, ${await dateText(page, TODAY)}, 14:30 IST.`)).toBeVisible();
  await expect(save).toHaveText('Save match');
  await expect(field(page, 'Venue (optional)')).toHaveValue('Court 2');
  // PATCH /api/manage/matches/:id reads date, time, stage, sideA, sideB and venue.
  expect(api.sent('PATCH', '/manage/matches/21').map(r => r.body)).toEqual([EDIT_BODY]);
});

for (const [id, phase, sentence] of [['22', 'Live', 'This match is live, so it cannot change.'], ['23', 'Final', 'This match is over, so it cannot change.'],
  ['24', 'Not scored', 'This match is over, so it cannot change.']]) {
  test(`A ${phase} match shows a read-only summary with no form and no Delete`, async ({ page }) => {
    await mockStaff(page, { me: REPLIES.manager });
    await matchesApi(page);
    await page.goto(`${APP}/manage/matches/${id}`);
    await expect(heading(page)).toHaveText('Edit match');
    await expect(main(page).locator('.facts')).toContainText(`Status${phase}`);
    await expect(main(page)).toContainText(sentence);
    await expect(main(page).locator('form')).toHaveCount(0);
    await expect(button(page, 'Delete match')).toHaveCount(0);
    if (id === '22') {
      await expect(main(page).locator('.facts')).toContainText('Score11\u20137');
      await expect(main(page).locator('.facts')).toContainText('ScorerRavi');
    }
    await expectNoCode(page, ['LIVE', 'APPROVED', 'SCHEDULED']);
  });
}

test('Editor Delete confirms with focus on Cancel, Escape returns focus, then Matches announces the delete', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const api = await matchesApi(page);
  await page.goto(`${APP}/manage/matches/21`);
  const remove = button(page, 'Delete match');
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('heading')).toHaveText('Delete Falcons vs Hawks?');
  await expect(dialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(remove).toBeFocused();
  await page.keyboard.press('Enter');
  await dialog(page).getByRole('button', { name: 'Delete match' }).click();
  await expect(page).toHaveURL(`${APP}/manage/matches`);
  await expect(status(page, 'Deleted Falcons vs Hawks.')).toBeVisible();
  await expect(rows(page)).toHaveCount(3);
  expect(api.sent('DELETE', '/manage/matches/21').map(r => r.body)).toEqual([null]);
});

test('Editor save: a 401 offers "Sign in again", keeps the values and resends nothing until the next submit', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const replies = [REPLIES.unauthenticated];
  const api = await matchesApi(page, { before: request => (request.method === 'PATCH' ? replies.shift() : undefined) });
  await page.goto(`${APP}/manage/matches/21`);
  await field(page, 'Venue (optional)').fill('Court 2');
  await button(page, 'Save match').click();
  await expect(alert(page)).toHaveText('Error: Your sign-in has expired.');
  await button(page, 'Sign in again').click();
  await expect.poll(() => page.evaluate(() => window.__openSignInCalls)).toBe(1);
  await expect(field(page, 'Venue (optional)')).toHaveValue('Court 2');
  await expectNoCode(page);
  expect(api.sent('PATCH', '/manage/matches/21')).toHaveLength(1);
  await button(page, 'Save match').click();
  await expect(status(page, 'Saved Falcons vs Hawks')).toBeVisible();
  expect(api.sent('PATCH', '/manage/matches/21').map(r => r.body)).toEqual([EDIT_BODY, EDIT_BODY]);
});

test('Editor save: a 409 MATCH_CLOSED names the cause in plain words and the read-only summary replaces the form', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  await matchesApi(page, {
    before: (request, state) => {
      if (request.method !== 'PATCH') return undefined;
      state.matches[0] = matchRow({ id: '21', stage: 'SF1', status: 'LIVE', phase: 'live', hasActions: true }); // it went live meanwhile
      return [409, apiError('MATCH_CLOSED', 'This match is no longer scheduled and cannot be changed.')];
    },
  });
  await page.goto(`${APP}/manage/matches/21`);
  await field(page, 'Venue (optional)').fill('Court 2');
  await button(page, 'Save match').click();
  await expect(alert(page)).toHaveText('Error: This match is live, final or not scored, so it cannot change.');
  await expect(main(page)).toContainText('This match is live, so it cannot change.');
  await expect(main(page).locator('form')).toHaveCount(0);
  await expectNoCode(page, ['MATCH_CLOSED', 'no longer scheduled']);
});

test('Editor: unsaved values ask before the Back link and browser Back; Cancel keeps them, Leave goes', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  await matchesApi(page);
  await page.goto(`${APP}/manage/matches`);
  await link(page, 'Edit Falcons vs Hawks').click();
  await expect(heading(page)).toHaveText('Edit match');
  await field(page, 'Venue (optional)').fill('Court 2');
  const back = link(page, 'Back to Matches');
  await back.focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('heading')).toHaveText('Leave without saving?');
  await expect(dialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toHaveCount(0);
  await expect(back).toBeFocused();
  await expect(page).toHaveURL(`${APP}/manage/matches/21`);
  await expect(field(page, 'Venue (optional)')).toHaveValue('Court 2');

  await page.goBack();
  await expect(dialog(page).getByRole('heading')).toHaveText('Leave without saving?');
  await dialog(page).getByRole('button', { name: 'Leave without saving' }).click();
  await expect(page).toHaveURL(`${APP}/manage/matches`);
  await expect(heading(page)).toHaveText('Matches');
});
