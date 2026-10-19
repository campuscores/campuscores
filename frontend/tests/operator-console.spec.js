// Operator console with a mocked API and a stub Clerk session (Req 19.1–19.10).
// Runs against the live-mode build (port 4176), which has VITE_API_BASE and a fake Clerk key. The stub Clerk object
// exists only in this test's init script; the app code and its sign-in check are the production ones.
import { test, expect } from '@playwright/test';
const APP = 'http://127.0.0.1:4176';
const API = 'http://api.test/api';
const TOKEN = 'operator-token';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST' };
const live = { id: 7, tournamentId: 1, sport: 'football', kind: 'BRACKET', stage: 'SF1', status: 'LIVE', correctionRoute: null, scheduledAt: '2026-10-12T09:30:00.000Z', venue: 'Court 1', seq: 3, sides: [{ name: 'Alpha' }, { name: 'Bravo' }], validNow: true };
const scheduled = { ...live, id: 8, stage: 'SF2', status: 'SCHEDULED', seq: 0, sides: [{ name: 'Charlie' }, { name: 'Delta' }] };

/** Signed-in stub for window.Clerk: @clerk/react skips the script download when window.Clerk exists. */
function stubClerk(token) {
  const user = { id: 'user_operator', organizationMemberships: [] };
  const session = { id: 'sess_operator', status: 'active', user, actor: null, factorVerificationAge: null, lastActiveToken: { jwt: { claims: { sub: user.id, sid: 'sess_operator' } } }, getToken: async () => token };
  const resources = { client: { sessions: [session], signedInSessions: [session], lastActiveSessionId: session.id }, session, user, organization: null };
  window.Clerk = {
    loaded: true, isSignedIn: true, user, session, client: resources.client, organization: null,
    __internal_lastEmittedResources: resources,
    addListener(listener, options) { if (!options?.skipInitialEmit) listener(resources); return () => {}; },
  };
}

async function reply(route, status, body) {
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  return route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
}
const error = code => ({ error: { code, message: code, requestId: 'req-test' } });

/**
 * Mocked API for match 7 with a small Test_Engine model. `actions(route, body)` answers score posts; the default accepts.
 * `server.actions` keeps every posted body in arrival order; `server.auth` every Authorization header.
 */
async function mockApi(page, actions) {
  const server = { actions: [], auth: [], leases: 0, seq: 3, points: [1, 0], accepted: new Map() };
  server.accept = (route, body) => {
    const side = body.type === 'POINT' ? body.payload.side : server.accepted.get(body.reversesActionId);
    server.points[side] += body.type === 'POINT' ? 1 : -1;
    server.accepted.set(body.actionId, side);
    server.seq += 1;
    return reply(route, 200, { actionId: body.actionId, seq: server.seq, snapshot: { sides: [{ name: 'Alpha', points: server.points[0] }, { name: 'Bravo', points: server.points[1] }] } });
  };
  const authed = handler => route => {
    if (route.request().method() === 'OPTIONS') return reply(route);
    server.auth.push(route.request().headers().authorization);
    return handler(route);
  };
  await page.addInitScript(stubClerk, TOKEN);
  await page.route('https://clerk.operator.test/**', route => route.abort()); // nothing may reach a real Clerk host
  await page.route(`${API}/operator/matches`, authed(route => reply(route, 200, { matches: [live, scheduled] })));
  await page.route(`${API}/matches/7`, route => reply(route, 200, { match: { id: 7, seq: 3, snapshot: { sides: [{ name: 'Alpha', points: 1 }, { name: 'Bravo', points: 0 }] } } }));
  await page.route(`${API}/matches/7/lease`, authed(route => {
    server.leases += 1;
    return reply(route, 200, { lease: { matchId: 7, deviceId: route.request().postDataJSON().deviceId, lastClientSeq: 0 } });
  }));
  await page.route(`${API}/matches/7/actions`, authed(route => {
    const body = route.request().postDataJSON();
    server.actions.push(body);
    return (actions ?? server.accept)(route, body);
  }));
  return server;
}

