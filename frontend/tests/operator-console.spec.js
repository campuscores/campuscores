import { stubClerk, tabKey } from './helpers.js';
// Operator console with a mocked API and a stub Clerk session (Req 19.1–19.10).
// Runs against the live-mode build (port 4176), which has VITE_API_BASE and a fake Clerk key. The stub Clerk object
// exists only in this test's init script; the app code and its sign-in check are the production ones.
import { test, expect } from '@playwright/test';
import { DEFAULT_FORMATS } from '../../shared/scoring.mjs';
const APP = 'http://127.0.0.1:4176';
const API = 'http://api.test/api';
const TOKEN = 'operator-token';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, DELETE' };
// Rows in the GET /api/operator/matches shape (backend/src/routes/assignments.js), including the START fields.
const live = { id: 7, tournamentId: 1, sport: 'football', kind: 'BRACKET', stage: 'SF1', status: 'LIVE', correctionRoute: null, scheduledAt: '2026-10-12T09:30:00.000Z', venue: 'Court 1', seq: 3, sides: [{ name: 'Alpha' }, { name: 'Bravo' }],
  isToday: false, validNow: true, canStart: false, startReason: null, notScored: false, defaultFormat: DEFAULT_FORMATS.football };
const scheduled = { ...live, id: 8, stage: 'SF2', status: 'SCHEDULED', seq: 0, sides: [{ name: 'Charlie' }, { name: 'Delta' }], isToday: true, canStart: true };

