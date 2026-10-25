import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { AppError, onError, reportError, requestId } from '../src/http.js';
import { measureRequest, metric } from '../src/metrics.js';
import { parseRecovery } from '../src/routes/telemetry.js';
import { api, one, testCtx } from './helpers.js';

const bindings = () => ({ STAGING_OBSERVABILITY: 'true', APP_METRICS: { writeDataPoint: vi.fn() } });
const recovery = { outcome: 'recovered', durationMs: 240, ageMs: 1500, pending: 3, retries: 2 };
afterEach(() => vi.restoreAllMocks());

it('uses only the staging dataset and allowlisted fields, even when a binding fails', () => {
  const e = bindings();
  metric({ APP_METRICS: e.APP_METRICS }, 'http');
  expect(e.APP_METRICS.writeDataPoint).not.toHaveBeenCalled();
  metric(e, 'http', { route: '/api/matches/:id/actions', action: 'Bearer secret', code: 'INVALID', method: 'POST', durationMs: -1, bytes: Infinity, token: 'secret', payload: { email: 'secret@example.test' } });
  const point = e.APP_METRICS.writeDataPoint.mock.calls[0][0];
  expect(point.blobs).toEqual(['http', '/api/matches/:id/actions', '', '', '', 'INVALID', 'POST', 'v1']);
  expect(point.doubles).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  expect(JSON.stringify(point)).not.toMatch(/secret|Bearer|email|payload/);
  e.APP_METRICS.writeDataPoint.mockImplementation(() => { throw Error('sink unavailable'); });
  expect(() => metric(e, 'http')).not.toThrow();
});

it('reports a safe Error and useful origin frames without copying multiline messages, causes or names', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const err = new Error('SELECT secret postgres://u:p@host/db', { cause: { password: 'private' } });
  err.name = 'Bearer stolen';
  err.stack = 'Bearer stolen: secret\nSELECT private\n    at query (https://secret.test/routes/actions.js:88:9)\n    at token (https://secret.test/index.js?token=private:1:2)';
  reportError(bindings(), err, { code: 'INTERNAL', requestId: 'public-request-id', matchId: 'private-match', seq: 9 });
  expect(log).toHaveBeenCalledTimes(1);
  const [safe, metadata] = log.mock.calls[0];
  expect(safe).toBeInstanceOf(Error);
  expect(safe.stack).toBe('Error: INTERNAL\n    at actions.js:88:9');
  expect(metadata).toEqual({ code: 'INTERNAL', requestId: 'public-request-id' });
  expect(safe).not.toHaveProperty('cause');
  expect(JSON.stringify([safe.stack, metadata])).not.toMatch(/SELECT|secret|private|Bearer|password/);
});

it.each([new Error('Bearer private'), 'postgres://private'])('keeps the original 500 response and route grouping if telemetry throws (%s)', async err => {
  const e = bindings();
  e.APP_METRICS.writeDataPoint.mockImplementation(() => { throw Error('sink down'); });
  vi.spyOn(console, 'error').mockImplementation(() => { throw Error('logger down'); });
  const app = new Hono();
  app.use('*', measureRequest); app.use('*', requestId); app.onError(onError);
  app.get('/matches/:id', () => { throw err; });
  const res = await app.request('/matches/9284?token=private', {}, e);
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: { code: 'INTERNAL', message: 'Internal error', requestId: res.headers.get('X-Request-Id') } });
  const point = e.APP_METRICS.writeDataPoint.mock.calls[0][0];
  expect(point.blobs).toEqual(['http', '/matches/:id', 'rejected', '', '', 'INTERNAL', 'GET', 'v1']);
  expect(point.doubles[7]).toBe(500);
  expect(JSON.stringify(point)).not.toMatch(/9284|private/);
});

it('returns 500 if even reading an unexpected error stack fails', async () => {
  const err = new Error('private message');
  Object.defineProperty(err, 'stack', { get() { throw Error('unsafe stack getter'); } });
  const app = new Hono(); app.use('*', requestId); app.onError(onError);
  app.get('/boom', () => { throw err; });
  const response = await app.request('/boom', {}, bindings());
  expect(response.status).toBe(500);
  expect((await response.json()).error.message).toBe('Internal error');
});

it('counts expected 4xx responses without generating staging log lines or Issues', async () => {
  const e = bindings();
  const info = vi.spyOn(console, 'log').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const app = new Hono();
  app.use('*', measureRequest); app.use('*', requestId); app.onError(onError);
  app.get('/lease', () => { throw new AppError(409, 'LEASE_HELD', 'Lease held'); });
  expect((await app.request('/lease', {}, e)).status).toBe(409);
  expect(info).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  expect(e.APP_METRICS.writeDataPoint.mock.calls[0][0].doubles[7]).toBe(409);
});

