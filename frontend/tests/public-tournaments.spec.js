import { test, expect } from '@playwright/test';
import { istDate, timeText, utcToIst } from '../../shared/time.mjs';
import { sports } from '../src/data/sports.js';
import { sportFixtures } from '../src/features/sports/sportFixtures.js';
import { sampleTournaments } from '../src/features/tournaments/sampleTournaments.js';
import { expectNoCode, held } from './helpers.js';

// Public Tournaments, Tournament and Tournament sport pages (Req 17.1, 17.7, 17.11-17.14, 17.16, 22.1, 23.6).
// The live-mode build (port 4176) has VITE_API_BASE=http://api.test; every API and socket call is mocked here.
// The production build (port 4175, baseURL) has no API base and shows the Display_Fixtures.
const APP = 'http://127.0.0.1:4176';
const UNAVAILABLE = 'Scores are unavailable right now.';
const cors = { 'access-control-allow-origin': '*' };
// Error_Body of backend/src/http.js onError.
const apiError = (code, message) => ({ error: { code, message, requestId: 'req-test' } });
const NOT_FOUND = [404, apiError('NOT_FOUND', 'Tournament not found')];
const INTERNAL = [500, apiError('INTERNAL', 'Internal error')];

// Replies copy backend/src/routes/public.js after toPublic in backend/src/http.js.
const cupRow = more => ({ id: '5', slug: 'cup', name: 'Cup', startsOn: '2026-10-20', endsOn: '2026-10-30', status: 'ONGOING', phase: 'live', imageKey: 'court', venue: 'Main ground', description: 'Inter-branch cup.', ...more });
const match = (id, more) => ({ id, tournamentId: '5', sport: 'football', kind: 'CUSTOM', stage: null, status: 'SCHEDULED', phase: 'upcoming', scheduledAt: '2026-10-25T09:00:00.000Z', venue: 'Main ground', seq: 0, sides: [{ name: 'Alpha' }, { name: 'Bravo' }], ...more });
const list = tournaments => [200, { tournaments }];
const detail = (matches = [], more) => [200, { tournament: { ...cupRow(more), sports: ['badminton', 'football'], matches } }];
// Home-room card of backend/src/routes/actions.js; only LIVE and APPROVED cards reach the room (rooms.js LIVE_STATUSES).
const card = (id, more) => ({ id, sport: 'football', status: 'LIVE', competition: 'Cup', tournamentId: '5', sides: [{ name: 'Alpha' }, { name: 'Bravo' }], score: [1, 0], clock: null, periods: [{ points: [1, 0], winner: null, current: true }], winner: null, format: { model: 'periods', periodCount: 2 }, events: [], seq: 1, ...more });
const final = (id, finalizedAt, more) => card(id, { status: 'APPROVED', winner: 0, score: [2, 0], finalizedAt, periods: [{ points: [1, 0], winner: 0, current: false }, { points: [1, 0], winner: 0, current: false }], ...more });
const snapshot = (seq, data) => JSON.stringify({ type: 'snapshot', room: 'home', seq, data });

/**
 * Route every `http://api.test/api/**` GET to `replies[path]` (path after `/api`): a [status, body] pair, 'abort', a
 * promise of either, or `n => ...` for the n-th call of that path. Other paths answer 404 NOT_FOUND. The home socket
 * opens with the empty room message, as rooms.js sends. Returns the request log and the open sockets.
 */
