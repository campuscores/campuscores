import { test, expect } from '@playwright/test';
import { sports } from '../src/data/sports.js';
import { sportFixtures } from '../src/features/sports/sportFixtures.js';
import { upcomingDates, pastDates } from '../src/features/sports/sportCalendar.js';

const card = (page, id) => page.locator(`[data-match-id="${id}"]`);
const chip = (section, label) => section.locator('.date-chip', { hasText: new RegExp(`^${label}$`) });
const dialog = page => page.locator('dialog.sport-dialog');
const focusedMatch = page => page.evaluate(() => document.activeElement.closest('[data-match-id]')?.dataset.matchId);
const weight = locator => locator.evaluate(el => getComputedStyle(el).fontWeight);
const rgb = hex => `rgb(${hex.match(/\w\w/g).map(pair => parseInt(pair, 16)).join(', ')})`;
const count = n => `${n} ${n === 1 ? 'match' : 'matches'}`;
const names = match => match.sides.flatMap(side => side.players.map(player => player.name));

const built = sports;
// Widest live match per sport: its dialog must still fit a 320px phone.
const widest = {
  badminton: 'live-wd-rao-sen', 'lawn-tennis': 'live-xd-bedi-thakur', 'table-tennis': 'live-md-walia-batra',
  volleyball: 'live-w-mech-biotech', football: 'live-m-cse-ece', basketball: 'live-w-mech-biotech',
};
const teamSize = { volleyball: 6, football: 5, basketball: 5 };

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

// Official baselines (doc/memory.md): the fixtures must be reachable scores, not the event format.
function tennisSet(period) {
  const [w, l] = [period.points[period.winner], period.points[1 - period.winner]];
  if (!period.tiebreak) return (w === 6 && l <= 4) || (w === 7 && l === 5);
  const [tw, tl] = [period.tiebreak[period.winner], period.tiebreak[1 - period.winner]];
  return w === 7 && l === 6 && ((tw === 7 && tl <= 5) || (tw > 7 && tw - tl === 2));
}
const race = (target, cap = Infinity) => (period, index) => {
  const [w, l] = [period.points[period.winner], period.points[1 - period.winner]];
  const t = typeof target === 'function' ? target(index) : target;
  return (w === t && l <= t - 2) || (w > t && w <= cap && w - l === 2) || (w === cap && l === cap - 1);
};
const setRules = {
  badminton: { slots: 3, toWin: 2, won: race(21, 30) },
  'lawn-tennis': { slots: 3, toWin: 2, won: tennisSet },
  'table-tennis': { slots: 5, toWin: 3, won: race(11) },
  volleyball: { slots: 5, toWin: 3, won: race(index => index === 4 ? 15 : 25) },
};
const periodSlots = { football: 2, basketball: 4 };

function checkStructure(sport, scoring, { liveMatches, upcomingMatches, pastMatches }) {
  const all = [...liveMatches, ...upcomingMatches, ...pastMatches];
  expect(new Set(all.map(match => match.id)).size, 'unique ids').toBe(all.length);
  for (const status of ['live', 'ended']) expect(liveMatches.some(match => match.status === status), `a ${status} match`).toBe(true);
  for (const match of all) {
    const list = liveMatches.includes(match) ? 'live' : upcomingMatches.includes(match) ? 'upcoming' : 'past';
    expect({ live: ['live', 'ended'], upcoming: ['scheduled'], past: ['completed'] }[list], match.id).toContain(match.status);
    if (list === 'live') expect([match.date, match.dateLabel], match.id).toEqual(['2026-10-10', '10 Oct']);
    else expect((list === 'upcoming' ? upcomingDates : pastDates).find(day => day.date === match.date)?.label, match.id).toBe(match.dateLabel);
    if (match.status === 'scheduled') expect([match.periods, match.score, match.winner], match.id).toEqual([undefined, undefined, undefined]);
    if (['ended', 'completed'].includes(match.status)) expect([0, 1], match.id).toContain(match.winner);
    expect(match.sides, match.id).toHaveLength(2);
    const players = scoring.team ? teamSize[sport.id] : match.category.includes('Doubles') ? 2 : 1;
    for (const side of match.sides) expect(side.players, `${match.id} ${side.name}`).toHaveLength(players);
  }
}

function checkSetMatch(sport, match) {
  const rule = setRules[sport.id];
  expect(match.periods, match.id).toHaveLength(rule.slots);
  const firstEmpty = match.periods.indexOf(null);
  if (firstEmpty >= 0) expect(match.periods.slice(firstEmpty).every(period => period === null), `${match.id} unplayed slots are last`).toBe(true);
  const done = match.periods.filter(period => period && !period.current);
  done.forEach((period, index) => expect(rule.won(period, index), `${match.id} ${sport.id} slot ${index + 1}`).toBe(true));
  const wins = [0, 1].map(side => done.filter(period => period.winner === side).length);
  expect(match.score, `${match.id} score`).toEqual(wins);
  const current = match.periods.filter(period => period?.current);
  if (match.status === 'live') {
    expect(Math.max(...wins), `${match.id} still open`).toBeLessThan(rule.toWin);
    expect(current, `${match.id} one current slot`).toHaveLength(1);
    expect(match.periods.indexOf(current[0]), `${match.id} current follows completed slots`).toBe(done.length);
    const [period] = current;
    expect(period.winner, match.id).toBeUndefined();
    const leader = period.points[0] >= period.points[1] ? 0 : 1;
    expect(rule.won({ ...period, winner: leader }, done.length), `${match.id} current slot is not already won`).toBe(false);
    if (sport.id === 'lawn-tennis') {
      expect(Math.max(...period.points), match.id).toBeLessThanOrEqual(6);
      const tiebreak = period.points[0] === 6 && period.points[1] === 6;
      if (tiebreak) {
        const [a, b] = match.gamePoints.map(Number);
        expect(match.gamePoints.every(value => /^\d+$/.test(value)) && !(Math.max(a, b) >= 7 && Math.abs(a - b) >= 2), `${match.id} tiebreak points`).toBe(true);
      } else {
        expect(match.gamePoints.every(value => ['0', '15', '30', '40', 'Ad'].includes(value)), `${match.id} game points`).toBe(true);
        if (match.gamePoints.includes('Ad')) expect([...match.gamePoints].sort(), match.id).toEqual(['40', 'Ad']);
      }
    }
  } else {
    expect(current, `${match.id} no current slot`).toHaveLength(0);
    expect([wins[match.winner], wins[1 - match.winner] < rule.toWin], `${match.id} winner reached ${rule.toWin}`).toEqual([rule.toWin, true]);
  }
  if (!(sport.id === 'lawn-tennis' && match.status === 'live')) expect(match.gamePoints, match.id).toBeUndefined();
  expect(match.scorers, match.id).toBeUndefined();
}

