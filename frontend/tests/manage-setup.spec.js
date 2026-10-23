// Manager tournament screens (task 14.7; Req 19.4, 19.5, 20.1 to 20.9, 21.1, 21.6, 21.8): Guided_Setup steps 1 to 3,
// Tournament overview and details, and Teams. Live-mode build with a stub Clerk and a mocked API whose replies copy
// backend/src/routes/manage.js; each test checks the request bodies against the fields manage.js reads.
import { test, expect } from '@playwright/test';
import { apiError, expectNoCode, held, mockStaff, REPLIES, STAFF_APP as APP, tabKey, tabTo } from './helpers.js';
import { LATER, TODAY, tournamentApi, tournamentRow } from './manage-fakes.js';


const main = page => page.getByRole('main');
const heading = page => page.locator('main h1');
const field = (page, label) => main(page).getByLabel(label, { exact: true });
const button = (page, name) => main(page).getByRole('button', { name, exact: true });
const dialog = page => page.getByRole('dialog');
/** The error shown below `input` and linked to it with aria-describedby and aria-invalid (Req 20.1). */
async function expectFieldError(input, message) {
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  const id = await input.evaluate(el => el.getAttribute('aria-describedby').split(' ').find(part => part.endsWith('-error')));
  await expect(input.page().locator(`[id="${id}"]`)).toHaveText(`Error: ${message}`);
}
async function expectNoFieldError(input) {
  await expect(input).not.toHaveAttribute('aria-invalid', 'true');
  await expect(input).not.toHaveAttribute('aria-describedby', /-error/);
}
async function fillCreateForm(page) {
  await field(page, 'Tournament name').fill('Spring Cup');
  await field(page, 'Start date').fill(TODAY);
  await field(page, 'End date (optional)').fill(LATER);
  await field(page, 'Venue (optional)').fill('Main Ground');
}
const CREATE_BODY = { name: 'Spring Cup', startsOn: TODAY, endsOn: LATER, venue: 'Main Ground', description: '' };

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', err => page.errors.push(err.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

test('Guided setup by keyboard only: step 1 creates the Draft, step 2 adds a sport, step 3 adds a team with a jersey and captain', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const api = await tournamentApi(page);
  await page.goto(`${APP}/manage/tournaments/new`);
  await expect(heading(page)).toHaveText('Step 1 of 5: Tournament details');
  await expect(heading(page)).toBeFocused();
  await expect(page.locator('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])')).toHaveCount(0); // no positive tabindex (Req 21.1)

  await tabTo(page, field(page, 'Tournament name'));
  await page.keyboard.type('Spring Cup');
  await tabTo(page, field(page, 'Start date'));
  // The browser's native date control takes the value: Chromium orders typed day/month/year segments by the OS or
  // browser UI language (Windows regional format, Linux LANG), not by the page locale, so typed digits are not portable.
  // Mobile Chromium shows a picker button with no typed segments at all.
  await field(page, 'Start date').fill(TODAY);
  await expect(field(page, 'Start date')).toHaveValue(TODAY);
  await tabTo(page, field(page, 'Venue (optional)'));
  await page.keyboard.type('Main Ground');
  await tabTo(page, button(page, 'Save and continue'));
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(`${APP}/manage/tournaments/spring-cup/setup/sports`);
  await expect(heading(page)).toHaveText('Step 2 of 5: Sports');
  await expect(heading(page)).toBeFocused();
  // POST /api/manage/tournaments reads name, startsOn, endsOn, venue and description; an empty end date is the start date.
  expect(api.sent('POST', '/manage/tournaments').map(r => r.body)).toEqual([{ name: 'Spring Cup', startsOn: TODAY, endsOn: TODAY, venue: 'Main Ground', description: '' }]);

  await tabTo(page, main(page).getByRole('checkbox', { name: 'Football' }));
  await page.keyboard.press('Space');
  await expect(main(page).getByRole('checkbox', { name: 'Football' })).toBeChecked();
  await tabTo(page, button(page, 'Save and continue'));
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(`${APP}/manage/tournaments/spring-cup/setup/teams`);
  await expect(heading(page)).toHaveText('Step 3 of 5: Teams');
  expect(api.sent('POST', '/manage/tournaments/spring-cup/sports').map(r => r.body)).toEqual([{ sport: 'football' }]);

  await tabTo(page, field(page, 'Team name'));
  await page.keyboard.type('Red Falcons');
  const details = button(page, 'Add details');
  await tabTo(page, details);
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('aria-expanded', 'true');
  await tabTo(page, field(page, 'Player name'));
  await page.keyboard.type('Asha');
  await tabTo(page, field(page, 'Jersey number (optional)'));
  await page.keyboard.type('7');
  await tabTo(page, main(page).getByRole('checkbox', { name: 'Captain' }));
  await page.keyboard.press('Space');
  await tabTo(page, button(page, 'Add player'));
  await page.keyboard.press('Enter');
  await expect(main(page).getByText('Asha, number 7, captain')).toBeVisible();
  await tabTo(page, button(page, 'Add team'));
  await page.keyboard.press('Enter');

  await expect(page.getByRole('status').filter({ hasText: 'Added Red Falcons to Football.' })).toBeVisible();
  // The API Player_Entry names the jersey `jersey` (backend validatePlayers drops any other key).
  expect(api.sent('POST', '/manage/tournaments/spring-cup/sports/football/teams').map(r => r.body))
    .toEqual([{ name: 'Red Falcons', branch: '', year: null, players: [{ name: 'Asha', jersey: 7, captain: true }] }]);
  expect(api.state.teams.football[0].players).toEqual([{ name: 'Asha', jersey: 7, captain: true }]);
  await expect(main(page).getByRole('listitem').filter({ hasText: 'Red Falcons' })).toBeVisible();
  await expect(field(page, 'Team name')).toHaveValue(''); // the form starts again for the next team
});

