import { inflateSync } from 'node:zlib';
import { test, expect } from '@playwright/test';
import { mockStaff, REPLIES } from './helpers.js';
import { monitoringEnvironment, replayAllowed, routeLabel, STAGING_ORIGIN, scrubError, scrubSpan,
  recoveryAttributes, scrubLog, scrubMetric, scrubReplayEnvelope } from '../src/services/monitoring-policy.js';
const dsn = 'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@o0.ingest.de.sentry.io/1';
const secret = 'private-credential@example.test';
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); });
const summary = { outcome: 'recovered', durationMs: 1250, ageMs: 2500, pending: 3, retries: 2 };

test('monitoring requires a public EU DSN and the exact deployed environment', () => {
  expect(monitoringEnvironment(STAGING_ORIGIN, dsn)).toBe('staging');
  expect(monitoringEnvironment('https://campuscores.live', dsn)).toBe('production');
  for (const [origin, value] of [['http://127.0.0.1:4176', dsn], ['https://evil.test', dsn], [STAGING_ORIGIN, undefined], [STAGING_ORIGIN, 'private-token'], [STAGING_ORIGIN, dsn + '?secret']]) {
    expect(monitoringEnvironment(origin, value)).toBeNull();
  }
});

test('replay only starts on public pages without query strings or hashes', () => {
  for (const path of ['/', '/privacy', '/sports/table-tennis', '/tournaments', '/tournaments/cup/badminton']) {
    expect(replayAllowed(new URL(path, STAGING_ORIGIN))).toBe(true);
  }
  for (const path of ['/sign-in', '/sign-in/scorer', '/account', '/start', '/manage', '/admin/staff', '/operator/matches/3/score', '/?token=private', '/#private', '/unknown', '/sports/unknown']) {
    expect(replayAllowed(new URL(path, STAGING_ORIGIN))).toBe(false);
  }
  expect(routeLabel('/operator/matches/3/score')).toBe('Staff');
  expect(routeLabel('/tournaments/private-slug')).toBe('Tournament');
});

test('errors retain readable app frames and Debug IDs but drop messages, credentials, bodies and external frames', () => {
  const url = `${STAGING_ORIGIN}/assets/index-1234.js`;
  const result = scrubError({ event_id: 'a'.repeat(32), release: 'campuscores@123', environment: 'staging',
    message: secret, user: { email: secret }, request: { headers: { Authorization: secret }, data: secret },
    extra: { score: secret }, breadcrumbs: [{ message: secret }],
    exception: { values: [{ type: 'TypeError', value: secret, mechanism: { handled: false, data: secret },
      stacktrace: { frames: [{ filename: `${url}?token=${secret}`, lineno: 2, colno: 4, function: 'render' }, { filename: `https://external.test/${secret}` }] } }] },
    debug_meta: { images: [{ code_file: url, debug_id: '12345678-1234-1234-1234-123456789012' }] },
  }, STAGING_ORIGIN);
  expect(JSON.stringify(result)).not.toContain(secret);
  expect(result.exception.values[0]).toMatchObject({ type: 'TypeError', value: 'Unexpected application error', mechanism: { handled: false } });
  expect(result.exception.values[0].stacktrace.frames).toEqual([{ filename: url, lineno: 2, colno: 4, function: 'render', in_app: true }]);
  expect(result.debug_meta.images).toHaveLength(1);
  expect(scrubError({ message: secret }, STAGING_ORIGIN)).toBeNull();
  expect(scrubError({ exception: { values: [{ stacktrace: { frames: [{ filename: `https://external.test/assets/a.js` }] } }] } }, STAGING_ORIGIN)).toBeNull();
});

test('streamed spans retain timing, status and technical IDs without URLs, element labels or private attributes', () => {
  const span = { trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16), name: secret, start_timestamp: 1, end_timestamp: 2, is_segment: false, status: 'ok',
    attributes: { 'sentry.op': 'http.client', 'http.response.status_code': 200, 'http.url': secret, 'user.email': secret, 'ui.element': secret }, links: [{ data: secret }] };
  expect(scrubSpan(span)).toEqual({ trace_id: span.trace_id, parent_span_id: undefined, span_id: span.span_id, name: 'http.client', start_timestamp: 1, end_timestamp: 2, is_segment: false, status: 'ok', attributes: { 'sentry.op': 'http.client', 'http.response.status_code': 200 } });
  expect(JSON.stringify(scrubSpan({ ...span, attributes: { 'sentry.op': secret } }))).not.toContain(secret);
});