function checkPeriodMatch(sport, match) {
  const regular = periodSlots[sport.id];
  const sum = (periods, side) => periods.reduce((total, period) => total + (period?.points[side] ?? 0), 0);
  const regularPeriods = match.periods.slice(0, regular);
  const regularDone = regularPeriods.every(period => period && !period.current);
  const overtime = sport.id === 'basketball' && regularDone && sum(regularPeriods, 0) === sum(regularPeriods, 1);
  expect(match.periods, `${match.id} slots`).toHaveLength(overtime ? regular + 1 : regular);
  if (overtime) expect([match.periods[regular]?.label, match.periods[regular]?.name], match.id).toEqual(['OT', 'Overtime']);
  expect(match.score, `${match.id} score`).toEqual([sum(match.periods, 0), sum(match.periods, 1)]);
  const current = match.periods.filter(period => period?.current);
  for (const period of match.periods.filter(period => period && !period.current)) {
    const [a, b] = period.points;
    expect(period.winner, `${match.id} period winner`).toBe(a === b ? undefined : a > b ? 0 : 1);
  }
  if (match.status === 'live') {
    expect(current, `${match.id} one current period`).toHaveLength(1);
    const last = match.periods.findLastIndex(Boolean);
    expect(match.periods[last], `${match.id} current is the last played`).toBe(current[0]);
    expect(match.periods.slice(0, last).every(Boolean), match.id).toBe(true);
    expect(current[0].winner, match.id).toBeUndefined();
  } else {
    expect(current, `${match.id} no current period`).toHaveLength(0);
    expect(regularPeriods.every(Boolean), `${match.id} all periods played`).toBe(true);
    expect(match.score[match.winner], `${match.id} strict winner`).toBeGreaterThan(match.score[1 - match.winner]);
  }
  for (const side of [0, 1]) {
    const scorers = match.scorers.filter(scorer => scorer.side === side);
    const players = match.sides[side].players.map(player => player.name);
    for (const scorer of scorers) expect(players, `${match.id} scorer`).toContain(scorer.player);
    if (sport.id === 'football') {
      expect(scorers, `${match.id} goals for side ${side}`).toHaveLength(match.score[side]);
      const firstHalf = scorers.filter(scorer => parseInt(scorer.detail, 10) <= 45).length;
      expect([firstHalf, scorers.length - firstHalf], `${match.id} goals per half`).toEqual(match.periods.map(period => period?.points[side] ?? 0));
    } else {
      expect(scorers, `${match.id} top scorers`).toHaveLength(2);
      expect(scorers.reduce((total, scorer) => total + parseInt(scorer.detail, 10), 0), match.id).toBeLessThanOrEqual(match.score[side]);
    }
  }
  expect(match.gamePoints, match.id).toBeUndefined();
}

test.describe('fixtures follow the official scoring baseline', () => {
  test('every sport has exactly one fixture module', () => {
    expect(Object.keys(sportFixtures).sort()).toEqual(sports.map(sport => sport.id).sort());
  });
  for (const sport of built) {
    test(sport.label, () => {
      const fixtures = sportFixtures[sport.id];
      const { scoring } = fixtures;
      expect(['set', 'period'], 'scoring model').toContain(scoring.model);
      checkStructure(sport, scoring, fixtures);
      for (const match of [...fixtures.liveMatches, ...fixtures.pastMatches]) {
        if (scoring.model === 'set') checkSetMatch(sport, match);
        else checkPeriodMatch(sport, match);
      }
    });
  }
});