async function mockPublic(page, replies = {}) {
  const calls = [], sockets = [];
  await page.route('http://api.test/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    calls.push(path);
    const entry = replies[path] ?? NOT_FOUND;
    const answer = await (typeof entry === 'function' ? entry(calls.filter(p => p === path).length) : entry);
    if (answer === 'abort') return route.abort();
    const [status, body] = answer;
    return route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.routeWebSocket('ws://api.test/live/home', ws => { sockets.push(ws); ws.send(snapshot(0, [])); });
  return { calls, sockets };
}
const h1 = page => page.getByRole('heading', { level: 1 });
async function expectPage(page, heading, title) {
  await expect(h1(page)).toHaveText(heading);
  await expect(page).toHaveTitle(`${title} | Campuscores`);
}
// Ten minutes of page time: any poll, retry or refresh timer would fire and send a request (Req 22.1).
const settle = page => page.clock.runFor(10 * 60 * 1000);
// Expected India_Time text, built from the Event_Time_Zone helpers: "25 Oct" for the event date of `iso`.
const dayText = iso => new Date(`${istDate(Date.parse(iso))}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const ids = section => section.locator('.sport-card').evaluateAll(cards => cards.map(el => el.dataset.matchId));

test('each tournament route reads once on direct entry and once per refresh, with no later request', async ({ page }) => {
  await page.clock.install();
  const { calls } = await mockPublic(page, { '/tournaments': list([cupRow()]), '/tournaments/cup': detail([match('71')]) });
  const routes = [
    ['/tournaments', 'Tournaments', 'Tournaments', '/tournaments', () => expect(page.locator('#live-tournaments .tournament-card')).toHaveCount(1)],
    ['/tournaments/cup', 'Cup', 'Tournament', '/tournaments/cup', () => expect(page.locator('.tournament-sports a')).toHaveCount(2)],
    ['/tournaments/cup/football', 'Football · Cup', 'Tournament', '/tournaments/cup', () => expect(page.locator('#upcoming [data-match-id="71"]')).toBeVisible()],
  ];
  for (const [path, heading, title, read, ready] of routes) {
    calls.length = 0;
    await page.goto(APP + path);
    await expectPage(page, heading, title); await ready();
    await settle(page);
    expect(calls, `${path} entry`).toEqual([read]);
    expect((await page.reload()).status()).toBe(200);
    await expectPage(page, heading, title); await ready();
    await settle(page);
    expect(calls, `${path} refresh`).toEqual([read, read]);
  }
});

test('Back and Forward between Tournaments, Tournament and Tournament sport show the same page as a card click', async ({ page }) => {
  await page.clock.install();
  const { calls } = await mockPublic(page, { '/tournaments': list([cupRow()]), '/tournaments/cup': detail([match('71')]) });
  const pages = {
    list: async () => {
      await expectPage(page, 'Tournaments', 'Tournaments');
      await expect(page.locator('#live-tournaments .tournament-card')).toHaveAttribute('href', '/tournaments/cup');
    },
    cup: async () => {
      await expectPage(page, 'Cup', 'Tournament');
      await expect(page.locator('.tournament-facts')).toContainText('20 Oct – 30 Oct 2026');
      await expect(page.locator('.tournament-facts')).toContainText('Main ground');
      await expect(page.locator('.tournament-description')).toHaveText('Inter-branch cup.');
      // Tiles follow the site sport order, not the API order.
      await expect(page.locator('.tournament-sports a')).toHaveText(sports.filter(sport => ['badminton', 'football'].includes(sport.id)).map(sport => sport.label));
    },
    football: async () => {
      await expectPage(page, 'Football · Cup', 'Tournament');
      expect(await ids(page.locator('#upcoming'))).toEqual(['71']);
    },
  };
  await page.goto(APP + '/tournaments');
  await pages.list();
  await page.locator('#live-tournaments .tournament-card').click();
  await expect(page).toHaveURL(APP + '/tournaments/cup');
  await pages.cup();
  // Keyboard activation of the sport tile link.
  await page.locator('.tournament-sports a[href="/tournaments/cup/football"]').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(APP + '/tournaments/cup/football');
  await pages.football();
  for (const [move, url, check] of [['goBack', '/tournaments/cup', pages.cup], ['goBack', '/tournaments', pages.list], ['goForward', '/tournaments/cup', pages.cup], ['goForward', '/tournaments/cup/football', pages.football]]) {
    await page[move]();
    await expect(page).toHaveURL(APP + url);
    await check();
  }
  await settle(page);
  // One read per page entry, including each Back and Forward entry; nothing in between.
  expect(calls).toEqual(['/tournaments', '/tournaments/cup', '/tournaments/cup', '/tournaments/cup', '/tournaments', '/tournaments/cup', '/tournaments/cup']);
});

test('loading keeps every heading with a text status, and an empty read shows one sentence per section', async ({ page }) => {
  const listRead = held(), cupReads = [held(), held()];
  await mockPublic(page, { '/tournaments': listRead.reply, '/tournaments/cup': n => cupReads[n - 1].reply });

  await page.goto(APP + '/tournaments');
  await expect(h1(page)).toHaveText('Tournaments');
  for (const id of ['live', 'upcoming', 'past']) {
    const section = page.locator(`#${id}-tournaments`);
    await expect(section.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(section.getByRole('status')).toHaveText('Loading tournaments…');
  }
  listRead.release(list([]));
  for (const id of ['live', 'upcoming', 'past']) await expect(page.locator(`#${id}-tournaments .sport-empty`)).toHaveText(`No ${id} tournaments right now.`);
  await expect(page.locator('.tournament-card')).toHaveCount(0);

  await page.goto(APP + '/tournaments/cup');
  await expect(h1(page)).toHaveText('Tournament');
  const sportsRegion = page.getByRole('region', { name: 'Sports' });
  await expect(sportsRegion.getByRole('heading', { level: 2 })).toBeVisible();
  await expect(sportsRegion.getByRole('status')).toHaveText('Loading tournament…');
  cupReads[0].release([200, { tournament: { ...cupRow({ venue: null, description: null }), sports: [], matches: [] } }]);
  await expect(h1(page)).toHaveText('Cup');
  await expect(sportsRegion.locator('.sport-empty')).toHaveText('No sports are listed for this tournament yet.');
  await expect(page.locator('.tournament-facts')).not.toContainText('Venue');
  await expect(page.locator('.tournament-description')).toHaveCount(0);

  await page.goto(APP + '/tournaments/cup/football');
  await expect(h1(page)).toHaveText('Football');
  for (const id of ['live', 'upcoming', 'past']) {
    await expect(page.locator(`#${id}`).getByRole('heading', { level: 2 })).toBeVisible();
    await expect(page.locator(`#${id} .sport-empty`)).toHaveText('Loading matches…');
    await expect(page.locator(`#${id} .sport-empty`)).toHaveAttribute('role', 'status');
  }
  // Football is listed but only a badminton match exists.
  cupReads[1].release(detail([match('74', { sport: 'badminton' })]));
  await expect(h1(page)).toHaveText('Football · Cup');
  for (const id of ['live', 'upcoming', 'past']) await expect(page.locator(`#${id} .sport-empty`)).toHaveText(`No ${id} matches right now.`);
  await expect(page.locator('.sport-card')).toHaveCount(0);
});