test('Step 1: on-blur errors name the field and fix, and a failed submit focuses the error summary and sends nothing', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const api = await tournamentApi(page);
  await page.goto(`${APP}/manage/tournaments/new`);
  const name = field(page, 'Tournament name');
  await tabTo(page, name);
  await page.keyboard.press('Tab');
  await expectFieldError(name, 'Enter the tournament name.');
  await name.fill('S');
  await expectNoFieldError(name);

  await field(page, 'Start date').fill(LATER);
  await field(page, 'End date (optional)').fill(TODAY);
  await tabTo(page, field(page, 'Venue (optional)')); // focus leaves End date
  await expectFieldError(field(page, 'End date (optional)'), 'Choose an end date on or after the start date.');

  await name.fill('');
  await button(page, 'Save and continue').click();
  const summary = main(page).locator('.error-summary');
  await expect(summary).toBeFocused();
  await expect(summary.getByRole('heading', { level: 2 })).toHaveText('There are 2 problems');
  await expect(summary.getByRole('link')).toHaveText(['Enter the tournament name.', 'Choose an end date on or after the start date.']);
  await summary.getByRole('link', { name: 'Enter the tournament name.' }).click();
  await expect(name).toBeFocused();
  expect(api.requests).toEqual([]);
});

test('Step 1: API errors keep every value, show no code, and "Try again" resends after no response or a 500', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const replies = ['abort', [400, apiError('BAD_REQUEST', 'endDate: Enter an end date on or after the start date.')], [500, apiError('INTERNAL', 'Internal error')]];
  const api = await tournamentApi(page, { before: request => (request.method === 'POST' ? replies.shift() : undefined) });
  await page.goto(`${APP}/manage/tournaments/new`);
  await fillCreateForm(page);
  const save = button(page, 'Save and continue');
  const alert = main(page).locator('.staff-notice.is-error');
  const values = async () => {
    await expect(field(page, 'Tournament name')).toHaveValue('Spring Cup');
    await expect(field(page, 'End date (optional)')).toHaveValue(LATER);
    await expect(field(page, 'Venue (optional)')).toHaveValue('Main Ground');
  };

  await save.click();
  await expect(alert).toHaveText('Error: Could not reach the server. Your changes are still here.');
  await values();
  await button(page, 'Try again').click();
  // The 400 token endDate names the End date field (form field endsOn).
  await expectFieldError(field(page, 'End date (optional)'), 'Enter an end date on or after the start date.');
  await expect(alert).toHaveText('');
  await expect(button(page, 'Try again')).toHaveCount(0);
  await values();
  await expectNoCode(page, ['endDate']);

  await save.click();
  await expect(alert).toHaveText('Error: Something went wrong. Nothing was saved.');
  await values();
  await expectNoCode(page);
  await button(page, 'Try again').click();
  await expect(page).toHaveURL(`${APP}/manage/tournaments/spring-cup/setup/sports`);
  expect(api.sent('POST', '/manage/tournaments').map(r => r.body)).toEqual([CREATE_BODY, CREATE_BODY, CREATE_BODY, CREATE_BODY]);
});

