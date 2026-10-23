import { test as base, expect } from '@playwright/test';
import { stubClerk } from './helpers.js';
import { DEFAULT_FORMATS, scoreMatch, validateFormat } from '../../shared/scoring.mjs';
import { timeText } from '../../shared/time.mjs';
const APP = 'http://127.0.0.1:4176';
const API = 'http://api.test/api';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, DELETE' };
const test = base.extend({ page: async ({ page }, runPage) => { const errors = []; page.on('pageerror', e => errors.push(e.message)); await runPage(page); expect(errors).toEqual([]); } });
const point = (page, n = 1, name = 'Alpha') => page.getByRole('button', { name: `Add ${n} to ${name}`, exact: true });
const START_STATUS = { START_TOO_EARLY: 403, TOURNAMENT_NOT_ONGOING: 409, MATCH_DAY_OVER: 409 };
// Row shape of GET /api/operator/matches (backend/src/routes/assignments.js): canStart/startReason only for SCHEDULED.
// `refuseStart` is the code POST /actions gives a START although the list said canStart (database time moved on).
async function mockScoring(page, sport, { scheduled = false, custom = {}, isToday = true, startReason = null, refuseStart = null, scheduledAt = new Date().toISOString(),
  defaultFormat = DEFAULT_FORMATS[sport], validNow = true, dropFinal = false, leaseHeld = false } = {}) {
  const format = validateFormat(sport, { ...DEFAULT_FORMATS[sport], ...custom });
  const match = { id: '7', sport, kind: 'BRACKET', status: scheduled ? 'SCHEDULED' : 'LIVE', sides: [{ name: 'Alpha' }, { name: 'Bravo' }], venue: 'Court 1', stage: 'SF1', scheduledAt, isToday, validNow,
    canStart: scheduled && !startReason, startReason: scheduled ? startReason : null, notScored: false, defaultFormat, ...(scheduled ? {} : { format }) };
  const server = { match, actions: [], requests: [], clientSeq: 0, responses: new Map(), seq: 0, snapshot: scheduled ? null : scoreMatch({ matchId: '7', sport, sides: match.sides, format }), dropped: false };
  const reply = (route, body, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  await page.addInitScript(stubClerk, 'operator-token');
  await page.route('https://clerk.operator.test/**', route => route.abort());
  await page.route(`${API}/**`, async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (path === '/api/me') return reply(route, { role: 'MATCH_OPERATOR', status: 'ACTIVE' }); // the staff role gate
    if (path === '/api/operator/matches') return reply(route, { matches: [match] });
    if (path === '/api/operator/matches/7/scoring') return reply(route, { seq: server.seq, snapshot: server.snapshot, actions: server.actions });
    if (path === '/api/matches/7') return reply(route, { match: { ...match, seq: server.seq, snapshot: server.snapshot } });
    // `leaseHeld`: another device holds the lease until this one takes over (backend leases.js LEASE_HELD).
    if (path.endsWith('/lease') && leaseHeld && req.method() === 'POST' && !req.postDataJSON().takeover) return reply(route, { error: { code: 'LEASE_HELD', message: 'held', requestId: 'req-test' } }, 409);
    if (path.endsWith('/lease')) return reply(route, { lease: { lastClientSeq: server.clientSeq } });
    if (!path.endsWith('/actions')) return reply(route, { error: { code: 'NOT_FOUND', message: 'not found' } }, 404);
    expect(req.headers().authorization).toBe('Bearer operator-token');
    const body = req.postDataJSON(); server.requests.push(body);
    if (server.responses.has(body.actionId)) return reply(route, server.responses.get(body.actionId));
    if (match.status === 'APPROVED') return reply(route, { error: { code: 'SCORING_LOCKED', message: 'locked' } }, 409);
    const refusal = body.type === 'START' && (match.canStart ? refuseStart : match.startReason); // START rule only (backend scoring.js startDecision)
    if (refusal) return reply(route, { error: { code: refusal, message: refusal, requestId: 'req-test' } }, START_STATUS[refusal]);
    expect(body.clientSeq).toBe(server.clientSeq + 1);
    if (body.type === 'START') match.format = validateFormat(sport, body.payload.format);
    const next = scoreMatch({ matchId: '7', sport, sides: match.sides, format: match.format, actions: [...server.actions, body] });
    server.seq++; server.clientSeq = body.clientSeq; server.snapshot = next; match.status = next.status;
    server.actions.push({ ...body, seq: server.seq });
    const result = { actionId: body.actionId, seq: server.seq, snapshot: next }; server.responses.set(body.actionId, result);
    if (dropFinal && body.type === 'FINALIZE' && !server.dropped) { server.dropped = true; return route.abort('failed'); }
    return reply(route, result);
  });
  return server;
}
async function open(page) { await page.goto(`${APP}/operator/matches/7/score`); await expect(page.locator('h1')).toHaveText('Alpha vs Bravo'); await expect(page.locator('.console-status')).toHaveText('Online'); }
async function accepted(page, seq) { await expect(page.locator('.console-status')).toHaveText(`Synced up to seq ${seq}`); }