for (const sport of built) {
  const { scoring, liveMatches, upcomingMatches, pastMatches } = sportFixtures[sport.id];
  const route = `/sports/${sport.id}/`;
  const firstLive = liveMatches.find(match => match.status === 'live');
  const ended = liveMatches.find(match => match.status === 'ended');
  const set = scoring.model === 'set';
  const unit = scoring.unit.toLowerCase();

  test.describe(`${sport.label} page`, () => {
    test('sections, header-only cards, chips, texture and icon', async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(sport.label);
      await expect(page.locator('.sport-section h2')).toHaveText(['Live Matches', 'Upcoming Matches', 'Past Matches']);
      await expect(page.locator('#live .live-dot')).toHaveCount(1);
      for (const [id, list] of [['live', liveMatches], ['upcoming', upcomingMatches], ['past', pastMatches]]) await expect(page.locator(`#${id} .sport-card`)).toHaveCount(list.length);
      await expect(page.locator('.sport-card table, .sport-card .match-details')).toHaveCount(0);
      await expect(page.locator('#upcoming .date-chip')).toHaveText(['All', ...upcomingDates.map(day => day.label)]);
      await expect(page.locator('#past .date-chip')).toHaveText(['All', ...pastDates.map(day => day.label)]);
      await expect(page.locator('.date-chip[aria-pressed="true"]')).toHaveText(['All', 'All']);
      const surface = await page.locator('.sport-card .match-surface').first().evaluate(el => {
        const before = getComputedStyle(el, '::before');
        return { image: before.backgroundImage, bottom: before.bottom };
      });
      expect(surface).toEqual({ image: expect.stringContaining(`${sport.id}-background.webp`), bottom: '0px' });
      await expect(card(page, firstLive.id).locator('.match-clock')).toHaveText(firstLive.clock);
      await expect(card(page, firstLive.id).locator('strong')).toHaveText(firstLive.score.join('–'));
      await expect(page.locator('.sport-title svg')).toHaveCSS('color', rgb(sport.color));
    });

    test('layout fits phones to large screens', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(route);
      for (const width of [320, 375, 390, 430, 767, 768, 1023, 1024, 1440, 2560]) {
        await page.setViewportSize({ width, height: 900 });
        const geometry = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          textOverflows: [...document.querySelectorAll('.sport-page h1, .match-meta, .match-overview > span, .match-clock, .date-chip, .sport-empty')]
            .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent),
          smallTargets: [...document.querySelectorAll('.sport-card-open, .date-chip')].filter(el => {
            const box = el.getBoundingClientRect();
            return el.getClientRects().length && (box.width < 44 || box.height < 44);
          }).length,
          texture: getComputedStyle(document.querySelector('.sport-card .match-surface'), '::before').backgroundImage,
        }));
        expect(geometry, `layout at ${width}px`).toMatchObject({ overflow: false, textOverflows: [], smallTargets: 0 });
        expect(geometry.texture).toMatch(new RegExp(`${sport.id}-background${width < 768 ? '-640' : ''}\\.webp`));
      }
      await page.setViewportSize({ width: 320, height: 900 });
      await card(page, widest[sport.id]).locator('button').click();
      await expect(dialog(page)).toBeVisible();
      expect(await dialog(page).evaluate(el => [el, ...el.querySelectorAll('*:not(.sr-only)')]
        .filter(node => node.scrollWidth > node.clientWidth + 1 && getComputedStyle(node).overflowX !== 'visible' || node.getBoundingClientRect().right > innerWidth + 1)
        .map(node => node.className || node.tagName))).toEqual([]);
      expect(await dialog(page).locator('th, td').evaluateAll(cells => cells.filter(cell => cell.scrollWidth > cell.clientWidth + 1).map(cell => cell.textContent))).toEqual([]);
    });

    test('keyboard opens details and Escape returns focus', async ({ page }) => {
      await page.goto(route);
      for (const [id, key] of [[liveMatches[0].id, 'Enter'], [pastMatches[0].id, 'Space']]) {
        await card(page, id).locator('button').focus();
        await page.keyboard.press(key);
        await expect(dialog(page)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('dialog[open]')).toHaveCount(0);
        expect(await focusedMatch(page)).toBe(id);
      }
    });

    test('live dialog renders the scoring display', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route);
      await card(page, firstLive.id).locator('button').click();
      const details = dialog(page);
      await expect(details).toBeVisible();
      expect(await details.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
      await expect(details.locator('.sport-dialog-status')).toHaveText(`Live · ${firstLive.clock}`);
      expect(await details.locator('.sport-dialog-hero').evaluate(el => getComputedStyle(el).backgroundImage)).toContain(`${sport.id}-background`);
      const headers = details.locator('thead th');
      for (const [index, period] of firstLive.periods.entries()) {
        const current = Boolean(period?.current);
        await expect(headers.nth(index + 1)).toHaveAttribute('aria-label', `${period?.name ?? `${scoring.unit} ${index + 1}`}${current ? ', current' : ''}`);
        for (const side of [0, 1]) {
          const cell = details.locator('tbody tr').nth(side).locator('td').nth(index);
          if (!period) { await expect(cell).toHaveText('—'); continue; }
          if (period.winner === side) await expect(cell.locator('strong')).toHaveText(String(period.points[side]));
          else await expect(cell.locator('strong')).toHaveCount(0);
          if (current) await expect(cell).toHaveClass(/is-current/);
          else await expect(cell).not.toHaveClass(/is-current/);
        }
      }
      const serving = firstLive.sides.filter(side => side.serving).length + firstLive.sides.flatMap(side => side.players).filter(player => player.serving).length;
      await expect(details.locator('.serve-dot')).toHaveCount(serving ? serving + 1 : 0);
      if (!set) expect(serving).toBe(0);
      const legend = details.locator('.sport-legend');
      await expect(legend).toContainText(set ? `Bold = ${unit} winner` : 'Bold = won the period');
      await expect(legend).toContainText(set ? `Red = current ${unit}` : 'Red = current period');
      if (scoring.team) {
        await expect(details.locator('tbody .sport-player')).toHaveCount(0);
        await expect(details.locator('.sport-extra', { has: page.locator('h3', { hasText: /^Lineups$/ }) }).locator('.sport-player')).toHaveText(names(firstLive));
      }
      if (scoring.scorers) {
        const block = details.locator('.sport-extra', { has: page.locator('h3', { hasText: new RegExp(`^${scoring.scorers}$`) }) });
        for (const side of [0, 1]) {
          const items = firstLive.scorers.filter(scorer => scorer.side === side).map(scorer => `${scorer.player} ${scorer.detail}`);
          await expect(block.locator('.sport-scorers').nth(side).locator('li')).toHaveText(items.length ? items : ['—']);
        }
      }
    });

    test('ended live match shows the winner', async ({ page }) => {
      await page.goto(route);
      const winner = ended.sides[ended.winner].name;
      const result = card(page, ended.id);
      await expect(result.locator('.match-clock')).toHaveText(`Ended · ${winner} won`);
      await expect(result.locator('.is-winner')).toHaveText(`${winner} (winner)`);
      expect(await weight(result.locator('.is-winner'))).toBe('800');
      expect(await weight(result.locator('.is-loser'))).toBe('500');
      await result.locator('button').click();
      const [a, b] = [ended.score[ended.winner], ended.score[1 - ended.winner]];
      await expect(dialog(page).locator('.sport-dialog-status')).toHaveText(`Match ended · ${winner} won ${a}–${b} · Provisional result`);
      await expect(dialog(page).locator('.winner-tag')).toHaveCount(1);
      await expect(dialog(page).locator('tbody tr').nth(ended.winner).locator('.winner-tag')).toHaveText('Winner');
      await expect(dialog(page).locator('.is-current, .serve-dot')).toHaveCount(0);
      await expect(dialog(page).locator('thead th', { hasText: /^Pts$/ })).toHaveCount(0);
    });

    test('date chips filter in place', async ({ page }) => {
      await page.goto(route);
      const url = page.url();
      const history = await page.evaluate(() => window.history.length);
      for (const [id, title, dates, list] of [['past', 'Past Matches', pastDates, pastMatches], ['upcoming', 'Upcoming Matches', upcomingDates, upcomingMatches]]) {
        const section = page.locator(`#${id}`);
        for (const day of dates) {
          const expected = list.filter(match => match.date === day.date);
          await chip(section, day.label).click();
          await expect(section.locator('.sport-card')).toHaveCount(expected.length);
          expect(await section.locator('.sport-card').evaluateAll(cards => cards.map(el => el.dataset.date))).toEqual(expected.map(match => match.date));
          await expect(section.getByRole('status')).toHaveText(`${title}, ${day.label}: ${count(expected.length)}.`);
        }
        await chip(section, 'All').click();
        await expect(section.locator('.sport-card')).toHaveCount(list.length);
      }
      expect(page.url()).toBe(url);
      expect(await page.evaluate(() => window.history.length)).toBe(history);
      const emptyDay = upcomingDates.find(day => !upcomingMatches.some(match => match.date === day.date));
      expect(emptyDay, 'an upcoming calendar day without matches').toBeTruthy();
      await chip(page.locator('#upcoming'), emptyDay.label).click();
      await expect(page.locator('#upcoming .sport-empty')).toHaveText(`No upcoming matches on ${emptyDay.label}.`);
      await chip(page.locator('#upcoming'), 'All').click();

      const past = pastMatches[0];
      const winner = past.sides[past.winner].name;
      const result = card(page, past.id);
      await expect(result.locator('.is-winner')).toHaveText(`${winner} (winner)`);
      expect(await weight(result.locator('.is-winner'))).toBe('800');
      await expect(result.locator('.match-clock')).toHaveText(`${past.dateLabel} · ${past.tournament}`);
      await result.locator('button').click();
      await expect(dialog(page).locator('.sport-dialog-status')).toHaveText(`Final · ${winner} won ${past.score[past.winner]}–${past.score[1 - past.winner]}`);
      await expect(dialog(page).locator('.sport-info dt')).toHaveText(['Date', 'Time', 'Tournament', 'Round', 'Venue']);
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog[open]')).toHaveCount(0);

      const scheduled = upcomingMatches[0];
      const upcoming = card(page, scheduled.id);
      await expect(upcoming.locator('strong')).toHaveText('VS');
      await expect(upcoming.locator('.match-clock')).toHaveText(`${scheduled.dateLabel} · ${scheduled.timeLabel} · ${scheduled.tournament}`);
      await upcoming.locator('button').click();
      await expect(dialog(page).locator('.sport-dialog-status')).toHaveText(`Scheduled · ${scheduled.dateLabel} · ${scheduled.timeLabel}`);
      await expect(dialog(page).locator('table')).toHaveCount(0);
      await expect(dialog(page).locator('.sport-player')).toHaveText(names(scheduled));
    });

    test('desktop details are centered and the backdrop closes them', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route);
      await card(page, pastMatches[0].id).locator('button').click();
      const box = await dialog(page).boundingBox();
      expect(box.width).toBeLessThanOrEqual(760);
      expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThanOrEqual(2);
      await page.mouse.click(10, 10);
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      expect(await focusedMatch(page)).toBe(pastMatches[0].id);
    });
  });
}