test('Step 1: a 401 offers "Sign in again", keeps the values and resends nothing until the next submit', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const replies = [REPLIES.unauthenticated];
  const api = await tournamentApi(page, { before: request => (request.method === 'POST' ? replies.shift() : undefined) });
  await page.goto(`${APP}/manage/tournaments/new`);
  await fillCreateForm(page);
  await button(page, 'Save and continue').click();
  await expect(main(page).locator('.staff-notice.is-error')).toHaveText('Error: Your sign-in has expired.');
  await button(page, 'Sign in again').click();
  await expect.poll(() => page.evaluate(() => window.__openSignInCalls)).toBe(1);
  await expect(field(page, 'Tournament name')).toHaveValue('Spring Cup');
  await expect(field(page, 'Venue (optional)')).toHaveValue('Main Ground');
  await expectNoCode(page);
  expect(api.sent('POST', '/manage/tournaments')).toHaveLength(1);
  await button(page, 'Save and continue').click();
  await expect(heading(page)).toHaveText('Step 2 of 5: Sports');
  expect(api.sent('POST', '/manage/tournaments')).toHaveLength(2);
});

test('Step 1: a double submit sends one request and shows "Saving…" until the reply', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const reply = held();
  const api = await tournamentApi(page, { before: request => (request.method === 'POST' ? reply.reply.then(() => undefined) : undefined) });
  await page.goto(`${APP}/manage/tournaments/new`);
  await fillCreateForm(page);
  const save = main(page).locator('button[type="submit"]');
  await save.click();
  await expect(save).toHaveText('Saving…');
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await save.click({ force: true }); // a user can still press an aria-disabled button
  await field(page, 'Venue (optional)').press('Enter');
  await page.waitForTimeout(250); // time for a second request to reach the mock, if one were sent
  expect(api.sent('POST', '/manage/tournaments')).toHaveLength(1);
  reply.release();
  await expect(heading(page)).toHaveText('Step 2 of 5: Sports');
  expect(api.sent('POST', '/manage/tournaments')).toHaveLength(1);
});

test('Step 1: unsaved values ask before a link, Back or reload; staying keeps them; leaving goes', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  await tournamentApi(page);
  await page.goto(`${APP}/manage`);
  await main(page).getByRole('link', { name: 'Create tournament' }).first().click();
  await expect(heading(page)).toHaveText('Step 1 of 5: Tournament details');
  await field(page, 'Tournament name').fill('Spring Cup');
  const matchesLink = page.getByRole('navigation', { name: 'Staff' }).getByRole('link', { name: 'Matches' });

  // In-app link: the dialog opens on Cancel; Escape stays and returns focus to the link.
  await matchesLink.focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole('heading')).toHaveText('Leave without saving?');
  await expect(dialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(matchesLink).toBeFocused();
  await expect(page).toHaveURL(`${APP}/manage/tournaments/new`);
  await expect(field(page, 'Tournament name')).toHaveValue('Spring Cup');

  // Browser Back: Cancel stays.
  await page.goBack();
  await expect(dialog(page).getByRole('heading')).toHaveText('Leave without saving?');
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(`${APP}/manage/tournaments/new`);
  await expect(field(page, 'Tournament name')).toHaveValue('Spring Cup');

  // Reload: the browser's own prompt; dismissing it keeps the page and the value.
  const prompt = page.waitForEvent('dialog');
  const reload = page.evaluate(() => location.reload()).catch(() => {});
  const shown = await prompt;
  expect(shown.type()).toBe('beforeunload');
  await shown.dismiss();
  await reload;
  await expect(field(page, 'Tournament name')).toHaveValue('Spring Cup');

  // Leaving without saving follows the link.
  await matchesLink.focus();
  await page.keyboard.press('Enter');
  await dialog(page).getByRole('button', { name: 'Leave without saving' }).click();
  await expect(page).toHaveURL(`${APP}/manage/matches`);
  await expect(heading(page)).toHaveText('Matches');
});

test('Tournament overview: a Tournament Manager owner gets no Delete tournament control (Super Admin only)', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  await tournamentApi(page, { tournament: tournamentRow(), sports: [{ sport: 'football', matchCount: 1 }] });
  await page.goto(`${APP}/manage/tournaments/spring-cup`);
  await expect(heading(page)).toHaveText('Spring Cup');
  await expect(page.getByRole('heading', { name: 'Tournament settings' })).toBeVisible();
  await expect(button(page, 'Delete tournament')).toHaveCount(0);
});

