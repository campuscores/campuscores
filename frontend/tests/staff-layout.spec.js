// Staff layout of every Manager and Super Admin screen (tasks 14.8, 20.6; Req 19.6, 19.7, 21.2, 21.3, 21.7, 21.9,
// 21.11 to 21.13, 23.5). Live-mode build with a stub Clerk and the stateful manager and admin fakes (manage-fakes.js,
// admin-fakes.js), whose replies copy backend/src/routes/manage.js, admin.js, accounts.js and invites.js. Each test opens one screen with its data, opens every disclosure, types a value into
// the first text field and then resizes through the widths, checking the layout rules at each width. Chromium only
// (playwright.config.js): the checks measure CSS layout, and the phone projects already run the manager specs.
import { test, expect } from '@playwright/test';
import { apiError, mockManage, mockStaff, overflow, REPLIES, smallTargets, STAFF_APP as APP } from './helpers.js';
import { matchesFake, TEAMS, TODAY, TOURNAMENT, tournamentFake, tournamentRow } from './manage-fakes.js';
import { adminApi, fillerStaff, STAFF } from './admin-fakes.js';

// Each side of the design breakpoints (767, 1023, 1199) and the 320px to 3840px range of Req 21.9.
const WIDTHS = [320, 390, 767, 768, 1023, 1024, 1199, 1200, 1440, 2560, 3840];
const T = '/manage/tournaments/spring-cup';

/**
 * Manager screens (AuthArea SCREENS, paths in App.jsx) with data in every list. `lists`: the screen shows a staff list.
 * `primary`: Primary_Action count; a Live match shows only its read-only summary, with no form to act on (design
 * "Match editor": "read-only summary, no form").
 */
const SCREENS = [
  { name: 'Manager home', path: '/manage', h1: 'Manager home', lists: true },
  { name: 'Create tournament (step 1)', path: '/manage/tournaments/new', h1: 'Step 1 of 5: Tournament details' },
  { name: 'Setup step 2', path: `${T}/setup/sports`, h1: 'Step 2 of 5: Sports' },
  { name: 'Setup step 3', path: `${T}/setup/teams`, h1: 'Step 3 of 5: Teams' },
  { name: 'Setup step 4', path: `${T}/setup/matches`, h1: 'Step 4 of 5: Matches', lists: true },
  { name: 'Setup step 5', path: `${T}/setup/scorers`, h1: 'Step 5 of 5: Scorers', lists: true },
  { name: 'Tournament overview', path: T, h1: 'Spring Cup', lists: true },
  { name: 'Tournament details', path: `${T}/details`, h1: 'Tournament details' },
  { name: 'Sport setup', path: `${T}/sports/football`, h1: 'Football setup' },
  { name: 'Teams', path: `${T}/sports/football/teams`, h1: 'Football teams' },
  { name: 'Matches', path: '/manage/matches', h1: 'Matches', lists: true },
  { name: 'Match editor (new)', path: '/manage/matches/new?tournament=spring-cup&sport=badminton', h1: 'Add match' },
  { name: 'Match editor (edit)', path: '/manage/matches/21', h1: 'Edit match' },
  { name: 'Match editor (live)', path: '/manage/matches/22', h1: 'Edit match', primary: 0 },
  // Super Admin screens (task 20.6) on the admin fake (admin-fakes.js). Staff list pages 56 rows, so "Load more" shows.
  { name: 'Admin home', path: '/admin', h1: 'Admin home', lists: true, admin: true },
  { name: 'All tournaments', path: '/admin/tournaments', h1: 'All tournaments', lists: true, admin: true },
  { name: 'Staff list', path: '/admin/staff', h1: 'Staff list', lists: true, admin: { staff: [...STAFF(), ...fillerStaff(51)] } },
  { name: 'Invite staff', path: '/admin/staff/invite', h1: 'Invite staff', admin: true },
  { name: 'Staff member (active)', path: '/admin/staff/3', h1: 'Kabir Rao', admin: true },
  { name: 'Staff member (owner)', path: '/admin/staff/2', h1: 'Mira Coach', admin: true },
  { name: 'Staff member (disabled)', path: '/admin/staff/5', h1: 'Dev Old', admin: true },
  { name: 'Pending invitations', path: '/admin/invitations', h1: 'Pending invitations', lists: true, admin: true },
];