// Hard-coded official-scoring displays per sport (plan values; the generic tests derive theirs from fixtures).
const rows = page => dialog(page).locator('tbody tr');
const cell = (page, side, column) => rows(page).nth(side).locator('td').nth(column);
const columns = page => dialog(page).locator('thead th:not(:first-child)');
async function open(page, id) {
  await card(page, id).locator('button').click();
  await expect(dialog(page)).toBeVisible();
}
async function close(page) {
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
}

test.describe('lawn tennis scoring', () => {
  test('sets, current game points, serving player and tiebreak marks', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/sports/lawn-tennis/');
    await expect(card(page, 'live-ms-rao-singh').locator('strong')).toHaveText('1–1');
    await expect(card(page, 'live-ms-rao-singh').locator('.match-clock')).toHaveText('Set 3 · 4–3 · 30–15');
    await open(page, 'live-ms-rao-singh');
    await expect(columns(page)).toHaveText(['S1', 'S2', 'S3', 'Pts', 'Sets']);
    await expect(columns(page).nth(2)).toHaveAttribute('aria-label', 'Set 3, current');
    await expect(columns(page).nth(3)).toHaveAttribute('aria-label', 'Current game points');
    await expect(columns(page).nth(4)).toHaveAttribute('aria-label', 'Sets won');
    await expect(cell(page, 0, 0).locator('strong')).toHaveText('6');
    await expect(cell(page, 0, 1)).toHaveText('3');
    await expect(cell(page, 0, 1).locator('strong')).toHaveCount(0);
    await expect(cell(page, 0, 2)).toHaveText('4');
    await expect(cell(page, 0, 2)).toHaveClass(/is-current/);
    await expect(cell(page, 0, 3)).toHaveText('30');
    await expect(cell(page, 0, 3)).toHaveCSS('color', 'rgb(213, 32, 62)');
    await expect(cell(page, 0, 4)).toHaveText('1');
    await expect(cell(page, 1, 1).locator('strong')).toHaveText('6');
    await expect(cell(page, 1, 3)).toHaveText('15');
    await expect(rows(page).nth(0).locator('.sport-player')).toHaveText('Karan Rao, serving');
    for (const text of ['Bold = set winner', 'Red = current set', 'Pts = points in the current game']) await expect(dialog(page).locator('.sport-legend')).toContainText(text);
    await close(page);

    await open(page, 'live-xd-bedi-thakur');
    await expect(dialog(page).locator('.sport-dialog-status')).toHaveText('Live · Set 2 · Tiebreak · 5–3');
    for (const side of [0, 1]) {
      await expect(cell(page, side, 1)).toHaveText('6');
      await expect(cell(page, side, 1)).toHaveClass(/is-current/);
    }
    await expect(cell(page, 0, 3)).toHaveText('5');
    await expect(cell(page, 1, 3)).toHaveText('3');
    await expect(rows(page).nth(1).locator('.sport-player', { has: page.locator('.serve-dot') })).toHaveText('Sahil Grover, serving');
    await close(page);

    await open(page, 'live-ws-mann-bhalla');
    await expect(cell(page, 0, 0)).toHaveText('6, tiebreak 4');
    await expect(cell(page, 0, 0).locator('.tiebreak')).toHaveText('4');
    await expect(cell(page, 1, 0).locator('strong')).toHaveText('7');
    await expect(dialog(page).locator('thead th', { hasText: /^Pts$/ })).toHaveCount(0);
    await expect(dialog(page).locator('.sport-legend')).toContainText('Small number = tiebreak points');
    await close(page);

    await open(page, 'past-ms-rao-kumar');
    await expect(cell(page, 1, 0)).toHaveText('6, tiebreak 6');
    await expect(cell(page, 0, 0).locator('strong')).toHaveText('7');
    await expect(dialog(page).locator('.sport-dialog-status')).toHaveText('Final · Rao won 2–0');
  });
});