/** Signed-in stub for window.Clerk: @clerk/react skips the script download when window.Clerk exists. */

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
  // `lease` follows backend leases.js: KEEP for the holding device, LEASE_HELD for another one unless it takes over,
  // GRANT or TAKEOVER from lastClientSeq 0; a DELETE with the holder's deviceId removes it.
  const server = { actions: [], auth: [], leases: 0, releases: [], lease: null, seq: 3, points: [1, 0], accepted: new Map() };
  server.accept = (route, body) => {
    const side = body.type === 'POINT' ? body.payload.side : server.accepted.get(body.reversesActionId);
    server.points[side] += body.type === 'POINT' ? 1 : -1;
    server.accepted.set(body.actionId, side);
    if (server.lease) server.lease.lastClientSeq = body.clientSeq;
    server.seq += 1;
    return reply(route, 200, { actionId: body.actionId, seq: server.seq, snapshot: { sides: [{ name: 'Alpha', points: server.points[0] }, { name: 'Bravo', points: server.points[1] }] } });
  };
  const authed = handler => route => {
    if (route.request().method() === 'OPTIONS') return reply(route);
    server.auth.push(route.request().headers().authorization);
    return handler(route);
  };
  await page.addInitScript(stubClerk, TOKEN);
  await page.route(API + '/operator/metrics', route => route.fulfill({ status: 204, headers: cors }));
  await page.route('https://clerk.operator.test/**', route => route.abort()); // nothing may reach a real Clerk host
  await page.route(`${API}/me`, route => reply(route, 200, { role: 'MATCH_OPERATOR', status: 'ACTIVE' })); // the staff role gate
  await page.route(`${API}/operator/matches`, authed(route => reply(route, 200, { matches: [live, scheduled] })));
  await page.route(`${API}/matches/7`, route => reply(route, 200, { match: { id: 7, seq: 3, snapshot: { sides: [{ name: 'Alpha', points: 1 }, { name: 'Bravo', points: 0 }] } } }));
  await page.route(`${API}/matches/7/lease`, authed(route => {
    const { deviceId, takeover } = route.request().postDataJSON() ?? {};
    if (route.request().method() === 'DELETE') {
      server.releases.push({ auth: route.request().headers().authorization, deviceId });
      if (server.lease?.deviceId === deviceId) server.lease = null;
      return route.fulfill({ status: 204, headers: cors });
    }
    server.leases += 1;
    if (server.lease && server.lease.deviceId !== deviceId && !takeover) return reply(route, 409, error('LEASE_HELD'));
    if (server.lease?.deviceId !== deviceId) server.lease = { deviceId, lastClientSeq: 0 };
    return reply(route, 200, { lease: { matchId: 7, deviceId, lastClientSeq: server.lease.lastClientSeq } });
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

test('a Regular_Match (CUSTOM, no stage) reads "Match" on its My Matches cards and in the console, never "custom"', async ({ page }) => {
  const server = await mockApi(page);
  const regular = { kind: 'CUSTOM', stage: null };
  await page.route(`${API}/operator/matches`, route => reply(route, 200, { matches: [{ ...live, ...regular }, { ...scheduled, ...regular }] })); // newest route wins
  await page.goto(`${APP}/operator/matches`);
  for (const section of ['#op-live', '#op-scheduled']) await expect(page.locator(`${section} .match-meta > span`).nth(1), section).toHaveText('Match');
  await expect(page.getByRole('main')).not.toContainText(/custom/i);
  await openConsole(page, server);
  await expect(page.locator('.console-meta')).toHaveText('Football · Match · Court 1');
  await expect(page.getByRole('main')).not.toContainText(/custom/i);
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

test('429 (rate limit) retries the same action with backoff and does not pause', async ({ page }) => {
  const script = [429, 'ok'];
  const server = await mockApi(page, (route, body) => {
    const next = script[server.actions.length - 1];
    return next === 'ok' ? server.accept(route, body) : reply(route, next, error('RATE_LIMITED'));
  });
  await openConsole(page, server);
  await point(page, 'Alpha').click();
  await expect(status(page)).toHaveText('Synced up to seq 4');
  expect(server.actions).toHaveLength(2);
  expect(server.actions[1].actionId).toBe(server.actions[0].actionId);
  await expect(page.locator('.console-notice')).toHaveCount(0);
  await expect(log(page)).toHaveText(['#1 Point to Alpha · synced, seq 4']);
});

test('keyboard-only flow from My Matches to scoring, with 44px targets on phone and desktop', async ({ page }) => {
  const tab = tabKey(page);
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
    // The Back link now comes from StaffShell above the h1 (Req 4.10), not the console's bottom link row.
    const targets = page.locator('main button, main .text-actions > a, main .staff-back');
    expect(await targets.count()).toBeGreaterThanOrEqual(4);
    for (const box of await targets.evaluateAll(els => els.map(el => [el.textContent, el.getBoundingClientRect().width, el.getBoundingClientRect().height]))) {
      expect(Math.min(box[1], box[2]), `${width}px ${box[0]}`).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `${width}px overflow`).toBe(false);
  }
});

const heldNotice = page => page.locator('.console-notice.is-top');
const top = async locator => (await locator.boundingBox()).y;

test('another device holds the lease: the notice is on top with Take over, and the status says nothing is sent', async ({ page }) => {
  const server = await mockApi(page);
  server.lease = { deviceId: crypto.randomUUID(), lastClientSeq: 9 }; // the same account's other device
  await page.goto(`${APP}/operator/matches/7/score`);
  await expect(page.locator('h1')).toHaveText('Alpha vs Bravo');
  await expect(heldNotice(page)).toHaveAttribute('role', 'alert');
  await expect(page.locator('main [role="alert"]', { hasText: 'Another device' })).toHaveCount(1); // announced once
  await expect(heldNotice(page).getByRole('heading', { level: 2 })).toHaveText('Another device is scoring this match');
  await expect(heldNotice(page)).toContainText('Take over scoring to score here. This device then loads the latest score from the server.');
  await expect(page.locator('.score-console > :first-child')).toHaveClass(/is-top/);
  expect(await top(heldNotice(page))).toBeLessThan(await top(page.locator('.console-score')));
  await expect(status(page)).toHaveText('Not sending: another device is scoring');

  // Only the lease holder scores: no tap can be queued here while another device scores.
  await expect(point(page, 'Alpha')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Undo last' })).toBeDisabled();
  await heldNotice(page).getByRole('button', { name: 'Take over scoring' }).click();
  await expect(heldNotice(page)).toHaveCount(0);
  await expect(point(page, 'Alpha')).toBeEnabled();
  await point(page, 'Alpha').click();
  await expect(status(page)).toHaveText('Synced up to seq 4');
  expect(server.actions.map(a => a.clientSeq)).toEqual([1]); // TAKEOVER starts the lease at 0
});

test('a takeover by another device mid-match shows the top notice; this device never releases their lease', async ({ page }) => {
  const server = await mockApi(page);
  await openConsole(page, server);
  server.lease = { deviceId: crypto.randomUUID(), lastClientSeq: 0 }; // the other device took over
  await mockActionsOnce(page, server);
  await point(page, 'Alpha').click();
  await expect(status(page)).toHaveText('Not sending: another device is scoring · 1 queued');
  await expect(heldNotice(page).getByRole('button', { name: 'Take over scoring' })).toBeVisible();
  await expect(page.locator('.console-notice:not(.is-top)')).toHaveCount(0); // no second, lower copy
  await expect(heldNotice(page)).toContainText('discards its 1 unsent action');
  await expect(point(page, 'Bravo')).toBeDisabled();
  await page.getByRole('main').getByRole('link', { name: 'Back to My Matches' }).click();
  await expect(page.locator('h1')).toHaveText('My Matches');
  await page.waitForTimeout(300);
  expect(server.releases).toEqual([]);
});

test('Take over discards the actions made while another device scored and continues from the server score', async ({ page }) => {
  const server = await mockApi(page);
  await openConsole(page, server);
  server.lease = { deviceId: crypto.randomUUID(), lastClientSeq: 0 }; // the other device took over
  let refused = false; // only the first action post is refused; preflights and later posts go to mockApi
  await page.route(`${API}/matches/7/actions`, route => {
    if (refused || route.request().method() !== 'POST') return route.fallback();
    refused = true;
    server.actions.push(route.request().postDataJSON());
    return reply(route, 409, error('LEASE_REQUIRED'));
  });
  await point(page, 'Alpha').click(); // refused with LEASE_REQUIRED: it stays unsent here
  await expect(heldNotice(page)).toContainText('discards its 1 unsent action');
  await heldNotice(page).getByRole('button', { name: 'Take over scoring' }).click();
  await expect(heldNotice(page)).toHaveCount(0);
  await expect(log(page)).toHaveCount(0); // the refused action is gone, also after a reload
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Alpha vs Bravo');
  await expect(log(page)).toHaveCount(0);
  await point(page, 'Bravo').click();
  await expect(status(page)).toHaveText(/^Synced up to seq \d+$/);
  // Only the refused post and the new point reached the server; the refused one was never resent.
  expect(server.actions.map(a => a.payload.side)).toEqual([0, 1]);
});

/** Answers the next action post with 409 LEASE_REQUIRED, as the backend chain does after another device took over. */
async function mockActionsOnce(page, server) {
  await page.route(`${API}/matches/7/actions`, route => {
    if (route.request().method() === 'OPTIONS') return reply(route);
    server.actions.push(route.request().postDataJSON());
    return reply(route, 409, error('LEASE_REQUIRED'));
  }, { times: 2 }); // the preflight and the post
}

test('leaving the console releases the lease: pagehide with keepalive and the cached token, unmount with a fresh one', async ({ page }) => {
  const server = await mockApi(page);
  await openConsole(page, server);
  const device = server.lease.deviceId;
  await point(page, 'Alpha').click();
  await expect(status(page)).toHaveText('Synced up to seq 4');

  // The events of a page that enters the back-forward cache and comes back.
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await expect.poll(() => server.releases).toEqual([{ auth: `Bearer ${TOKEN}`, deviceId: device }]);
  expect(server.lease).toBe(null);
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect.poll(() => server.leases).toBe(2); // the restored page acquires the lease again (GRANT)
  await point(page, 'Bravo').click();
  await expect(status(page)).toHaveText('Synced up to seq 5');
  expect(server.actions.map(a => a.clientSeq)).toEqual([1, 1]); // the GRANT restarted the lease at 0

  await page.getByRole('main').getByRole('link', { name: 'Back to My Matches' }).click();
  await expect(page.locator('h1')).toHaveText('My Matches');
  await expect.poll(() => server.releases.length).toBe(2);
  expect(server.releases[1]).toEqual({ auth: `Bearer ${TOKEN}`, deviceId: device });
  expect(server.lease).toBe(null);
  expect(page.errors).toEqual([]);
});

test('reload after a release resumes the stored queue in order, with no lost or duplicated action', async ({ page }) => {
  const held = [];
  // Backend rules (scoring.js decideAction): the same actionId replays; a new one needs lease.lastClientSeq + 1.
  const server = await mockApi(page, (route, body) => {
    if (held.length < 1 && server.accepted.size === 1) { held.push(body); return; } // the second action never gets an answer
    if (server.accepted.has(body.actionId)) return reply(route, 409, error('UNEXPECTED_REPLAY'));
    if (body.deviceId !== server.lease?.deviceId) return reply(route, 409, error('LEASE_REQUIRED'));
    if (body.clientSeq !== server.lease.lastClientSeq + 1) return reply(route, 409, error('SEQUENCE_CONFLICT'));
    return server.accept(route, body);
  });
  await openConsole(page, server);
  await point(page, 'Alpha').click();
  await expect(status(page)).toHaveText('Synced up to seq 4');
  await point(page, 'Bravo').click();
  await expect.poll(() => held.length).toBe(1);
  await point(page, 'Alpha').click();
  await expect(log(page)).toHaveText(['#1 Point to Alpha · synced, seq 4', '#2 Point to Bravo · syncing', '#3 Point to Alpha · queued']);

  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect.poll(() => server.lease).toBe(null);
  await page.reload();
  await expect(status(page)).toHaveText('Synced up to seq 6');
  await expect(log(page)).toHaveText(['#1 Point to Alpha · synced, seq 4', '#2 Point to Bravo · synced, seq 5', '#3 Point to Alpha · synced, seq 6']);
  const accepted = [...server.accepted.keys()];
  expect(new Set(accepted).size).toBe(3);
  expect(accepted[1]).toBe(held[0].actionId); // the unanswered action, sent again with the same actionId
  expect(server.actions.slice(2).map(a => [a.clientSeq, a.payload.side])).toEqual([[1, 1], [2, 0]]); // fresh lease numbers
  await expect(scoreRow(page, 'Alpha')).toHaveText(['3', '3']);
  await expect(scoreRow(page, 'Bravo')).toHaveText(['1', '1']);
});


test('recovery reports once per interruption and a failed telemetry request never blocks the next score', async ({ page, context }) => {
  const server = await mockApi(page);
  const summaries = [];
  await page.route(API + '/operator/metrics', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    summaries.push({ body: route.request().postDataJSON(), auth: route.request().headers().authorization });
    return route.abort('failed');
  });
  await openConsole(page, server);
  await context.setOffline(true);
  await expect(status(page)).toHaveText('Offline · 0 queued');
  await point(page, 'Alpha').click(); await point(page, 'Bravo').click();
  await expect(status(page)).toHaveText('Offline · 2 queued');
  expect(summaries).toHaveLength(0);
  await context.setOffline(false);
  await expect(status(page)).toHaveText('Synced up to seq 5');
  await expect.poll(() => summaries.length).toBe(1);
  expect(summaries[0].auth).toBe('Bearer ' + TOKEN);
  expect(summaries[0].body).toMatchObject({ outcome: 'recovered', pending: 2, retries: 0 });
  expect(Object.keys(summaries[0].body).sort()).toEqual(['ageMs', 'durationMs', 'outcome', 'pending', 'retries']);
  await point(page, 'Alpha').click(); await expect(status(page)).toHaveText('Synced up to seq 6');
  expect(server.actions).toHaveLength(3);
  expect(summaries).toHaveLength(1);
  expect(server.actions.every(a => !('metrics' in a) && !('durationMs' in a))).toBe(true);
});