test('a failed read marks only the read sections, keeps the page usable and Try again sends exactly one more read', async ({ page }) => {
  await page.clock.install();
  const { calls } = await mockPublic(page, {
    '/tournaments': n => (n === 1 ? INTERNAL : list([cupRow()])),
    '/tournaments/cup': n => ['abort', detail([match('71')]), INTERNAL, detail([match('71')])][n - 1],
  });
  const expectUsable = async () => {
    await expect(page.locator('.site-name:visible')).toHaveCount(1);
    await expectNoCode(page);
  };

  await page.goto(APP + '/tournaments');
  await expect(h1(page)).toHaveText('Tournaments');
  for (const id of ['live', 'upcoming', 'past']) await expect(page.locator(`#${id}-tournaments .sport-empty`)).toHaveText(UNAVAILABLE);
  await expectUsable();
  await settle(page);
  expect(calls).toEqual(['/tournaments']); // no automatic retry
  await page.locator('#upcoming-tournaments').getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('#live-tournaments .tournament-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  await settle(page);
  expect(calls).toEqual(['/tournaments', '/tournaments']);

  // A network failure on the Tournament page: the facts stay hidden, the Sports section names the failure.
  await page.goto(APP + '/tournaments/cup');
  const sportsRegion = page.getByRole('region', { name: 'Sports' });
  await expect(sportsRegion.getByRole('status')).toHaveText(UNAVAILABLE);
  await expect(h1(page)).toHaveText('Tournament');
  await expect(page.locator('.tournament-facts')).toHaveCount(0);
  await expectUsable();
  await settle(page);
  expect(calls).toHaveLength(3);
  await sportsRegion.getByRole('button', { name: 'Try again' }).click();
  await expect(h1(page)).toHaveText('Cup');
  await expect(page.locator('.tournament-sports a')).toHaveCount(2);
  await settle(page);
  expect(calls).toHaveLength(4);

  // A 500 on the Tournament sport page.
  await page.goto(APP + '/tournaments/cup/football');
  for (const id of ['live', 'upcoming', 'past']) await expect(page.locator(`#${id} .sport-empty`)).toHaveText(UNAVAILABLE);
  await expect(h1(page)).toHaveText('Football');
  await expectUsable();
  await settle(page);
  expect(calls).toHaveLength(5);
  await page.locator('#past').getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('#upcoming [data-match-id="71"]')).toBeVisible();
  await expect(h1(page)).toHaveText('Football · Cup');
  await settle(page);
  expect(calls).toEqual(['/tournaments', '/tournaments', '/tournaments/cup', '/tournaments/cup', '/tournaments/cup', '/tournaments/cup']);
});