test('Tournament overview: Delete and Publish open ConfirmDialog on Cancel, Tab stays inside, Escape returns focus, a 409 names the cause', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.admin }); // only a Super Admin deletes a tournament
  const replies = [[409, apiError('NO_SPORTS', 'Cannot change status from DRAFT to ONGOING.')]];
  const api = await tournamentApi(page, {
    tournament: tournamentRow(), sports: [{ sport: 'football', matchCount: 1 }],
    teams: { football: [{ id: '31', name: 'Red Falcons', branch: null, year: null, players: [], locked: false, used: true }, { id: '32', name: 'Blue Hawks', branch: null, year: null, players: [], locked: false, used: true }] },
    before: request => (request.path.endsWith('/status') ? replies.shift() : undefined),
  });
  await page.goto(`${APP}/manage/tournaments/spring-cup`);
  await expect(heading(page)).toHaveText('Spring Cup');
  await expectNoCode(page, ['DRAFT', 'football']);

  const remove = button(page, 'Delete tournament');
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('heading')).toHaveText('Delete Spring Cup?');
  await expect(dialog(page).getByRole('listitem')).toHaveText(['Removes 1 sport, 2 teams and 1 match.', 'Removes every scorer assignment and sport manager of this tournament.', 'This cannot be undone.']);
  await expect(dialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
  // The page behind the modal is inert: Tab and Shift+Tab from Cancel move only through the dialog, or out to the
  // browser's own controls. Chromium then reports document.body; Firefox keeps the last dialog control as
  // activeElement and does not come back in, so each direction starts again from Cancel. No page control gets focus.
  const cancel = dialog(page).getByRole('button', { name: 'Cancel' });
  const inDialog = new Set(['Cancel']);
  for (const key of ['Tab', 'Shift+Tab']) {
    await cancel.focus();
    for (let n = 0; n < 6; n++) {
      await page.keyboard.press(tabKey(page, key));
      const where = await dialog(page).evaluate(box => (box.contains(document.activeElement) ? 'dialog' : document.activeElement === document.body ? 'browser' : document.activeElement.outerHTML));
      expect(['dialog', 'browser']).toContain(where);
      if (where === 'dialog') inDialog.add(await page.evaluate(() => document.activeElement.textContent || document.activeElement.tagName));
    }
  }
  expect([...inDialog]).toEqual(expect.arrayContaining(['TEXTAREA', 'Cancel', 'Delete tournament']));
  await cancel.focus();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(remove).toBeFocused();
  expect(api.sent('DELETE', '/manage/tournaments/spring-cup')).toEqual([]);

  const publish = button(page, 'Publish tournament');
  await publish.focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('heading')).toHaveText('Publish Spring Cup?');
  await expect(dialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
  await tabTo(page, dialog(page).getByRole('button', { name: 'Publish tournament' }));
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toHaveCount(0);
  await expect(main(page).locator('.staff-notice.is-error')).toHaveText('Error: Add a sport before you publish the tournament.');
  await expect(button(page, 'Reload')).toBeVisible();
  await expectNoCode(page, ['NO_SPORTS', 'ONGOING']);
  expect(api.sent('POST', '/manage/tournaments/spring-cup/status').map(r => r.body)).toEqual([{ status: 'ONGOING' }]);

  await remove.focus();
  await page.keyboard.press('Enter');
  await dialog(page).getByLabel('Reason (optional)').fill('Duplicate entry');
  await dialog(page).getByRole('button', { name: 'Delete tournament' }).click();
  await expect(page).toHaveURL(`${APP}/admin`); // the Super Admin's start screen
  await expect(heading(page)).toHaveText('Admin home');
  expect(api.sent('DELETE', '/manage/tournaments/spring-cup').map(r => r.body)).toEqual([{ reason: 'Duplicate entry' }]);
});