const status = page => page.locator('.console-status');
const log = page => page.locator('.console-log li');
const scoreRow = (page, name) => page.locator('.console-score tbody tr', { hasText: name }).locator('td');
const point = (page, name) => page.getByRole('button', { name: `Point to ${name}` });
async function openConsole(page, server) {
  await page.goto(`${APP}/operator/matches/7/score`);
  await expect(page.locator('h1')).toHaveText('Alpha vs Bravo');
  await expect.poll(() => server.leases).toBe(1);
  await expect(status(page)).toHaveText('Online');
}

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', err => page.errors.push(err.message));
});
test.afterEach(async ({ page }) => { expect(page.errors).toEqual([]); });

test('My Matches lists the assigned matches from the API with the Clerk token', async ({ page }) => {
  const server = await mockApi(page);
  await page.goto(`${APP}/operator/matches`);
  await expect(page.locator('h1')).toHaveText('My Matches');
  await expect(page.locator('#op-live .operator-card')).toHaveAttribute('data-match-id', '7');
  await expect(page.locator('#op-scheduled .operator-card')).toHaveAttribute('data-match-id', '8');
  await expect(page.locator('#op-live .operator-score-link')).toHaveText('Continue scoring');
  await expect(page.locator('#op-scheduled .operator-score-link')).toHaveText('Start scoring');
  expect(server.auth).toEqual([`Bearer ${TOKEN}`]);
});