test.describe('table tennis scoring', () => {
  test('five games to 11 with deuce games bold for the winner', async ({ page }) => {
    await page.goto('/sports/table-tennis/');
    await expect(card(page, 'live-ms-sharma-gupta').locator('strong')).toHaveText('2–1');
    await expect(card(page, 'live-ms-sharma-gupta').locator('.match-clock')).toHaveText('Game 4 · 7–5');
    await open(page, 'live-ms-sharma-gupta');
    await expect(columns(page)).toHaveText(['G1', 'G2', 'G3', 'G4', 'G5', 'T']);
    await expect(columns(page).nth(5)).toHaveAttribute('aria-label', 'Games won');
    await expect(columns(page).nth(3)).toHaveAttribute('aria-label', 'Game 4, current');
    for (const column of [0, 2]) await expect(cell(page, 0, column).locator('strong')).toHaveText('11');
    await expect(cell(page, 1, 1).locator('strong')).toHaveText('11');
    for (const [side, points] of [[0, '7'], [1, '5']]) {
      await expect(cell(page, side, 3)).toHaveText(points);
      await expect(cell(page, side, 3)).toHaveClass(/is-current/);
      await expect(cell(page, side, 4)).toHaveText('—');
    }
    await expect(cell(page, 0, 5)).toHaveText('2');
    await expect(cell(page, 1, 5)).toHaveText('1');
    await expect(rows(page).nth(0).locator('.sport-player')).toHaveText('Varun Sharma, serving');
    await expect(dialog(page).locator('.sport-legend')).toContainText('Bold = game winner');
    await close(page);

    await open(page, 'live-wd-arya-lamba');
    await expect(cell(page, 0, 0).locator('strong')).toHaveText('12');
    await expect(cell(page, 1, 0)).toHaveText('10');
    await expect(cell(page, 1, 0).locator('strong')).toHaveCount(0);
    await expect(rows(page).nth(1).locator('.sport-player', { has: page.locator('.serve-dot') })).toHaveText('Neha Lamba, serving');
    await close(page);

    await open(page, 'live-md-walia-batra');
    await expect(cell(page, 1, 2).locator('strong')).toHaveText('13');
    await expect(cell(page, 0, 2)).toHaveText('11');
    await expect(cell(page, 0, 2).locator('strong')).toHaveCount(0);
    await expect(dialog(page).locator('.sport-dialog-status')).toHaveText('Match ended · Walia / Sandhu won 3–2 · Provisional result');
  });
});

test.describe('volleyball scoring', () => {
  test('five sets with a fifth set to 15, team serving and lineups', async ({ page }) => {
    await page.goto('/sports/volleyball/');
    await expect(card(page, 'live-m-cse-ece').locator('strong')).toHaveText('1–1');
    await expect(card(page, 'live-m-cse-ece').locator('.match-clock')).toHaveText('Set 3 · 18–16');
    await open(page, 'live-m-cse-ece');
    await expect(columns(page)).toHaveText(['S1', 'S2', 'S3', 'S4', 'S5', 'T']);
    await expect(columns(page).nth(5)).toHaveAttribute('aria-label', 'Sets won');
    await expect(rows(page).nth(0).locator('th .sport-team')).toHaveText('CSE · Year 3, serving');
    await expect(rows(page).nth(0).locator('th .serve-dot')).toHaveCount(1);
    await expect(rows(page).nth(1).locator('th .serve-dot')).toHaveCount(0);
    await expect(dialog(page).locator('tbody .sport-player')).toHaveCount(0);
    const lineups = dialog(page).locator('.sport-extra', { has: page.locator('h3', { hasText: /^Lineups$/ }) }).locator('.sport-participants > p');
    for (const side of [0, 1]) await expect(lineups.nth(side).locator('.sport-player')).toHaveCount(6);
    await expect(cell(page, 0, 0).locator('strong')).toHaveText('25');
    await expect(cell(page, 1, 1).locator('strong')).toHaveText('25');
    for (const [side, points] of [[0, '18'], [1, '16']]) {
      await expect(cell(page, side, 2)).toHaveText(points);
      await expect(cell(page, side, 2)).toHaveClass(/is-current/);
    }
    await close(page);

    await open(page, 'live-w-mech-biotech');
    await expect(dialog(page).locator('.sport-dialog-status')).toHaveText('Live · Set 5 · 12–10');
    await expect(columns(page).nth(4)).toHaveAttribute('aria-label', 'Set 5, current');
    for (const [side, points] of [[0, '12'], [1, '10']]) {
      await expect(cell(page, side, 4)).toHaveText(points);
      await expect(cell(page, side, 4)).toHaveClass(/is-current/);
    }
    await expect(rows(page).nth(1).locator('th .serve-dot')).toHaveCount(1);
    await expect(rows(page).nth(0).locator('th .serve-dot')).toHaveCount(0);
    await close(page);

    await open(page, 'live-m-civil-chem');
    await expect(cell(page, 0, 4).locator('strong')).toHaveText('15');
    await expect(cell(page, 1, 4)).toHaveText('13');
    await expect(cell(page, 1, 4).locator('strong')).toHaveCount(0);
    await expect(dialog(page).locator('.sport-dialog-status')).toHaveText('Match ended · Civil Y4 won 3–2 · Provisional result');
  });
});

