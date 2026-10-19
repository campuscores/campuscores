// Smoke_Script: checks one deployed environment. Run by .github/workflows/deploy.yml after `wrangler deploy`:
//   node backend/scripts/smoke.js https://<environment origin>
import { pathToFileURL } from 'node:url';
const TIMEOUT_MS = 10000;
// Fetches `${baseUrl}${path}`; returns the status and the parsed JSON body (null when not JSON).
async function getJson(fetchImpl, baseUrl, path) {
  const res = await fetchImpl(new URL(path, baseUrl), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  return { status: res.status, body: await res.json().catch(() => null) };
}
// Resolves with the first message text of `/live/home`; rejects on error, close or timeout.
function firstHomeMessage(WebSocketImpl, baseUrl) {
  const url = new URL('/live/home', baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return new Promise((resolve, reject) => {
    const ws = new WebSocketImpl(url.href);
    const done = (fn, value) => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // Already closed.
      }
      fn(value);
    };
    const timer = setTimeout(() => done(reject, new Error(`no message within ${TIMEOUT_MS} ms`)), TIMEOUT_MS);
    ws.addEventListener('message', (e) => done(resolve, typeof e.data === 'string' ? e.data : String(e.data)));
    ws.addEventListener('error', () => done(reject, new Error('socket error')));
    ws.addEventListener('close', (e) => done(reject, new Error(`socket closed (${e.code}) before the first message`)));
  });
}
const checks = [
  ['GET /health', async ({ fetchImpl, baseUrl }) => {
    const { status, body } = await getJson(fetchImpl, baseUrl, '/health');
    if (status !== 200 || body?.ok !== true) throw new Error(`expected 200 {ok:true}, got ${status}`);
  }],
  ['GET /api/tournaments', async ({ fetchImpl, baseUrl }) => {
    const { status, body } = await getJson(fetchImpl, baseUrl, '/api/tournaments');
    if (status !== 200 || !Array.isArray(body?.tournaments)) throw new Error(`expected 200 {tournaments:[]}, got ${status}`);
  }],
  ['/live/home first message', async ({ WebSocketImpl, baseUrl }) => {
    const message = JSON.parse(await firstHomeMessage(WebSocketImpl, baseUrl));
    if (message?.type !== 'snapshot' || message.room !== 'home') throw new Error('expected a home snapshot message');
  }],
  ['GET /api/me without a token', async ({ fetchImpl, baseUrl }) => {
    const { status } = await getJson(fetchImpl, baseUrl, '/api/me');
    if (status !== 401) throw new Error(`expected 401, got ${status}`);
  }],
];
// Runs every check in order. Throws on the first failure; the error names the check in `message` and `check`.
export async function runChecks(baseUrl, fetchImpl = fetch, WebSocketImpl = WebSocket) {
  for (const [name, check] of checks) {
    try {
      await check({ baseUrl, fetchImpl, WebSocketImpl });
    } catch (err) {
      throw Object.assign(new Error(`Smoke check failed: ${name}: ${err.message}`), { check: name });
    }
    console.log(`ok - ${name}`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseUrl = process.argv[2];
  if (!/^https?:\/\/\S+$/.test(baseUrl ?? '')) {
    console.error('Usage: smoke.js <http(s) base URL>');
    process.exit(1);
  }
  runChecks(baseUrl).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
