import { exports as workerExports } from 'cloudflare:workers';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError, onError, requestId } from '../src/http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const worker = (path) => workerExports.default.fetch(`http://example.com${path}`);

// Same wiring as src/index.js, with routes that throw.
function appThrowing(err) {
  const app = new Hono();
  app.use('*', requestId);
  app.onError(onError);
  app.get('/boom', () => {
    throw err;
  });
  return app;
}

afterEach(() => vi.restoreAllMocks());

describe('foundation', () => {
  it('GET /health returns 200 { ok: true } with a request ID', async () => {
    const res = await worker('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('X-Request-Id')).toMatch(UUID);
  });

  it('unknown /api/x returns a 404 Error_Body whose requestId equals X-Request-Id', async () => {
    const res = await worker('/api/x');
    expect(res.status).toBe(404);
    const header = res.headers.get('X-Request-Id');
    expect(header).toMatch(UUID);
    expect(await res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route not found', requestId: header },
    });
    const again = await worker('/api/x');
    expect(again.headers.get('X-Request-Id')).not.toBe(header);
  });

  it('a thrown non-AppError returns 500 without its message, stack or secrets', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = new Error('SELECT secret FROM admin_accounts postgres://u:p@h/db');
    const res = await appThrowing(err).request('/boom');
    expect(res.status).toBe(500);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body).toEqual({
      error: { code: 'INTERNAL', message: 'Internal error', requestId: res.headers.get('X-Request-Id') },
    });
    for (const leak of ['SELECT', 'postgres://', err.stack]) expect(text).not.toContain(leak);

    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0][0];
    expect(Object.keys(JSON.parse(line)).sort()).toEqual(['code', 'name', 'requestId']);
    expect(line).not.toContain('SELECT');
  });

  it('an AppError keeps its status, code and message', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await appThrowing(new AppError(409, 'LEASE_HELD', 'Lease held')).request('/boom');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: { code: 'LEASE_HELD', message: 'Lease held', requestId: res.headers.get('X-Request-Id') },
    });
  });
});


it('API errors and protected replies cannot be stored in browser or shared caches', async () => {
  for (const path of ['/api/x', '/api/me']) {
    const response = await worker(path);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect([401, 404]).toContain(response.status);
  }
});