test('logs and metrics accept only bounded queue summaries and approved names', () => {
  expect(recoveryAttributes({ ...summary, token: secret })).toEqual(summary);
  expect(scrubLog({ message: 'Scoring queue recovery', attributes: { ...summary, token: secret } })).toEqual({ level: 'info', message: 'Scoring queue recovery', attributes: summary });
  expect(scrubLog({ message: secret, attributes: summary })).toBeNull();
  expect(scrubLog({ message: 'Scoring queue recovery', attributes: { ...summary, pending: Infinity } })).toBeNull();
  const metric = { name: 'campuscores.queue.drain_ms', value: 1250, attributes: { outcome: 'recovered', token: secret } };
  expect(scrubMetric(metric)).toEqual({ name: metric.name, type: 'distribution', value: 1250, unit: 'millisecond', attributes: { outcome: 'recovered' } });
  for (const change of [{ name: secret }, { value: NaN }, { value: -1 }, { value: 86400001 }, { attributes: { outcome: secret } }]) expect(scrubMetric({ ...metric, ...change })).toBeNull();
  expect(recoveryAttributes({ ...summary, outcome: secret })).toBeNull();
  const context = { 'sentry.environment': 'staging', 'sentry.release': 'campuscores@' + 'a'.repeat(40) };
  expect(scrubMetric({ ...metric, attributes: { ...metric.attributes, ...context } }).attributes).toEqual({ ...context, outcome: 'recovered' });
  expect(scrubMetric({ ...metric, attributes: { ...metric.attributes, 'sentry.release': secret, 'sentry.environment': secret } }).attributes).toEqual({ outcome: 'recovered' });
  expect(scrubSpan({ attributes: context }).attributes).toMatchObject(context);
});

test('replay transport strips metadata while preserving the encoded, already masked recording', () => {
  const recording = new Uint8Array([1, 2, 3]);
  const envelope = [{ sent_at: 'now' }, [[{ type: 'replay_event' }, { replay_id: 'a'.repeat(32), segment_id: 0, urls: [secret], user: { email: secret }, request: { data: secret }, segment_names: [secret] }], [{ type: 'replay_recording' }, recording]]];
  const scrubbed = scrubReplayEnvelope(envelope, STAGING_ORIGIN + '/');
  expect(JSON.stringify(scrubbed)).not.toContain(secret);
  expect(scrubbed[1][0][1].urls).toEqual([STAGING_ORIGIN + '/']);
  expect(scrubbed[1][1][1]).toBe(recording);
});

test('local preview loads no Sentry SDK and remains navigable without a DSN', async ({ page }) => {
  const sentryRequests = [];
  page.on('request', request => { if (request.url().includes('sentry.io')) sentryRequests.push(request.url()); });
  await page.goto('/');
  await page.goto('/tournaments');
  await expect(page.getByRole('heading', { name: 'Tournaments', level: 1 })).toBeVisible();
  expect(sentryRequests).toEqual([]);
});

async function deployedPreview(page, { blocked = false, sdkBlocked = false, origin = STAGING_ORIGIN } = {}) {
  const envelopes = [];
  await page.addInitScript(() => { Math.random = () => 0.001; });
  await page.route('https://o0.ingest.de.sentry.io/**', route => {
    envelopes.push(route.request().postDataBuffer());
    return blocked ? route.abort() : route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route(`${origin}/**`, async route => {
    if (sdkBlocked && /\/assets\/esm-[\w-]+\.js$/.test(new URL(route.request().url()).pathname)) return route.abort();
    const path = new URL(route.request().url()).pathname;
    const response = await page.request.get(`http://127.0.0.1:4176${path}`);
    // Match the deployed HTTPS API origin while using the shared local test build.
    const body = path.endsWith('.js') ? (await response.text()).replaceAll('http://api.test', 'https://api.test') : await response.body();
    await route.fulfill({ response, body });
  });
  await page.route('https://api.test/api/**', route => route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { tournaments: [] } }));
  return envelopes;
}