it('does not activate recovery ingestion in production, even for a valid-looking body', async () => {
  const e = bindings(); delete e.STAGING_OBSERVABILITY;
  const res = await worker.fetch(new Request('https://example.com/api/operator/metrics', { method: 'POST', body: JSON.stringify(recovery) }), e, testCtx());
  expect(res.status).toBe(404);
  expect(e.APP_METRICS.writeDataPoint).not.toHaveBeenCalled();
});

it('rejects an anonymous recovery request and limits its body before auth', async () => {
  const e = bindings();
  expect((await api('POST', '/api/operator/metrics', { env: e, body: recovery })).status).toBe(401);
  expect((await api('POST', '/api/operator/metrics', { env: e, body: { data: 'a'.repeat(1025) } })).status).toBe(413);
  expect(e.APP_METRICS.writeDataPoint.mock.calls.filter(([p]) => p.blobs[0] === 'recovery')).toHaveLength(0);
});

it.each([{ ...recovery, pending: 0 }, { ...recovery, retries: 1.5 }, { ...recovery, durationMs: -1 }, { ...recovery, durationMs: 1600 }, { ...recovery, durationMs: Infinity }, { ...recovery, ageMs: 86400001 }, { ...recovery, outcome: 'won' }, { ...recovery, matchId: 7 }, { ...recovery, token: 'secret' }, {}])('rejects an invalid recovery summary %j', body => {
  expect(() => parseRecovery(body)).toThrow(expect.objectContaining({ status: 400 }));
});

it('instruments one broadcast, survives a failed recipient and a failed metric sink, and keeps deduplication', async () => {
  const stub = env.ROOMS.get(env.ROOMS.idFromName('match:8810001'));
  await runInDurableObject(stub, async instance => {
    const previous = instance.env;
    const e = bindings();
    const receiver = { send: vi.fn() };
    instance.env = e;
    const sockets = vi.spyOn(instance.ctx, 'getWebSockets').mockReturnValue([{ send() { throw Error('closed'); } }, receiver]);
    try {
      const snapshot = { matchId: 8810001, sides: [{ name: '秘密', points: 1 }, { name: 'B', points: 0 }] };
      expect(await instance.publish(snapshot, 1)).toBe(true);
      expect(receiver.send).toHaveBeenCalledTimes(1);
      const point = e.APP_METRICS.writeDataPoint.mock.calls[0][0];
      expect(point.blobs[4]).toBe('match'); expect(point.doubles[1]).toBe(2); expect(point.doubles[5]).toBe(1);
      expect(point.doubles[2]).toBe(new TextEncoder().encode(receiver.send.mock.calls[0][0]).byteLength);
      expect(JSON.stringify(point)).not.toMatch(/秘密|8810001/);
      expect(await instance.publish(snapshot, 1)).toBe(false);
      expect(e.APP_METRICS.writeDataPoint).toHaveBeenCalledTimes(1);
      e.APP_METRICS.writeDataPoint.mockImplementation(() => { throw Error('sink down'); });
      expect(await instance.publish(snapshot, 2)).toBe(true);
      expect(receiver.send).toHaveBeenCalledTimes(2);
    } finally { sockets.mockRestore(); instance.env = previous; }
  });
});

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('recovery staff authorization against Postgres', () => {
  it.each(['test_match_operator', 'test_tournament_manager', 'test_super_admin'])('accepts one bounded summary from active staff %s', async user => {
    const e = bindings();
    expect((await api('POST', '/api/operator/metrics', { user, env: e, body: recovery })).status).toBe(204);
    const points = e.APP_METRICS.writeDataPoint.mock.calls.map(([p]) => p).filter(p => p.blobs[0] === 'recovery');
    expect(points).toHaveLength(1);
    expect(points[0].doubles).toEqual([240, 0, 0, 3, 1500, 0, 2, 0]);
    expect(JSON.stringify(points)).not.toContain(user);
  });
  it('rejects a signed-in non-staff account and a disabled staff account', async () => {
    expect((await api('POST', '/api/operator/metrics', { user: 'test_no_staff', env: bindings(), body: recovery })).status).toBe(403);
    const user = 'test_metrics_disabled_' + crypto.randomUUID();
    const { id } = await one("INSERT INTO admin_accounts (clerk_user_id, role, status) VALUES ($1, 'MATCH_OPERATOR', 'DISABLED') RETURNING id", [user]);
    try { expect((await api('POST', '/api/operator/metrics', { user, env: bindings(), body: recovery })).status).toBe(403); }
    finally { await one('DELETE FROM admin_accounts WHERE id=$1 RETURNING id', [id]); }
  });
  it('keeps authenticated ingestion successful if Analytics Engine is unavailable', async () => {
    const e = bindings(); e.APP_METRICS.writeDataPoint.mockImplementation(() => { throw Error('sink down'); });
    expect((await api('POST', '/api/operator/metrics', { user: 'test_match_operator', env: e, body: recovery })).status).toBe(204);
    expect((await api('POST', '/api/operator/metrics', { user: 'test_match_operator', env: e, body: { ...recovery, email: 'private' } })).status).toBe(400);
  });
});