/**
 * One Ongoing tournament for every manager read: the tournament fake answers the tournament, sport and team paths, the
 * match fake answers the match paths and GET /manage/tournaments, and Manager home groups the same match rows the way
 * GET /manage/home does (today's rows by phase, Upcoming rows with no scorer in "Needs a scorer").
 */
async function managerApi(page) {
  const matches = matchesFake();
  const rows = matches.state.matches;
  const tournament = tournamentFake({
    tournament: tournamentRow({ status: TOURNAMENT.status }),
    sports: TOURNAMENT.sports.map(sport => ({ sport, matchCount: rows.filter(row => row.sport === sport).length })),
    teams: Object.fromEntries(Object.entries(TEAMS).map(([sport, list]) => [sport, list.map(team => ({ ...team, branch: null, year: null, players: [], locked: false, used: false }))])),
  });
  const group = items => ({ items, total: items.length });
  const today = rows.filter(row => row.date === TODAY);
  const home = {
    today: TODAY, tournaments: [TOURNAMENT],
    todayMatches: {
      live: group(today.filter(row => row.phase === 'live')), scheduled: group(today.filter(row => row.phase === 'upcoming')),
      final: group(today.filter(row => row.phase === 'past' && row.status !== 'SCHEDULED')),
      notScored: group(today.filter(row => row.phase === 'past' && row.status === 'SCHEDULED')),
    },
    needsScorer: group(rows.filter(row => row.phase === 'upcoming' && !row.assignmentId)),
  };
  await mockManage(page, request => {
    if (request.path === '/manage/home') return [200, home];
    const fake = request.path.startsWith('/manage/matches') || request.path === '/manage/tournaments' ? matches : tournament;
    return fake.reply(request) ?? [404, apiError('NOT_FOUND', 'Not found')];
  });
}

/** Open every closed disclosure in main, so its fields count and are measured (Req 19.7, 19.9). */
async function openDisclosures(page) {
  const closed = page.locator('main button[aria-expanded="false"]:visible');
  for (let n = 0; n < 10 && await closed.count(); n++) await closed.first().click();
  await expect(closed).toHaveCount(0);
}

/**
 * Sections with more than six input fields (Req 19.7). A field belongs to its form, else its section, else main. A
 * radio group is one field (one name); every other control, a checkbox included, is one field each.
 */
const crowdedSections = page => page.evaluate(() => {
  const shown = el => {
    const box = (el.matches('[type="checkbox"], [type="radio"]') && el.closest('label')) || el;
    return box.getClientRects().length > 0 && getComputedStyle(box).visibility !== 'hidden';
  };
  const sections = new Map();
  for (const el of document.querySelectorAll('main :is(input:not([type="hidden"]), select, textarea)')) {
    if (!shown(el)) continue;
    const section = el.closest('form') ?? el.closest('section') ?? el.closest('main');
    if (!sections.has(section)) sections.set(section, new Set());
    sections.get(section).add(el.type === 'radio' ? `radio ${el.name}` : el);
  }
  return [...sections].filter(([, fields]) => fields.size > 6).map(([section, fields]) => {
    const title = section.querySelector('h2, legend')?.textContent.trim() ?? section.tagName.toLowerCase();
    return `"${title}" has ${fields.size} fields`;
  });
});

/**
 * Shown list forms (Req 21.11): `cards` and `tables` counts in main. Manager lists render `.data-cards` and `.data-table`
 * and show one; a Super Admin `.staff-table` is one table that admin.css stacks into cards (no header row) below 768px.
 */
const listForms = page => page.evaluate(() => {
  const shown = selector => [...document.querySelectorAll(`main ${selector}`)].filter(el => getComputedStyle(el).display !== 'none').length;
  const staffTables = [...document.querySelectorAll('main .staff-table')];
  const asTable = staffTables.filter(el => getComputedStyle(el).display === 'table' && getComputedStyle(el.tHead).display !== 'none').length;
  const asCards = staffTables.filter(el => getComputedStyle(el).display === 'block' && getComputedStyle(el.tHead).display === 'none').length;
  return {
    cards: shown('.data-cards') + asCards, tables: shown('.data-table') + asTable,
    lists: document.querySelectorAll('main .data-cards').length + staffTables.length,
  };
});