test('a missing tournament, a malformed key and a sport the tournament lacks show Tournament not found', async ({ page }) => {
  const { calls } = await mockPublic(page, { '/tournaments/Bad_Key': [400, apiError('BAD_REQUEST', 'Malformed key')], '/tournaments/cup': detail([match('71')]) });
  for (const path of ['/tournaments/missing', '/tournaments/Bad_Key', '/tournaments/missing/football', '/tournaments/cup/volleyball', '/tournaments/cup/cricket']) {
    for (const load of [() => page.goto(APP + path), () => page.reload()]) {
      expect((await load()).status(), path).toBe(200);
      await expectPage(page, 'Tournament not found', 'Tournament');
      await expect(page.getByRole('main').getByRole('link', { name: 'Return home' }), path).toHaveAttribute('href', '/');
      await expectNoCode(page, ['NOT_FOUND', 'Malformed key']);
    }
  }
  // An unknown sport key sends no read; a known sport the tournament lacks is decided from the read.
  expect(calls).toEqual(['/tournaments/missing', '/tournaments/missing', '/tournaments/Bad_Key', '/tournaments/Bad_Key', '/tournaments/missing', '/tournaments/missing', '/tournaments/cup', '/tournaments/cup']);
  await page.getByRole('main').getByRole('link', { name: 'Return home' }).click();
  await expect(page).toHaveURL(APP + '/');
  await expect(page.locator('.hero')).toBeVisible();
});

test('live cards merge into the Tournament sport page in place, before and after the read, with no extra read', async ({ page }) => {
  await page.clock.install();
  const read = held();
  const { calls, sockets } = await mockPublic(page, { '/tournaments/cup': read.reply });
  await page.goto(APP + '/tournaments/cup/football');
  await expect.poll(() => sockets.length).toBe(1);
  const live = page.locator('#live'), upcoming = page.locator('#upcoming'), past = page.locator('#past');
  // Match 71 starts after the cached read: its card arrives while the read is still in progress.
  sockets[0].send(snapshot(1, [card('71', { score: [2, 1], periods: [{ points: [2, 1], winner: null, current: true }] })]));
  await expect(live.locator('.sport-empty')).toHaveText('Loading matches…');
  read.release(detail([match('71'), match('72', { scheduledAt: '2026-10-26T09:00:00.000Z' })]));
  await expect(live.locator('[data-match-id="71"] .match-overview')).toHaveText('Alpha2–1Bravo');
  expect(await ids(live)).toEqual(['71']);
  expect(await ids(upcoming)).toEqual(['72']);

  // The open dialog and the card follow the next message in place.
  await live.locator('[data-match-id="71"] .sport-card-open').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.sport-dialog-status')).toHaveText('Live · Period 1');
  sockets[0].send(snapshot(2, [card('71', { score: [3, 1], periods: [{ points: [3, 1], winner: null, current: true }] })]));
  await expect(dialog.locator('.match-overview')).toHaveText('Alpha3–1Bravo');
  await expect(live.locator('[data-match-id="71"] .match-overview')).toHaveText('Alpha3–1Bravo');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // 71 turns Final and keeps the read's scheduled day. Ignored: another sport of this tournament, another
  // tournament's card, and an old card (no tournamentId) whose match this read does not contain.
  const oldCard = card('96');
  delete oldCard.tournamentId;
  sockets[0].send(snapshot(3, [
    final('71', '2026-10-25T11:00:00.000Z', { score: [3, 1] }),
    card('95', { sport: 'badminton', format: { model: 'sets', bestOf: 3 } }),
    card('97', { tournamentId: '6', competition: 'Open' }),
    oldCard,
  ]));
  await expect(live.locator('.sport-empty')).toHaveText('No live matches right now.');
  expect(await ids(past)).toEqual(['71']);
  await expect(past.locator('[data-match-id="71"] .match-overview')).toContainText('3–1');
  await expect(past.locator('[data-match-id="71"] .match-clock')).toHaveText(`${dayText('2026-10-25T09:00:00.000Z')} · Cup`);
  expect(await ids(upcoming)).toEqual(['72']);
  await expect(page.locator('[data-match-id="95"], [data-match-id="96"], [data-match-id="97"]')).toHaveCount(0);
  await settle(page);
  expect(calls).toEqual(['/tournaments/cup']);
});