test('Tournament details: PATCH sends only the changed fields, announces the save, and keeps values on a 400 or 409', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const replies = [undefined, [400, apiError('BAD_REQUEST', 'endDate: Enter an end date on or after the start date.')],
    [409, apiError('DATES_EXCLUDE_MATCHES', '2 matches fall outside these dates. Move them first.')]];
  const api = await tournamentApi(page, { tournament: tournamentRow({ status: 'ONGOING' }), sports: [{ sport: 'football', matchCount: 2 }],
    before: request => (request.method === 'PATCH' ? replies.shift() : undefined) });
  await page.goto(`${APP}/manage/tournaments/spring-cup/details`);
  await expect(heading(page)).toHaveText('Tournament details');
  await field(page, 'Venue (optional)').fill('North Hall');
  await field(page, 'Venue (optional)').press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Saved Spring Cup.' })).toBeVisible();
  await expect(field(page, 'Venue (optional)')).toHaveValue('North Hall');

  await field(page, 'End date').fill(TODAY);
  await button(page, 'Save changes').click();
  await expectFieldError(field(page, 'End date'), 'Enter an end date on or after the start date.');
  await expect(field(page, 'End date')).toHaveValue(TODAY);
  await expectNoCode(page, ['endDate']);

  await button(page, 'Save changes').click();
  await expect(main(page).locator('.staff-notice.is-error')).toHaveText('Error: 2 matches fall outside these dates. Move them first.');
  await expect(field(page, 'End date')).toHaveValue(TODAY);
  await expectNoCode(page, ['DATES_EXCLUDE_MATCHES']);
  // PATCH /api/manage/tournaments/:slug reads name, startsOn, endsOn, venue, description and imageKey; only changes are sent.
  expect(api.sent('PATCH', '/manage/tournaments/spring-cup').map(r => r.body)).toEqual([{ venue: 'North Hall' }, { endsOn: TODAY }, { endsOn: TODAY }]);
});

test('Teams: rows follow locked and used, Edit maps the jersey both ways, and Delete confirms with focus on Cancel', async ({ page }) => {
  await mockStaff(page, { me: REPLIES.manager });
  const api = await tournamentApi(page, {
    tournament: tournamentRow({ status: 'ONGOING' }), sports: [{ sport: 'football', matchCount: 1 }],
    teams: { football: [
      { id: '31', name: 'Red Falcons', branch: 'CSE', year: 3, players: [{ name: 'Asha', jersey: 9, captain: true }], locked: false, used: false },
      { id: '32', name: 'Blue Hawks', branch: null, year: null, players: [], locked: true, used: true },
    ] },
  });
  await page.goto(`${APP}/manage/tournaments/spring-cup/sports/football/teams`);
  await expect(heading(page)).toHaveText('Football teams');
  await expect(button(page, 'Edit Blue Hawks')).toHaveCount(0);
  await expect(button(page, 'Delete Blue Hawks')).toHaveCount(0);

  await button(page, 'Edit Red Falcons').click();
  await expect(main(page).getByRole('heading', { name: 'Edit Red Falcons' })).toBeVisible();
  await expect(main(page).getByText('Asha, number 9, captain')).toBeVisible();
  // Year is the college year: a select of 1st to 4th year, or Not set.
  const year = field(page, 'Year (optional)');
  await expect(year).toHaveValue('3');
  await expect(year.locator('option')).toHaveText(['Not set', '1st year', '2nd year', '3rd year', '4th year']);
  await year.selectOption({ label: '4th year' });
  await field(page, 'Branch (optional)').fill('ECE');
  await button(page, 'Save changes').click();
  await expect(page.getByRole('status').filter({ hasText: 'Red Falcons saved.' })).toBeVisible();
  expect(api.sent('PATCH', '/manage/teams/31').map(r => r.body)).toEqual([{ name: 'Red Falcons', branch: 'ECE', year: 4, players: [{ name: 'Asha', jersey: 9, captain: true }] }]);
  await expect(main(page).locator('.data-card p:visible, td:visible').filter({ hasText: '4th year' })).toHaveCount(1); // the Year column shows the label
  expect(api.state.teams.football[0].players).toEqual([{ name: 'Asha', jersey: 9, captain: true }]);

  const remove = button(page, 'Delete Red Falcons');
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(dialog(page).getByRole('heading')).toHaveText('Delete Red Falcons?');
  await expect(dialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(remove).toBeFocused();
  expect(api.sent('DELETE', '/manage/teams/31')).toEqual([]);
  await remove.press('Enter');
  await dialog(page).getByLabel('Reason (optional)').fill('Left the event');
  await dialog(page).getByRole('button', { name: 'Delete team' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Red Falcons deleted.' })).toBeVisible();
  await expect(button(page, 'Delete Red Falcons')).toHaveCount(0);
  expect(api.sent('DELETE', '/manage/teams/31').map(r => r.body)).toEqual([{ reason: 'Left the event' }]);
  await expectNoCode(page, ['football']);
});
