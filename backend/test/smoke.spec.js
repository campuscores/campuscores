import { env, exports as workerExports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { runChecks } from '../scripts/smoke.js';

const BASE = 'http://example.com';
const selfFetch = (input, init) => workerExports.default.fetch(String(input), init);

// Minimal WebSocket over the Worker: `new SelfSocket(url)` plus addEventListener/close, as smoke.js uses.
class SelfSocket {
  constructor(url) {
    this.listeners = [];
    selfFetch(url.replace(/^ws/, 'http'), { headers: { Upgrade: 'websocket' } }).then(
      (res) => {
        this.ws = res.webSocket;
        if (!this.ws) return this.emit('close', { code: res.status });
        for (const [type, fn] of this.listeners) this.ws.addEventListener(type, fn);
        this.ws.accept();
      },
      () => this.emit('error', {}),
    );
  }
  addEventListener(type, fn) {
    this.listeners.push([type, fn]);
  }
  emit(type, event) {
    for (const [t, fn] of this.listeners) if (t === type) fn(event);
  }
  close() {
    this.ws?.close(1000);
  }
}

describe('Smoke_Script runChecks', () => {
  // GET /api/tournaments reads the database.
  it.skipIf(!env.HYPERDRIVE_CACHED)('passes every check against the Worker', async () => {
    const home = env.ROOMS.get(env.ROOMS.idFromName('home'));
    await home.publishCard(901, { id: 901, status: 'LIVE', score: [0, 0] }, 1); // the live check needs a stored home list
    await expect(runChecks(BASE, selfFetch, SelfSocket)).resolves.toBeUndefined();
  });

  it('names the failing check', async () => {
    const broken = (input, init) =>
      new URL(input).pathname === '/health' ? Promise.resolve(new Response('down', { status: 503 })) : selfFetch(input, init);
    const err = await runChecks(BASE, broken, SelfSocket).catch((e) => e);
    expect(err.check).toBe('GET /health');
    expect(err.message).toBe('Smoke check failed: GET /health: expected 200 {ok:true}, got 503');
  });
});