test.describe('India_Time on a device in New York', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('match and tournament dates and times show the event date and IST, not the device zone', async ({ page }) => {
    const at = { morning: '2026-10-25T09:00:00.000Z', lateUtc: '2026-10-25T20:00:00.000Z', notScored: '2026-10-19T21:00:00.000Z', final: '2026-10-21T19:00:00.000Z' };
    // Fixed facts of the cases: 09:00 UTC is 14:30 event time, and the late match is on the next event date.
    expect(utcToIst(Date.parse(at.morning)).time).toBe('14:30');
    expect(istDate(Date.parse(at.lateUtc))).not.toBe(at.lateUtc.slice(0, 10));
    const { sockets } = await mockPublic(page, { '/tournaments/cup': detail([match('81', { scheduledAt: at.morning }), match('82', { scheduledAt: at.lateUtc, stage: 'FINAL', sides: [{ name: 'Alpha' }, { name: null }] }), match('83', { phase: 'past', scheduledAt: at.notScored })]) });
    await page.goto(APP + '/tournaments/cup/football');
    // The device clock reads the late match on its UTC date at 16:00.
    expect(await page.evaluate(iso => { const d = new Date(iso); return [d.getDate(), d.getHours()]; }, at.lateUtc)).toEqual([25, 16]);
    const upcoming = page.locator('#upcoming'), past = page.locator('#past');
    await expect(upcoming.locator('[data-match-id="81"] .match-clock')).toHaveText(`${dayText(at.morning)} · ${timeText(Date.parse(at.morning))} · Cup`);
    await expect(upcoming.locator('[data-match-id="82"] .match-clock')).toHaveText(`${dayText(at.lateUtc)} · ${timeText(Date.parse(at.lateUtc))} · Cup`);
    await expect(upcoming.locator('.date-chip')).toHaveText(['All', dayText(at.morning), dayText(at.lateUtc)]);
    await upcoming.locator('.date-chip', { hasText: dayText(at.lateUtc) }).click();
    expect(await ids(upcoming)).toEqual(['82']);
    await upcoming.locator('[data-match-id="82"] .sport-card-open').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.sport-dialog-status')).toHaveText(`Scheduled · ${dayText(at.lateUtc)} · ${timeText(Date.parse(at.lateUtc))}`);
    await expect(dialog.locator('.sport-info div', { hasText: 'Time' }).locator('dd')).toHaveText(timeText(Date.parse(at.lateUtc)));
    await page.keyboard.press('Escape');
    await expect(past.locator('[data-match-id="83"] .match-clock')).toHaveText(`Not scored · ${dayText(at.notScored)} · Cup`);
    // A Final card the read lacks takes its day from finalizedAt in India_Time.
    await expect.poll(() => sockets.length).toBe(1);
    sockets[0].send(snapshot(1, [final('98', at.final)]));
    await expect(past.locator('[data-match-id="98"] .match-clock')).toHaveText(`${dayText(at.final)} · Cup`);
    await expect(past.locator('.date-chip')).toHaveText(['All', dayText(at.notScored), dayText(at.final)]);
    // Tournament dates are event calendar dates: no shift to the device's previous day.
    await page.goto(APP + '/tournaments/cup');
    await expect(page.locator('.tournament-facts')).toContainText('20 Oct – 30 Oct 2026');
  });
});

// The API gives every phase; the page must never decide one from device time (Req 17.16).
for (const [when, time] of [['days after', '2026-11-20T06:30:00.000Z'], ['days before', '2026-09-01T06:30:00.000Z']]) {
  test(`grouping follows the API phase with the device clock ${when} the event`, async ({ page }) => {
    await page.clock.install({ time: new Date(time) });
    const { calls } = await mockPublic(page, {
      '/tournaments': list([
        cupRow({ phase: 'upcoming' }),
        cupRow({ id: '6', slug: 'open', name: 'Open', startsOn: '2026-11-01', endsOn: '2026-11-05', imageKey: 'tennis', phase: 'live' }),
        cupRow({ id: '7', slug: 'old-cup', name: 'Old Cup', status: 'COMPLETED', startsOn: '2026-10-01', endsOn: '2026-10-05', imageKey: 'track', phase: 'past' }),
      ]),
      '/tournaments/cup': detail([
        match('71'),
        match('72', { phase: 'past', scheduledAt: '2026-10-26T09:00:00.000Z' }),
        match('73', { status: 'LIVE', phase: 'live' }),
        match('74', { status: 'APPROVED', phase: 'past', scheduledAt: '2026-10-21T09:00:00.000Z' }),
      ], { phase: 'upcoming' }),
    });
    await page.goto(APP + '/tournaments');
    expect(await page.evaluate(() => new Date().toISOString().slice(0, 10))).toBe(time.slice(0, 10));
    for (const [phase, names] of [['live', ['Open']], ['upcoming', ['Cup']], ['past', ['Old Cup']]]) {
      await expect(page.locator(`#${phase}-tournaments .tournament-card h3`)).toHaveText(names);
    }
    await page.goto(APP + '/tournaments/cup/football');
    await expect(page.locator('#past [data-match-id="72"]')).toContainText('Not scored');
    expect(await ids(page.locator('#live'))).toEqual(['73']);
    expect(await ids(page.locator('#upcoming'))).toEqual(['71']);
    expect(await ids(page.locator('#past'))).toEqual(['72', '74']);
    await expect(page.locator('#past [data-match-id="74"]')).toHaveAttribute('data-status', 'completed');
    await settle(page);
    expect(calls).toEqual(['/tournaments', '/tournaments/cup']);
  });
}