for (const sport of Object.keys(DEFAULT_FORMATS)) {
  test(`${sport}: real assigned match scores and undoes without a fixture route`, async ({ page }) => {
    const server = await mockScoring(page, sport);
    await open(page); await point(page).click(); await accepted(page, 1);
    expect(server.snapshot.currentPoints[0]).toBe(1);
    if (['football', 'basketball'].includes(sport)) { expect(server.actions[0].payload).not.toHaveProperty('player'); await expect(page.locator('dialog[open]')).toHaveCount(0); }
    await page.getByRole('button', { name: 'Undo last action' }).click(); await accepted(page, 2);
    expect(server.snapshot.currentPoints).toEqual([0, 0]); expect(server.actions[1].reversesActionId).toBe(server.actions[0].actionId);
    await page.reload(); await expect(page.locator('.console-status')).toHaveText('Synced up to seq 2');
    expect(server.requests).toHaveLength(2);
  });
}
test('custom format is selected before starting, frozen and saved with the START action', async ({ page }, testInfo) => {
  const server = await mockScoring(page, 'badminton', { scheduled: true }); await open(page);
  await page.getByRole('combobox', { name: 'Scoring format', exact: true }).selectOption('custom');
  await page.getByLabel('Best of (odd number of sets)', { exact: true }).fill('7');
  await page.getByLabel('Points to win a set', { exact: true }).fill('15');
  await page.getByLabel('Points in the deciding set', { exact: true }).fill('10');
  await page.getByLabel('Golden point at a tied score (optional)', { exact: true }).fill('25');
  await expect(page.getByText('At 25–25, the next point wins.')).toBeVisible();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`format-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Start match', exact: true }).click(); await accepted(page, 1);
  expect(server.match.format).toMatchObject({ bestOf: 7, target: 15, decidingTarget: 10, cap: 26 });
  await expect(page.getByRole('button', { name: 'Start match' })).toHaveCount(0);
  await page.reload(); await expect(point(page)).toBeVisible();
});
test('early set winner keeps actual points; cancelling final confirmation keeps undo available', async ({ page }) => {
  const server = await mockScoring(page, 'badminton', { custom: { bestOf: 1 } }); await open(page);
  await point(page).click(); await accepted(page, 1);
  await page.getByRole('button', { name: 'End set early' }).click();
  const dialog = page.getByRole('dialog', { name: 'End set early' });
  await dialog.getByRole('radio', { name: 'Bravo' }).check(); await dialog.getByRole('button', { name: 'Confirm', exact: true }).click(); await accepted(page, 2);
  expect(server.snapshot.periods[0]).toMatchObject({ points: [1, 0], winner: 1, manual: true });
  await page.getByRole('button', { name: 'Confirm final result', exact: true }).click(); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Undo last action' }).click(); await accepted(page, 3);
  expect(server.snapshot.winner).toBe(null); await expect(point(page)).toBeEnabled();
});
test('deciding score can be undone; final acceptance is retry-safe, read-only after reload and in Completed', async ({ page }) => {
  const server = await mockScoring(page, 'badminton', { custom: { bestOf: 1, target: 1, decidingTarget: 1, winBy: 1 }, dropFinal: true }); await open(page);
  await point(page).click(); await accepted(page, 1);
  await page.getByRole('button', { name: 'Undo last action' }).click(); await accepted(page, 2); expect(server.snapshot.winner).toBe(null);
  await point(page).click(); await accepted(page, 3);
  await page.getByRole('button', { name: 'Confirm final result', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm and lock result', exact: true }).click(); await accepted(page, 4);
  expect(server.actions.filter(a => a.type === 'FINALIZE')).toHaveLength(1);
  const finals = server.requests.filter(a => a.type === 'FINALIZE'); expect(finals.length).toBeGreaterThan(1); expect(finals[0].actionId).toBe(finals[1].actionId);
  await expect(page.getByText('Alpha won. Final result · editing locked.')).toBeVisible(); await expect(point(page)).toHaveCount(0);
  await page.reload(); await expect(page.getByText('Alpha won. Final result · editing locked.')).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Back to My Matches', exact: true }).click(); // StaffShell Back (Req 4.10)
  await expect(page.locator('#op-completed [data-match-id="7"]')).toBeVisible();
});
test('football cards and substitutions use display names while goals belong only to teams', async ({ page }) => {
  const server = await mockScoring(page, 'football'); await open(page);
  await page.getByRole('button', { name: 'Yellow card', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Player name', { exact: true }).fill('Kabir');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click(); await accepted(page, 1);
  await page.getByRole('button', { name: 'Substitute', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Player off', { exact: true }).fill('Aman'); await page.getByRole('dialog').getByLabel('Player on', { exact: true }).fill('Rohit');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click(); await accepted(page, 2);
  await point(page).click(); await accepted(page, 3);
  await expect(page.locator('.timeline-list')).toContainText('Yellow card · Kabir'); await expect(page.locator('.timeline-list')).toContainText('Rohit on for Aman');
  expect(server.snapshot.sides[0].points).toBe(1); expect(server.actions[2].payload).toEqual({ side: 0, value: 1 });
});
test('offline points stay pending, survive reload and send once in order', async ({ page, context }) => {
  const server = await mockScoring(page, 'volleyball'); await open(page);
  await context.setOffline(true); await page.evaluate(() => dispatchEvent(new Event('offline')));
  await point(page).click(); await expect(page.locator('.console-status')).toHaveText('Offline · 1 queued'); expect(server.actions).toHaveLength(0);
  await context.setOffline(false); await page.reload(); await accepted(page, 1); expect(server.actions).toHaveLength(1);
});
test('another device scoring: the lease notice sits above the format form, nothing is sent, and Take over resumes', async ({ page }) => {
  const server = await mockScoring(page, 'badminton', { scheduled: true, leaseHeld: true });
  await page.goto(`${APP}/operator/matches/7/score`); await expect(page.locator('h1')).toHaveText('Alpha vs Bravo');
  const notice = page.locator('.console-notice.is-top');
  await expect(notice).toHaveAttribute('role', 'alert');
  await expect(notice.getByRole('heading', { level: 2 })).toHaveText('Another device is scoring this match');
  await expect(notice).toContainText('Your actions stay saved on this device.');
  await expect(page.locator('.scoring-page > :first-child')).toHaveClass(/is-top/); // above the status, scoreboard and format form
  await expect(page.locator('main [role="alert"]', { hasText: 'Another device' })).toHaveCount(1);
  await expect(page.locator('.console-status')).toHaveText('Not sending: another device is scoring');
  expect((await notice.getByRole('button', { name: 'Take over scoring' }).boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: 'Start match', exact: true }).click();
  await expect(page.locator('.console-status')).toHaveText('Not sending: another device is scoring · 1 queued');
  expect(server.requests).toHaveLength(0);
  await notice.getByRole('button', { name: 'Take over scoring' }).click(); await accepted(page, 1);
  await expect(notice).toHaveCount(0); await expect(point(page)).toBeVisible();
  expect(server.requests.map(r => [r.type, r.clientSeq])).toEqual([['START', 1]]);
});
test('future-date and expired assignments cannot start a match', async ({ page }) => {
  const server = await mockScoring(page, 'badminton', { scheduled: true, isToday: false, startReason: 'START_TOO_EARLY', validNow: false }); await open(page);
  await expect(page.getByText(/^You can start this match from \d{2}:\d{2} IST on \d{1,2} [A-Z][a-z]{2}\.$/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start match' })).toBeDisabled(); expect(server.actions).toHaveLength(0);
});
const AT = '2026-10-21T09:30:00.000Z';
for (const [why, options, sentence] of [
  ['the tournament is not running', { startReason: 'TOURNAMENT_NOT_ONGOING' }, 'This tournament is not running.'],
  ['its day is over', { startReason: 'MATCH_DAY_OVER' }, 'This match was not started on its day. It is marked Not scored.'],
  ['it is too early today', { startReason: 'START_TOO_EARLY', scheduledAt: AT }, `You can start this match from ${timeText(Date.parse(AT))} today.`],
  ['it has no start time', { startReason: 'START_TOO_EARLY', scheduledAt: null }, 'This match has no start time yet.'],
]) {
  test(`Start match is off with its reason when ${why}`, async ({ page }) => {
    const server = await mockScoring(page, 'badminton', { scheduled: true, ...options }); await open(page);
    await expect(page.getByText(sentence, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start match' })).toBeDisabled();
    await expect(page.getByRole('main')).not.toContainText(/START_TOO_EARLY|MATCH_DAY_OVER|TOURNAMENT_NOT_ONGOING/);
    expect(server.requests).toHaveLength(0);
  });
}
test('the tournament default format comes first; re-choosing it after the preset and a change restores it, and START sends it', async ({ page }) => {
  const defaultFormat = { ...DEFAULT_FORMATS.badminton, bestOf: 5, target: 15 };
  const server = await mockScoring(page, 'badminton', { scheduled: true, defaultFormat }); await open(page);
  const choice = page.getByRole('combobox', { name: 'Scoring format', exact: true });
  const bestOf = page.getByLabel('Best of (odd number of sets)', { exact: true });
  const target = page.getByLabel('Points to win a set', { exact: true });
  await expect(choice).toHaveValue('default');
  await expect(choice.locator('option')).toHaveText(['Tournament default format', 'Official scoring preset', 'Changed for this match']);
  await expect(bestOf).toHaveValue('5');
  await expect(target).toHaveValue('15');
  await choice.selectOption({ label: 'Official scoring preset' });
  await expect(bestOf).toHaveValue(String(DEFAULT_FORMATS.badminton.bestOf));
  await expect(target).toHaveValue(String(DEFAULT_FORMATS.badminton.target));
  await bestOf.fill('7');
  await expect(choice).toHaveValue('custom');
  await expect(page.getByRole('main')).not.toContainText(/custom/i); // Req 12.11: the word never shows
  await choice.selectOption({ label: 'Tournament default format' });
  await expect(bestOf).toHaveValue('5');
  await expect(target).toHaveValue('15');
  await page.getByRole('button', { name: 'Start match', exact: true }).click(); await accepted(page, 1);
  expect(server.requests.map(r => [r.type, r.payload.format])).toEqual([['START', validateFormat('badminton', defaultFormat)]]);
});
test('a START the server refuses after the list allowed it pauses sync, keeps the queued START across a reload and shows the refusal', async ({ page }) => {
  const server = await mockScoring(page, 'badminton', { scheduled: true, refuseStart: 'MATCH_DAY_OVER' }); await open(page);
  await page.getByRole('button', { name: 'Start match', exact: true }).click();
  const refused = async () => {
    await expect(page.locator('.console-status')).toHaveText('Requires attention: MATCH_DAY_OVER');
    await expect(page.locator('.console-notice')).toContainText('Sync stopped with MATCH_DAY_OVER. Your queued actions are kept. Ask a Tournament Manager to fix the cause, then retry.');
    await expect(page.getByText('1 action is saved on this device and awaiting acceptance.')).toBeVisible();
    await expect(point(page)).toBeDisabled();
  };
  await refused();
  await page.waitForTimeout(1200); // a paused queue sends nothing more
  expect(server.requests).toHaveLength(1);
  await page.reload(); await expect(page.locator('h1')).toHaveText('Alpha vs Bravo');
  await refused();
  expect(server.requests.map(r => r.type)).toEqual(['START', 'START']);
  expect(server.requests[1].actionId).toBe(server.requests[0].actionId); // the same stored action, resent once
  expect(server.actions).toHaveLength(0);
});
test('a Live match keeps scoring after its scheduled day (no date check after START)', async ({ page }) => {
  const server = await mockScoring(page, 'badminton', { isToday: false }); await open(page);
  await point(page).click(); await accepted(page, 1); expect(server.actions).toHaveLength(1);
});
test('scoring layout and custom settings fit phones through desktop with keyboard dialogs', async ({ page }, testInfo) => {
  await mockScoring(page, 'badminton', { custom: { bestOf: 1 } }); await open(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 390 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`scoring-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(await page.locator('.point-btn, .scoring-action, .staff-back').evaluateAll(els => els.filter(el => el.getClientRects().length && el.getBoundingClientRect().height < 44).length)).toBe(0);
  }
  await page.getByRole('button', { name: 'End set early' }).focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'End set early' })).toBeFocused();
});
test.describe('India match dates', () => {
  test.use({ timezoneId: 'America/Los_Angeles' });
  test('dashboard dates stay in India time on another device timezone', async ({ page }) => {
    const server = await mockScoring(page, 'badminton', { scheduled: true }); server.match.scheduledAt = '2026-10-20T18:35:00Z';
    await page.goto(APP + '/operator/matches');
    await expect(page.getByRole('button', { name: '21 Oct', exact: true })).toBeVisible();
    await expect(page.locator('#op-scheduled .match-clock')).toHaveText('21 Oct · 00:05');
  });
});

test('a tied football match keeps undo but offers no unapproved deciding period or final winner', async ({ page }) => {
  await mockScoring(page, 'football', { custom: { periodCount: 1 } }); await open(page);
  await page.getByRole('button', { name: 'End period', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click(); await accepted(page, 1);
  await expect(page.getByText('Scores are tied. The organizer must agree the football tie policy before this result can be finalized.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start extra period', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Confirm final result', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo last action' }).click(); await accepted(page, 2); await expect(point(page)).toBeEnabled();
});