test('offline actions are stored, survive a reload in order and sync one at a time with the same actionId', async ({ page, context }) => {
  const held = [];
  const server = await mockApi(page, (route, body) => { held.push({ route, body }); }); // the test answers each post
  await openConsole(page, server);
  await context.setOffline(true);
  await expect(status(page)).toHaveText('Offline · 0 queued');
  await point(page, 'Alpha').click();
  await point(page, 'Bravo').click();
  await point(page, 'Alpha').click();
  await expect(status(page)).toHaveText('Offline · 3 queued');
  await expect(log(page)).toHaveText(['#1 Point to Alpha · queued', '#2 Point to Bravo · queued', '#3 Point to Alpha · queued']);
  await expect(scoreRow(page, 'Alpha')).toHaveText(['1', '3']); // accepted apart from pending (Req 19.9)
  await expect(scoreRow(page, 'Bravo')).toHaveText(['0', '1']);
  expect(server.actions).toEqual([]);

  await context.setOffline(false);
  await expect.poll(() => server.actions.length).toBe(1);
  await expect(status(page)).toHaveText('Syncing · 3 queued');
  await page.reload(); // the first post never got an answer
  await expect(log(page)).toHaveText([/^#1 Point to Alpha · (queued|syncing)$/, '#2 Point to Bravo · queued', '#3 Point to Alpha · queued']);
  await expect(scoreRow(page, 'Alpha')).toHaveText(['1', '3']);
  await expect.poll(() => server.actions.length).toBe(2);
  expect(server.actions[1].actionId).toBe(server.actions[0].actionId);
  for (let n = 2; n <= 4; n++) {
    await page.waitForTimeout(300);
    expect(server.actions, 'one post at a time').toHaveLength(n);
    const { route, body } = held.at(-1);
    await server.accept(route, body);
    if (n < 4) await expect.poll(() => server.actions.length).toBe(n + 1);
  }
  const sent = server.actions.slice(1);
  expect(sent.map(a => a.clientSeq)).toEqual([1, 2, 3]);
  expect(new Set(sent.map(a => a.actionId)).size).toBe(3);
  expect(sent.map(a => [a.type, a.payload.side])).toEqual([['POINT', 0], ['POINT', 1], ['POINT', 0]]);
  expect(server.auth.every(header => header === `Bearer ${TOKEN}`)).toBe(true);
  await expect(status(page)).toHaveText('Synced up to seq 6');
  await expect(log(page)).toHaveText(['#1 Point to Alpha · synced, seq 4', '#2 Point to Bravo · synced, seq 5', '#3 Point to Alpha · synced, seq 6']);
  await expect(page.locator('.console-score thead')).toContainText('Accepted (seq 6)');
  await expect(scoreRow(page, 'Alpha')).toHaveText(['3', '3']);
  await expect(scoreRow(page, 'Bravo')).toHaveText(['1', '1']);
});

test('5xx retries the same action; 403 and 409 pause with the code and keep later actions', async ({ page }) => {
  const script = [503, 'ok', [403, 'NOT_ASSIGNED'], [409, 'SEQUENCE_CONFLICT'], 'ok', 'ok'];
  const server = await mockApi(page, (route, body) => {
    const next = script[server.actions.length - 1];
    if (next === 'ok') return server.accept(route, body);
    return Array.isArray(next) ? reply(route, next[0], error(next[1])) : reply(route, next, error('INTERNAL'));
  });
  await openConsole(page, server);
  await point(page, 'Alpha').click();
  await expect(status(page)).toHaveText('Synced up to seq 4'); // after one 503 and a backoff retry
  expect(server.actions).toHaveLength(2);
  expect(server.actions[1].actionId).toBe(server.actions[0].actionId);

  await point(page, 'Bravo').click();
  await expect(status(page)).toHaveText('Requires attention: NOT_ASSIGNED');
  await expect(page.locator('.console-notice')).toContainText('Sync stopped with NOT_ASSIGNED');
  await point(page, 'Alpha').click(); // recorded while paused: stored, not sent
  await expect(log(page)).toHaveText(['#1 Point to Alpha · synced, seq 4', '#2 Point to Bravo · queued', '#3 Point to Alpha · queued']);
  await expect(scoreRow(page, 'Bravo')).toHaveText(['0', '1']);
  await page.waitForTimeout(1200);
  expect(server.actions).toHaveLength(3);

  await page.getByRole('button', { name: 'Retry sync' }).click();
  await expect(status(page)).toHaveText('Requires attention: SEQUENCE_CONFLICT');
  expect(server.actions).toHaveLength(4);
  expect(server.actions[3].actionId).toBe(server.actions[2].actionId);

  await page.getByRole('button', { name: 'Retry sync' }).click();
  await expect(status(page)).toHaveText('Synced up to seq 6');
  expect(server.actions.slice(4).map(a => a.clientSeq)).toEqual([2, 3]);
  await expect(log(page)).toHaveText(['#1 Point to Alpha · synced, seq 4', '#2 Point to Bravo · synced, seq 5', '#3 Point to Alpha · synced, seq 6']);
});

test('keyboard-only flow from My Matches to scoring, with 44px targets on phone and desktop', async ({ page, browserName }) => {
  // macOS WebKit follows Safari: plain Tab skips links and buttons; Option+Tab reaches every item.
  const tab = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
  const server = await mockApi(page);
  const focused = locator => locator.evaluate(el => el === document.activeElement);
  async function tabTo(locator) {
    for (let press = 0; press < 40; press++) {
      await page.keyboard.press(tab);
      if (await focused(locator)) return;
    }
    throw new Error('Tab never reached the control');
  }
  await page.goto(`${APP}/operator/matches`);
  await tabTo(page.locator('#op-live .operator-score-link'));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/operator\/matches\/7\/score$/);
  await expect.poll(() => server.leases).toBe(1);
  await tabTo(point(page, 'Alpha'));
  await page.keyboard.press('Enter');
  await expect(log(page)).toHaveText([/^#1 Point to Alpha · /]);
  await tabTo(point(page, 'Bravo'));
  await page.keyboard.press(' ');
  await tabTo(page.getByRole('button', { name: 'Undo last' }));
  await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText('Synced up to seq 6');
  await expect(log(page)).toHaveText(['#1 Point to Alpha · synced, seq 4', '#2 Point to Bravo · synced, seq 5', '#3 Undo · synced, seq 6']);
  expect(server.actions[2]).toMatchObject({ type: 'REVERSE', reversesActionId: server.actions[1].actionId });
  await expect(scoreRow(page, 'Alpha')).toHaveText(['2', '2']);
  await expect(scoreRow(page, 'Bravo')).toHaveText(['0', '0']);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const targets = page.locator('main button, main .text-actions > a');
    expect(await targets.count()).toBeGreaterThanOrEqual(4);
    for (const box of await targets.evaluateAll(els => els.map(el => [el.textContent, el.getBoundingClientRect().width, el.getBoundingClientRect().height]))) {
      expect(Math.min(box[1], box[2]), `${width}px ${box[0]}`).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `${width}px overflow`).toBe(false);
  }
});
