import { afterEach, expect, it, vi } from 'vitest';
import { exportMetrics, metricQueries } from '../../scripts/export-metrics.js';
afterEach(() => vi.restoreAllMocks());
const from = '2026-10-25T00:00:00Z', to = '2026-10-26T00:00:00Z';
it('bounds the interval and weights counts and percentiles by the sampling interval', () => {
  const queries = metricQueries(from, to);
  expect(queries.groups).toContain('SUM(_sample_interval)');
  expect(queries.groups).toContain('quantileExactWeighted(0.95)(double1, _sample_interval)');
  expect(queries.groups).toContain("timestamp < toDateTime('2026-10-26 00:00:00')");
  expect(queries.fiveMinute).toContain('intDiv(toUInt32(timestamp), 300)');
  for (const [a, b] of [[from, from], [to, from], ['bad', to], ['2026-10-25T00:00:00+05:30', to], [from, '2026-10-27T00:00:00Z']]) expect(() => metricQueries(a, b)).toThrow();
});
it('exports only staging aggregates, and never copies credentials into output', async () => {
  const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data: [] })));
  const report = await exportMetrics('a'.repeat(32), 'private-token', from, to);
  expect(mock).toHaveBeenCalledTimes(2);
  expect(report).toMatchObject({ environment: 'staging', estimates: true, groups: [], fiveMinute: [] });
  expect(JSON.stringify(report)).not.toContain('private-token');
  expect(mock.mock.calls.every(([url, options]) => url.startsWith('https://api.cloudflare.com/') && options.method === 'POST' && options.body.includes('campuscores_staging_metrics'))).toBe(true);
});
it('fails clearly on missing access, HTTP errors and unexpected result shapes', async () => {
  const mock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('private service response', { status: 403 }));
  await expect(exportMetrics('a'.repeat(32), '', from, to)).rejects.toThrow('Set CLOUDFLARE');
  expect(mock).not.toHaveBeenCalled();
  await expect(exportMetrics('a'.repeat(32), 'token', from, to)).rejects.toThrow('HTTP 403');
  mock.mockResolvedValue(new Response(JSON.stringify({ success: false })));
  await expect(exportMetrics('a'.repeat(32), 'token', from, to)).rejects.toThrow('Unexpected');
});