test('a deployed-origin preview records sanitized traces and a real React render failure', async ({ page }) => {
  const envelopes = await deployedPreview(page);
  let socket;
  await page.routeWebSocket('wss://api.test/live/home', ws => { socket = ws; });
  await page.goto(STAGING_ORIGIN);
  await expect(page.getByRole('heading', { name: 'Live Matches', exact: true })).toBeVisible();
  await expect.poll(() => envelopes.some(body => body.toString().includes('"type":"span"'))).toBe(true);
  // A malformed snapshot exercises the app's real render path, without any hosted write.
  socket.send(JSON.stringify({ type: 'snapshot', seq: 1, data: [null] }));
  await expect.poll(() => envelopes.some(body => body.toString().includes('Unexpected application error'))).toBe(true);
  const event = envelopes.find(body => body.toString().includes('Unexpected application error')).toString();
  expect(event).toContain('TypeError');
  expect(event).not.toContain('reading');
  expect(event).not.toContain('"request":');
  expect(event).not.toContain('"user":');
});

test('blocked diagnostic collection preserves public navigation and page rendering', async ({ page }) => {
  const envelopes = await deployedPreview(page, { blocked: true });
  await page.routeWebSocket('wss://api.test/live/home', ws => ws.send(JSON.stringify({ type: 'snapshot', seq: 1, data: [] })));
  await page.goto(STAGING_ORIGIN);
  await expect(page.getByRole('heading', { name: 'Live Matches', exact: true })).toBeVisible();
  await expect.poll(() => envelopes.length).toBeGreaterThan(0);
  await page.locator('a[href="/tournaments"]').first().evaluate(link => link.click());
  await expect(page.getByRole('heading', { level: 1, name: 'Tournaments' })).toBeVisible();
});

test('replay masks DOM content and attributes, then stops on client navigation', async ({ page }) => {
  const envelopes = await deployedPreview(page);
  await page.routeWebSocket('wss://api.test/live/home', ws => ws.send(JSON.stringify({ type: 'snapshot', seq: 1, data: [] })));
  await page.goto(STAGING_ORIGIN);
  await expect.poll(() => envelopes.some(body => body.toString().includes('"type":"span"'))).toBe(true);
  await page.evaluate(value => {
    const div = document.createElement('div'); div.textContent = value;
    const input = document.createElement('input'); input.value = value;
    const link = document.createElement('a'); link.href = '/?token=' + value; link.textContent = value;
    div.append(input, link); document.body.append(div);
  }, secret);
  await expect.poll(() => envelopes.some(body => body.toString().includes('"type":"replay_recording"')), { timeout: 12000 }).toBe(true);
  const recordings = envelopes.filter(body => body.toString().includes('"type":"replay_recording"'));
  for (const body of recordings) {
    const header = body.indexOf('"type":"replay_recording"');
    const content = body.subarray(body.indexOf('\n', header) + 1);
    const data = content.subarray(content.indexOf('\n') + 1);
    const decoded = data[0] === 91 ? data.toString() : inflateSync(data).toString();
    expect(decoded).not.toContain(secret);
    expect(decoded).toContain('"type":2');
  }
  await page.locator('a[href="/tournaments"]').first().evaluate(link => link.click());
  await expect(page.getByRole('heading', { level: 1, name: 'Tournaments' })).toBeVisible();
  const stoppedCount = envelopes.filter(body => body.toString().includes('"type":"replay_recording"')).length;
  await page.evaluate(value => { document.body.append(document.createTextNode(value)); }, secret);
  await page.waitForTimeout(5500); // Replay normally flushes within 5 seconds; no new segment may follow navigation.
  expect(envelopes.filter(body => body.toString().includes('"type":"replay_recording"'))).toHaveLength(stoppedCount);
});