const extra = (page, heading) => dialog(page).locator('.sport-extra', { has: page.locator('h3', { hasText: new RegExp(`^${heading}$`) }) });

test.describe('football scoring', () => {
  test('two halves, goals per half, scorers and lineups without serving', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/sports/football/');
    await expect(card(page, 'live-m-cse-ece').locator('strong')).toHaveText('2–1');
    await expect(card(page, 'live-m-cse-ece').locator('.match-clock')).toHaveText('62′ · Second half');
    await open(page, 'live-m-cse-ece');
    await expect(columns(page)).toHaveText(['H1', 'H2', 'Goals']);
    await expect(columns(page).nth(1)).toHaveAttribute('aria-label', 'Half 2, current');
    await expect(columns(page).nth(2)).toHaveAttribute('aria-label', 'Total goals');
    await expect(cell(page, 0, 0).locator('strong')).toHaveText('1');
    await expect(cell(page, 1, 0)).toHaveText('0');
    await expect(cell(page, 1, 0).locator('strong')).toHaveCount(0);
    for (const side of [0, 1]) {
      await expect(cell(page, side, 1)).toHaveText('1');
      await expect(cell(page, side, 1)).toHaveClass(/is-current/);
      await expect(cell(page, side, 1).locator('strong')).toHaveCount(0);
    }
    await expect(cell(page, 0, 1)).toHaveCSS('color', 'rgb(213, 32, 62)');
    await expect(cell(page, 0, 2)).toHaveText('2');
    await expect(cell(page, 1, 2)).toHaveText('1');
    const goals = extra(page, 'Goals').locator('.sport-scorers');
    await expect(goals.nth(0).locator('li')).toHaveText(['Aman Gill 23′', 'Rohit Saini 51′']);
    await expect(goals.nth(1).locator('li')).toHaveText(['Kabir Sethi 58′']);
    await expect(dialog(page).locator('.serve-dot')).toHaveCount(0);
    const legend = dialog(page).locator('.sport-legend');
    for (const text of ['Bold = won the period', 'Red = current period']) await expect(legend).toContainText(text);
    await expect(legend).not.toContainText('Serving');
    const lineups = extra(page, 'Lineups').locator('.sport-participants > p');
    for (const side of [0, 1]) await expect(lineups.nth(side).locator('.sport-player')).toHaveCount(5);
    await close(page);

    await open(page, 'live-w-mech-biotech');
    for (const [side, goalsInHalf] of [[0, '0'], [1, '1']]) {
      await expect(cell(page, side, 0)).toHaveText(goalsInHalf);
      await expect(cell(page, side, 0)).toHaveClass(/is-current/);
      await expect(cell(page, side, 1)).toHaveText('—');
    }
    await expect(extra(page, 'Goals').locator('.sport-scorers').nth(0).locator('li')).toHaveText(['—']);
    await close(page);

    await open(page, 'live-m-civil-chem');
    await expect(cell(page, 1, 0).locator('strong')).toHaveText('1');
    await expect(cell(page, 0, 1).locator('strong')).toHaveText('2');
    await expect(extra(page, 'Goals').locator('.sport-scorers').nth(0)).toContainText('Vikas Rana 78′ (pen)');
    await close(page);

    await chip(page.locator('#past'), '3 Oct').click();
    await open(page, 'past-m-cse-mech');
    await expect(cell(page, 0, 0).locator('strong')).toHaveText('2');
    for (const side of [0, 1]) await expect(cell(page, side, 1).locator('strong')).toHaveCount(0);
    await expect(dialog(page).locator('.sport-dialog-status')).toHaveText('Final · CSE Y3 won 3–1');
  });
});