/** Primary_Actions narrower than their container's content box (Req 21.11: across the content width at <=767px). */
const narrowPrimary = page => page.evaluate(() => [...document.querySelectorAll('main .button-primary')]
  .filter(el => el.getClientRects().length)
  .filter(el => {
    const parent = getComputedStyle(el.parentElement);
    const content = el.parentElement.clientWidth - parseFloat(parent.paddingLeft) - parseFloat(parent.paddingRight);
    return el.getBoundingClientRect().width < content - 1;
  })
  .map(el => `"${el.textContent.trim()}" ${Math.round(el.getBoundingClientRect().width)}px`));

/** Paragraphs and help text wider than 80 characters of their own font (Req 21.12, checked from 1024px). */
const wideText = page => page.evaluate(() => [...document.querySelectorAll('main :is(p, .field-help)')]
  .filter(el => el.getClientRects().length)
  .filter(el => {
    const probe = document.createElement('span');
    probe.style.cssText = 'position: absolute; width: 80ch; visibility: hidden';
    el.append(probe);
    const limit = probe.getBoundingClientRect().width;
    probe.remove();
    return el.getBoundingClientRect().width > limit + 0.5;
  })
  .map(el => `"${el.textContent.trim().slice(0, 40)}" ${Math.round(el.getBoundingClientRect().width)}px`));

/** Elements with a transition or animation, and running animations (Req 21.7). */
const motion = page => page.evaluate(() => {
  const moves = durations => durations.split(',').some(value => parseFloat(value) > 0);
  const moving = [...document.querySelectorAll('body *')].filter(el => {
    const style = getComputedStyle(el);
    return moves(style.transitionDuration) || (style.animationName !== 'none' && moves(style.animationDuration));
  }).map(el => `${el.tagName.toLowerCase()}.${el.className}`);
  return { moving: moving.slice(0, 5), animations: document.getAnimations().length };
});

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', err => page.errors.push(err.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

for (const screen of SCREENS) {
  test(`${screen.name}: layout rules at every width from 320px to 3840px`, async ({ page }) => {
    await mockStaff(page, { me: screen.admin ? REPLIES.admin : REPLIES.manager });
    if (screen.admin) await adminApi(page, screen.admin === true ? {} : screen.admin);
    else await managerApi(page);
    await page.setViewportSize({ width: WIDTHS[0], height: 900 });
    await page.goto(`${APP}${screen.path}`);
    const h1 = page.locator('main h1');
    await expect(h1).toHaveText(screen.h1);
    await expect(page.getByText(/^Loading .+…$/)).toHaveCount(0);
    await expect(h1, 'focus on the h1 after route entry (Req 21.5)').toBeFocused();
    const primary = screen.primary ?? 1;
    await expect(page.locator('main .button-primary:visible')).toHaveCount(primary);

    await openDisclosures(page);
    // A typed value and the focus must survive every resize (Req 21.13).
    const text = page.locator('main form :is(input:not([type]), input[type="text"], input[type="email"], textarea):visible').first();
    const typed = await text.count() ? 'Layout check' : null;
    if (typed) await text.fill(typed);

    for (const width of WIDTHS) {
      await test.step(`${width}px`, async () => {
        await page.setViewportSize({ width, height: 900 });
        const at = `at ${width}px`;
        if (typed) {
          await expect(text, `value kept ${at}`).toHaveValue(typed);
          await expect(text, `focus kept ${at}`).toBeFocused();
        }
        expect(await overflow(page), `page overflow ${at}`).toBeLessThanOrEqual(0);
        expect(await smallTargets(page), `targets under 44×44 ${at}`).toEqual([]);
        await expect(page.locator('main .button-primary:visible'), `Primary_Action count ${at}`).toHaveCount(primary);
        expect(await crowdedSections(page), `sections over six fields ${at}`).toEqual([]);
        const lists = await listForms(page);
        if (screen.lists) expect(lists.lists, 'staff lists on the screen').toBeGreaterThan(0);
        expect(lists, `stacked cards below 768px, tables from 768px ${at}`)
          .toEqual(width < 768 ? { cards: lists.lists, tables: 0, lists: lists.lists } : { cards: 0, tables: lists.lists, lists: lists.lists });
        if (width < 768) expect(await narrowPrimary(page), `Primary_Action across the content width ${at}`).toEqual([]);
        if (width >= 1024) expect(await wideText(page), `text over 80 characters a line ${at}`).toEqual([]);
      });
    }

    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await motion(page), 'no transition or animation with reduced motion').toEqual({ moving: [], animations: 0 });
  });
}
