import { expect } from '@playwright/test';

/** Real touch swipe from near the right edge of `locator`. Chromium only: it uses CDP touch input. */
export async function swipe(page, locator, distance = 224) {
  const session = await page.context().newCDPSession(page);
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const [x, y] = [box.x + box.width - 40, box.y + box.height / 2];
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 8; step++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - step * distance / 8, y }] });
    await page.waitForTimeout(16);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
}

// shortcut: patches the built bundle text; breaks if the bundler output form changes, upgrade to a render harness if component tests are added.
/** The production app bundle: `{ url, text }`. */
export async function bundle(page) {
  const html = await (await page.request.get('/')).text();
  const src = html.match(/src="(\/assets\/index-[\w-]+\.js)"/)?.[1];
  expect(src, 'app bundle script in index.html').toBeTruthy();
  return { url: src, text: await (await page.request.get(src)).text() };
}

/** Serve `text` instead of the real bundle for the rest of the page's life. */
export async function serveBundle(page, url, text) {
  await page.route(`**${url}`, route => route.fulfill({ body: text, contentType: 'text/javascript' }));
}

/** Replace the string literal `from` (backtick or double-quoted form) with `to`. */
export function replaceLiteral(text, from, to) {
  let count = 0;
  for (const quote of ['`', '"']) {
    const parts = text.split(`${quote}${from}${quote}`);
    count += parts.length - 1;
    text = parts.join(`${quote}${to}${quote}`);
  }
  return { text, count };
}

/**
 * Clerk stub used only by isolated browser tests: `addInitScript(stubClerk, token)` signs in with `token`;
 * `addInitScript(stubClerk, { signedOut: true })` is a loaded, signed-out Clerk. `openSignIn()` (the "Sign in again"
 * modal) only counts its calls in `window.__openSignInCalls`.
 */
export function stubClerk(arg) {
  const { token, signedOut } = arg && typeof arg === 'object' ? arg : { token: arg };
  const user = signedOut ? null : { id: 'user_operator', organizationMemberships: [] };
  const session = signedOut ? null : { id: 'sess_operator', status: 'active', user, actor: null, factorVerificationAge: null, lastActiveToken: { jwt: { claims: { sub: user.id, sid: 'sess_operator' } } }, getToken: async () => token };
  const sessions = session ? [session] : [];
  const resources = { client: { sessions, signedInSessions: sessions, lastActiveSessionId: session?.id ?? null }, session, user, organization: null };
  window.__openSignInCalls = 0;
  window.Clerk = {
    loaded: true, isSignedIn: !signedOut, user, session, client: resources.client, organization: null,
    __internal_lastEmittedResources: resources,
    addListener(listener, options) { if (!options?.skipInitialEmit) listener(resources); return () => {}; },
    openSignIn() { window.__openSignInCalls += 1; },
  };
}

// Staff pages run on the live-mode build (port 4176): it has VITE_API_BASE=http://api.test and a fake Clerk key.
export const STAFF_APP = 'http://127.0.0.1:4176';
const STAFF_API = 'http://api.test/api';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PATCH, DELETE' };
/** Error_Body of the backend (`backend/src/http.js` onError). */
export const apiError = (code, message) => ({ error: { code, message, requestId: 'req-test' } });
/** Backend replies as [status, body], copied from `backend/src/routes/me.js`, `invites.js` and `auth.js`. */
export const REPLIES = {
  scorer: [200, { role: 'MATCH_OPERATOR', status: 'ACTIVE' }],
  manager: [200, { role: 'TOURNAMENT_MANAGER', status: 'ACTIVE' }],
  admin: [200, { role: 'SUPER_ADMIN', status: 'ACTIVE' }],
  viewer: [200, { role: 'VIEWER' }],
  unauthenticated: [401, apiError('UNAUTHENTICATED', 'Sign in required')],
  internal: [500, apiError('INTERNAL', 'Internal error')],
  inviteNotFound: [404, apiError('INVITE_NOT_FOUND', 'No pending invitation for a verified email')],
  accountExists: [409, apiError('ACCOUNT_EXISTS', 'This user already has a staff account')],
  clerkDown: [502, apiError('CLERK_UNAVAILABLE', 'Sign-in service unavailable')],
};