test('without an API base the three pages show Display_Fixtures and send no API or socket request', async ({ page }) => {
  const urls = [];
  page.on('request', request => urls.push(request.url()));
  page.on('websocket', ws => urls.push(ws.url()));
  const counts = (sport, name) => ['liveMatches', 'upcomingMatches', 'pastMatches'].map(key => sportFixtures[sport][key].filter(m => m.tournament === name).length);
  const [main] = sampleTournaments;
  const mainSports = sports.filter(sport => counts(sport.id, main.name).some(Boolean));
  const tournamentPage = async () => {
    await expectPage(page, main.name, 'Tournament');
    await expect(page.locator('.tournament-facts')).toContainText(`${main.startLabel} – ${main.endLabel}`);
    await expect(page.locator('.tournament-sports a')).toHaveText(mainSports.map(sport => sport.label));
  };

  await page.goto('/tournaments');
  await expectPage(page, 'Tournaments', 'Tournaments');
  await expect(page.locator('#live-tournaments .tournament-card h3')).toHaveText(sampleTournaments.map(event => event.name));
  for (const id of ['upcoming', 'past']) await expect(page.locator(`#${id}-tournaments .sport-empty`)).toHaveText(`No ${id} tournaments right now.`);
  await page.locator(`#live-tournaments a[href="/tournaments/${main.id}"]`).click();
  await tournamentPage();
  for (const sport of mainSports) {
    await page.locator(`.tournament-sports a[href="/tournaments/${main.id}/${sport.id}"]`).click();
    for (let load = 0; load < 2; load++) {
      await expectPage(page, `${sport.label} · ${main.name}`, 'Tournament');
      const shown = await Promise.all(['live', 'upcoming', 'past'].map(id => page.locator(`#${id} .sport-card`).count()));
      expect(shown, sport.id).toEqual(counts(sport.id, main.name));
      if (!load) await page.reload();
    }
    await page.goBack();
    await tournamentPage();
  }
  await page.goBack();
  await expectPage(page, 'Tournaments', 'Tournaments');
  await page.goForward();
  await tournamentPage();

  // Fixture empty states: a tournament with no fixture sports, and a sport with no live fixture match.
  const [, hostel, , racquet] = sampleTournaments;
  expect(sports.every(sport => !counts(sport.id, racquet.name).some(Boolean))).toBe(true);
  await page.goto(`/tournaments/${racquet.id}`);
  await expectPage(page, racquet.name, 'Tournament');
  await expect(page.locator('.sport-empty')).toHaveText('No sports are listed for this tournament yet.');
  const [hostelLive, hostelUpcoming] = counts('football', hostel.name);
  expect([hostelLive, hostelUpcoming]).toEqual([0, 1]);
  await page.goto(`/tournaments/${hostel.id}/football`);
  await expectPage(page, `Football · ${hostel.name}`, 'Tournament');
  await expect(page.locator('#live .sport-empty')).toHaveText('No live matches right now.');
  await expect(page.locator('#upcoming .sport-card')).toHaveCount(1);
  for (const path of ['/tournaments/unknown-cup', `/tournaments/${racquet.id}/football`, `/tournaments/${main.id}/cricket`]) {
    await page.goto(path);
    await expectPage(page, 'Tournament not found', 'Tournament');
  }
  await page.waitForLoadState('networkidle');
  const local = 'http://127.0.0.1:4175';
  expect(urls.filter(url => new URL(url).origin !== local || /^\/(api|live)(\/|$)/.test(new URL(url).pathname))).toEqual([]);
});