test.describe('basketball scoring', () => {
  test('four quarters, overtime only when tied, top scorers and no serving', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/sports/basketball/');
    await expect(card(page, 'live-m-cse-ece').locator('strong')).toHaveText('45–44');
    await expect(card(page, 'live-m-cse-ece').locator('.match-clock')).toHaveText('Q3 · 04:12');
    await open(page, 'live-m-cse-ece');
    await expect(columns(page)).toHaveText(['Q1', 'Q2', 'Q3', 'Q4', 'T']);
    await expect(columns(page).nth(4)).toHaveAttribute('aria-label', 'Total points');
    await expect(cell(page, 0, 0).locator('strong')).toHaveText('18');
    await expect(cell(page, 1, 1).locator('strong')).toHaveText('20');
    for (const [side, points] of [[0, '13'], [1, '9']]) {
      await expect(cell(page, side, 2)).toHaveText(points);
      await expect(cell(page, side, 2)).toHaveClass(/is-current/);
      await expect(cell(page, side, 3)).toHaveText('—');
    }
    await expect(cell(page, 0, 4)).toHaveText('45');
    await expect(cell(page, 1, 4)).toHaveText('44');
    await expect(extra(page, 'Top scorers').locator('.sport-scorers').nth(0).locator('li')).toHaveText(['Arjun Bhatia 14 pts', 'Kunal Arora 11 pts']);
    await expect(dialog(page).locator('.serve-dot')).toHaveCount(0);
    await close(page);

    await open(page, 'live-w-mech-biotech');
    await expect(dialog(page).locator('.sport-dialog-status')).toHaveText('Live · OT · 02:30');
    await expect(columns(page)).toHaveText(['Q1', 'Q2', 'Q3', 'Q4', 'OT', 'T']);
    await expect(columns(page).nth(4)).toHaveAttribute('aria-label', 'Overtime, current');
    for (const [side, points] of [[0, '4'], [1, '2']]) {
      await expect(cell(page, side, 4)).toHaveText(points);
      await expect(cell(page, side, 4)).toHaveClass(/is-current/);
    }
    await expect(cell(page, 0, 3).locator('strong')).toHaveText('16');
    await close(page);

    await open(page, 'live-m-civil-chem');
    for (const side of [0, 1]) {
      await expect(cell(page, side, 1)).toHaveText('16');
      await expect(cell(page, side, 1).locator('strong')).toHaveCount(0);
    }
    await expect(columns(page)).toHaveText(['Q1', 'Q2', 'Q3', 'Q4', 'T']);
    await expect(dialog(page).locator('.sport-dialog-status')).toHaveText('Match ended · Civil Y4 won 72–70 · Provisional result');
    await close(page);

    await chip(page.locator('#past'), '2 Oct').click();
    await open(page, 'past-m-ece-elec');
    await expect(columns(page).nth(4)).toHaveText('OT');
    await expect(columns(page).nth(4)).toHaveAttribute('aria-label', 'Overtime');
    await expect(cell(page, 0, 4).locator('strong')).toHaveText('9');
    await expect(dialog(page).locator('.sport-dialog-status')).toHaveText('Final · ECE Y2 won 73–70');
  });
});

test('every built sport opens from the header, survives refresh and back, and resets chips between sports', async ({ page }) => {
  for (const sport of built) {
    await page.goto('/');
    await page.locator('.desktop-nav .sports-dropdown summary').click();
    await page.locator(`.desktop-nav a[href="/sports/${sport.id}/"]`).click();
    await expect(page).toHaveURL(new RegExp(`/sports/${sport.id}/$`));
    await expect(page.getByRole('heading', { level: 1, name: sport.label })).toBeVisible();
    expect(await page.locator('.sport-card .match-surface').first().evaluate(el => getComputedStyle(el, '::before').backgroundImage)).toContain(`${sport.id}-background`);
    expect((await page.reload()).status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: sport.label })).toBeVisible();
    await page.goBack();
    await expect(page.locator('.hero')).toBeVisible();
  }
  // SportPage is keyed by sport, so a chip chosen on one sport does not carry over to the next.
  await page.goto('/sports/badminton/');
  await chip(page.locator('#past'), '2 Oct').click();
  await expect(page.locator('#past .date-chip[aria-pressed="true"]')).toHaveText('2 Oct');
  await page.locator('.desktop-nav .sports-dropdown summary').click();
  await page.locator('.desktop-nav a[href="/sports/lawn-tennis/"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tennis' })).toBeVisible();
  await expect(page.locator('#past .date-chip[aria-pressed="true"]')).toHaveText('All');
  await expect(page.locator('#past .sport-card')).toHaveCount(sportFixtures['lawn-tennis'].pastMatches.length);
  await page.goto('/sports/football/');
  await chip(page.locator('#past'), '2 Oct').click();
  await expect(page.locator('#past .sport-card')).toHaveCount(1);
  await page.locator('.desktop-nav .sports-dropdown summary').click();
  await page.locator('.desktop-nav a[href="/sports/basketball/"]').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Basketball' })).toBeVisible();
  await expect(page.locator('#past .date-chip[aria-pressed="true"]')).toHaveText('All');
  await expect(page.locator('#past .sport-card')).toHaveCount(sportFixtures.basketball.pastMatches.length);
});