/**
 * Stub Clerk (signed in unless `signedOut`) and the API for staff pages. `me` and `accept` give the replies of
 * GET /api/me and POST /api/invites/accept: a [status, body] pair, or `n => pair | Promise<pair>` for the n-th call.
 * Any other API path answers 404 NOT_FOUND; sockets never connect. Returns the request counts `{ me, accept }`.
 */
export async function mockStaff(page, { me = REPLIES.manager, accept = REPLIES.inviteNotFound, signedOut = false } = {}) {
  const calls = { me: 0, accept: 0, other: 0 };
  const answer = (key, reply) => async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    calls[key] += 1;
    const [status, body] = await (typeof reply === 'function' ? reply(calls[key]) : reply);
    return route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  };
  await page.addInitScript(stubClerk, signedOut ? { signedOut: true } : 'staff-token');
  await page.route('https://clerk.operator.test/**', route => route.abort()); // nothing may reach a real Clerk host
  await page.routeWebSocket(/^wss?:\/\/api\.test\//, () => {});
  await page.route(`${STAFF_API}/**`, route => route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: cors })
    : route.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: JSON.stringify(apiError('NOT_FOUND', 'Not found')) }));
  await page.route(`${STAFF_API}/operator/matches`, answer('other', [200, { matches: [] }]));
  await page.route(`${STAFF_API}/me`, answer('me', me));
  await page.route(`${STAFF_API}/invites/accept`, answer('accept', accept));
  return calls;
}

/**
 * Route `/api/manage/**` to `reply(request, requests)`. `request` is `{ method, path, query, body }`, with `path` after
 * `/api` and `body` the parsed JSON body or null. `reply` returns `[status, body]`, `'abort'` (no response) or a promise
 * of either. Returns the log of requests (no preflight). Call after mockStaff: Playwright tries the newest route first.
 * `pattern` widens the routed URLs, for example to the assignment and invitation writes outside `/api/manage`.
 */
export async function mockManage(page, reply, pattern = /^http:\/\/api\.test\/api\/manage\//) {
  const requests = [];
  await page.route(pattern, async route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(request.url());
    const raw = request.postData();
    const entry = { method: request.method(), path: url.pathname.replace(/^\/api/, ''), query: Object.fromEntries(url.searchParams), body: raw ? JSON.parse(raw) : null };
    requests.push(entry);
    const answer = await reply(entry, requests);
    if (answer === 'abort') return route.abort();
    const [status, body] = answer;
    return route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return requests;
}

/** A reply the test sends later: give `reply` to the mock, then call `release(answer)`. */
export function held() {
  let release;
  const reply = new Promise(resolve => { release = resolve; });
  return { reply, release };
}

/** Press Tab (or `key`, such as 'Shift+Tab') until `target` has focus: keyboard only, at most `max` presses. */
export async function tabTo(page, target, key = 'Tab', max = 40) {
  for (let n = 0; n < max && !(await target.evaluate(el => el === document.activeElement)); n++) await page.keyboard.press(key);
  await expect(target).toBeFocused();
}

/** No error code, request ID or backend message in the visible text of `main` (Req 19.4, 20.3). */
export async function expectNoCode(page, raw = []) {
  const text = await page.getByRole('main').innerText();
  for (const value of ['req-test', 'BAD_REQUEST', 'INTERNAL', 'UNAUTHENTICATED', 'Internal error', 'Sign in required', ...raw]) {
    expect(text, `visible text shows "${value}"`).not.toContain(value);
  }
}

/**
 * Visible targets smaller than 44×44 CSS pixels (Req 19.1). A radio or checkbox is measured by its label, which is the
 * clickable target. Screen-reader-only text (1px) and closed menus or dialogs (no box) are skipped.
 */
export const smallTargets = page => page.evaluate(() => [...document.querySelectorAll('a[href], button, input, select, textarea, summary')]
  .map(el => (el.matches('[type="checkbox"], [type="radio"]') && el.closest('label')) || el)
  .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
  .map(el => ({ el, box: el.getBoundingClientRect() }))
  .filter(({ box }) => box.width > 1 && (box.width < 44 || box.height < 44))
  .map(({ el, box }) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40)}" ${Math.round(box.width)}×${Math.round(box.height)}`));

/** Horizontal page overflow in CSS pixels; 0 or less means none (Req 21.9). */
export const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