test('an unavailable SDK download leaves the app and route entries usable', async ({ page }) => {
  await deployedPreview(page, { sdkBlocked: true });
  const failed = []; page.on('requestfailed', request => { if (/\/assets\/esm-/.test(request.url())) failed.push(request.url()); });
  await page.routeWebSocket('wss://api.test/live/home', ws => ws.send(JSON.stringify({ type: 'snapshot', seq: 1, data: [] })));
  await page.goto(STAGING_ORIGIN);
  await expect(page.getByRole('heading', { name: 'Live Matches', exact: true })).toBeVisible();
  await expect.poll(() => failed.length).toBeGreaterThan(0);
  await page.locator('a[href="/tournaments"]').first().evaluate(link => link.click());
  await expect(page.getByRole('heading', { level: 1, name: 'Tournaments' })).toBeVisible();
});

test('production collects sampled timing without creating replay recordings', async ({ page }) => {
  const origin = 'https://campuscores.live';
  const envelopes = await deployedPreview(page, { origin });
  await page.routeWebSocket('wss://api.test/live/home', ws => ws.send(JSON.stringify({ type: 'snapshot', seq: 1, data: [] })));
  await page.goto(origin);
  await expect.poll(() => envelopes.some(body => body.toString().includes('"type":"span"'))).toBe(true);
  await page.waitForTimeout(5500);
  expect(envelopes.some(body => /"type":"(?:replay_event|replay_recording|log|trace_metric)"/.test(body.toString()))).toBe(false);
});


test('offline queue recovery emits bounded logs and metrics without auth or score contents', async ({ page, context }) => {
  const envelopes = await deployedPreview(page);
  await mockStaff(page, { me: REPLIES.scorer });
  const api = 'https://api.test/api';
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, DELETE' };
  await page.route(api + '/me', route => route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers }) : route.fulfill({ headers, json: { role: 'MATCH_OPERATOR', status: 'ACTIVE' } }));
  const answer = (route, json) => route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers }) : route.fulfill({ headers, json });
  const match = { id: 7, tournamentId: 1, sport: 'football', kind: 'CUSTOM', stage: null, status: 'LIVE', seq: 3, sides: [{ name: 'Alpha' }, { name: 'Bravo' }], validNow: true };
  await page.route(api + '/operator/matches', route => answer(route, { matches: [match] }));
  await page.route(api + '/matches/7', route => answer(route, { match: { id: 7, seq: 3, snapshot: { sides: [{ name: 'Alpha', points: 1 }, { name: 'Bravo', points: 0 }] } } }));
  let lastClientSeq = 0; let seq = 3; const points = [1, 0];
  await page.route(api + '/matches/7/lease', route => answer(route, { lease: { matchId: 7, deviceId: route.request().postDataJSON()?.deviceId, lastClientSeq } }));
  await page.route(api + '/matches/7/actions', route => {
    if (route.request().method() === 'OPTIONS') return answer(route);
    const action = route.request().postDataJSON(); lastClientSeq = action.clientSeq; seq++; points[action.payload.side]++;
    return answer(route, { actionId: action.actionId, seq, snapshot: { sides: [{ name: 'Alpha', points: points[0] }, { name: 'Bravo', points: points[1] }] } });
  });
  await page.route(api + '/operator/metrics', route => answer(route, {}));
  await page.goto(STAGING_ORIGIN + '/operator/matches/7/score');
  await expect(page.locator('.console-status')).toHaveText('Online');
  await expect.poll(() => envelopes.some(body => body.toString().includes('"type":"span"'))).toBe(true);
  await context.setOffline(true);
  await expect(page.locator('.console-status')).toHaveText('Offline · 0 queued');
  await page.getByRole('button', { name: 'Point to Alpha', exact: true }).click();
  await expect(page.locator('.console-status')).toHaveText('Offline · 1 queued');
  await context.setOffline(false);
  await expect(page.locator('.console-status')).toHaveText('Synced up to seq 4');
  await expect.poll(() => envelopes.some(body => body.toString().includes('Scoring queue recovery')), { timeout: 12000 }).toBe(true);
  await expect.poll(() => envelopes.some(body => body.toString().includes('campuscores.queue.drain_ms')), { timeout: 12000 }).toBe(true);
  const data = Buffer.concat(envelopes).toString();
  for (const privateValue of ['staff-token', 'Alpha', 'Bravo', 'user_operator', 'sess_operator']) expect(data).not.toContain(privateValue);
  expect(data).not.toContain('"type":"replay_event"');
});