// Badminton regression: the original badminton page assertions, with shared class names.
test.describe('badminton', () => {
  test('three sections render with header-only default cards', async ({ page }) => {
    await page.goto('/sports/badminton/');
    await expect(page.locator('.desktop-banner')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Badminton');
    await expect(page.locator('.sport-section h2')).toHaveText(['Live Matches', 'Upcoming Matches', 'Past Matches']);
    await expect(page.locator('#live .live-dot')).toHaveCount(1);
    await expect(page.locator('#upcoming .live-dot, #past .live-dot')).toHaveCount(0);
    for (const [id, count] of [['live', 4], ['upcoming', 5], ['past', 6]]) await expect(page.locator(`#${id} .sport-card`)).toHaveCount(count);
    await expect(page.locator('.sport-card table, .sport-card .match-details')).toHaveCount(0);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.locator('#upcoming .date-chip')).toHaveText(['All', '10 Oct', '11 Oct', '12 Oct', '15 Oct']);
    await expect(page.locator('#past .date-chip')).toHaveText(['All', '1 Oct', '2 Oct', '3 Oct']);
    await expect(page.locator('.date-chip[aria-pressed="true"]')).toHaveText(['All', 'All']);
    // Texture covers the whole default card: no white detail area below it.
    const surface = await page.locator('.sport-card .match-surface').first().evaluate(el => {
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
        textOverflows: [...document.querySelectorAll('.sport-page h1, .match-meta, .match-overview > span, .match-clock, .date-chip, .sport-empty')]
          .filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent),
        smallTargets: [...document.querySelectorAll('.sport-card-open, .date-chip')].filter(el => {
          const box = el.getBoundingClientRect();
          return el.getClientRects().length && (box.width < 44 || box.height < 44);
        }).length,
        texture: getComputedStyle(document.querySelector('.sport-card .match-surface'), '::before').backgroundImage,
      }));
      expect(geometry, `layout at ${width}px`).toMatchObject({ overflow: false, textOverflows: [], smallTargets: 0 });
      expect(geometry.texture).toMatch(width < 768 ? /badminton-background-640\.webp/ : /badminton-background\.webp/);
    }
    await expect(page.locator('.sport-card .match-surface').last()).toHaveCSS('transform', 'none');
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
    await expect(details.locator('.sport-dialog-status')).toHaveText('Live · Game 2 · 19–17');
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
    await expect(iyer.locator('.sport-player', { has: page.locator('.serve-dot') })).toHaveText('Arjun Iyer, serving');
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
    await expect(dialog(page).locator('.sport-dialog-status')).toHaveText('Match ended · Mehta won 2–1 · Provisional result');
    await expect(dialog(page).locator('.winner-tag')).toHaveCount(1);
    await expect(dialog(page).locator('tbody tr').nth(0).locator('.winner-tag')).toHaveText('Winner');
    await expect(dialog(page).locator('.is-current, .serve-dot')).toHaveCount(0);
  });

  test('doubles details list both players and the serving player', async ({ page }) => {
    await page.goto('/sports/badminton/');
    await card(page, 'live-wd-rao-sen').locator('button').click();
    const rows = dialog(page).locator('tbody tr');
    await expect(rows.nth(0).locator('.sport-player')).toHaveText(['Meera Rao', 'Kavya Sen, serving']);
    await expect(rows.nth(1).locator('.sport-player')).toHaveText(['Riya Das', 'Anika Paul']);
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
    await expect(past.locator('.sport-card')).toHaveCount(2);
    for (const date of await past.locator('.sport-card').evaluateAll(cards => cards.map(el => el.dataset.date))) expect(date).toBe('2026-10-02');
    await expect(past.getByRole('status')).toHaveText('Past Matches, 2 Oct: 2 matches.');
    await rail.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await chip(past, '1 Oct').click();
    await expect.poll(() => rail.evaluate(el => el.scrollLeft)).toBe(0);
    await expect(page.locator('#upcoming .sport-card')).toHaveCount(5);
    await expect(page.locator('#upcoming .date-chip[aria-pressed="true"]')).toHaveText('All');
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => window.history.length)).toBe(history);
    await chip(past, 'All').focus();
    await page.keyboard.press('Enter');
    await expect(past.locator('.sport-card')).toHaveCount(6);
    await chip(past, '3 Oct').focus();
    await page.keyboard.press('Space');
    await expect(past.locator('.sport-card')).toHaveCount(2);
    // Kaur / Jain lost 1–2 to Rao / Sen: the right-hand side is the bold winner.
    const result = card(page, 'past-wd-kaur-jain');
    await expect(result.locator('.is-winner')).toHaveText('Rao / Sen (winner)');
    expect(await weight(result.locator('.is-winner'))).toBe('800');
    await expect(result.locator('.match-clock')).toHaveText('3 Oct · Thaparlympics 2026');
    await result.locator('button').click();
    await expect(dialog(page).locator('.sport-dialog-status')).toHaveText('Final · Rao / Sen won 2–1');
    await expect(dialog(page).locator('tbody tr').nth(1).locator('.winner-tag')).toHaveText('Winner');
    await expect(dialog(page).locator('table')).toHaveCount(1);
    await expect(dialog(page).locator('.sport-info dt')).toHaveText(['Date', 'Time', 'Tournament', 'Round', 'Venue']);
    await expect(dialog(page).locator('.sport-info')).toContainText('Sports Complex · Court 1');
  });

  test('upcoming date chips filter, show an empty day and open schedule details', async ({ page }) => {
    await page.goto('/sports/badminton/');
    const upcoming = page.locator('#upcoming');
    await chip(upcoming, '15 Oct').click();
    await expect(upcoming.locator('.sport-card')).toHaveCount(1);
    await expect(upcoming.locator('.sport-card')).toContainText('Inter-Hostel Cup');
    await expect(page.locator('#past .sport-card')).toHaveCount(6);
    await chip(upcoming, '12 Oct').click();
    await expect(upcoming.locator('.sport-card')).toHaveCount(0);
    await expect(upcoming.locator('.sport-empty')).toHaveText('No upcoming matches on 12 Oct.');
    await expect(upcoming.getByRole('status')).toHaveText('Upcoming Matches, 12 Oct: 0 matches.');
    await chip(upcoming, '10 Oct').click();
    await expect(upcoming.locator('.sport-empty')).toHaveCount(0);
    const scheduled = card(page, 'up-md-arora-singh');
    await expect(scheduled.locator('strong')).toHaveText('VS');
    await expect(scheduled.locator('.match-clock')).toHaveText('10 Oct · 6:15 PM · Thaparlympics 2026');
    await expect(scheduled).not.toContainText(/\d+–\d+/);
    await scheduled.locator('button').click();
    await expect(dialog(page).locator('.sport-dialog-status')).toHaveText('Scheduled · 10 Oct · 6:15 PM');
    await expect(dialog(page).locator('table')).toHaveCount(0);
    await expect(dialog(page).locator('.sport-player')).toHaveText(['Kabir Arora', 'Jaspreet Singh', 'Faizan Malik', 'Arnav Roy']);
    await expect(dialog(page).locator('.sport-info dd')).toHaveText(['10 Oct', '6:15 PM', 'Thaparlympics 2026', 'Semifinal 2', 'Sports Complex · Court 2']);
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

  test('route entry, refresh and back work', async ({ page }) => {
    await page.goto('/');
    await page.locator('.desktop-nav .sports-dropdown summary').click();
    await page.locator('.desktop-nav a[href="/sports/badminton/"]').click();
    await expect(page).toHaveURL(/\/sports\/badminton\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Badminton' })).toBeVisible();
    expect((await page.reload()).status()).toBe(200);
    await expect(page.locator('#past .sport-card')).toHaveCount(6);
    await page.goBack();
    await expect(page.locator('.hero')).toBeVisible();
  });
});
