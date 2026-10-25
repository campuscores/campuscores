import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const DATASET = 'campuscores_staging_metrics';
export function metricQueries(from, to) {
  const utc = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value);
  if (!utc(from) || !utc(to)) throw Error('Use UTC timestamps such as 2026-10-25T00:00:00Z');
  const start = new Date(from), end = new Date(to);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start || end - start > 86400000) throw Error('Use an explicit UTC interval of at most 24 hours');
  const sqlTime = date => date.toISOString().slice(0, 19).replace('T', ' ');
  const where = "timestamp >= toDateTime('" + sqlTime(start) + "') AND timestamp < toDateTime('" + sqlTime(end) + "') AND blob8 = 'v1'";
  return {
    groups: 'SELECT blob1 AS event, blob2 AS route, blob3 AS outcome, blob4 AS action, blob5 AS room, blob6 AS code, blob7 AS method, double8 AS status, '
      + 'SUM(_sample_interval) AS estimated_events, SUM(double1 * _sample_interval) / SUM(_sample_interval) AS avg_ms, '
      + 'quantileExactWeighted(0.95)(double1, _sample_interval) AS p95_ms, quantileExactWeighted(0.99)(double1, _sample_interval) AS p99_ms, '
      + 'SUM(double2 * _sample_interval) AS estimated_socket_attempts_or_sweep_deliveries, SUM(double3 * _sample_interval) AS estimated_payload_bytes, '
      + 'MAX(double4) AS max_observed_pending, quantileExactWeighted(0.95)(double5, _sample_interval) AS p95_age_ms, '
      + 'SUM(double6 * _sample_interval) AS estimated_failures, SUM(double7 * _sample_interval) AS estimated_retries '
      + 'FROM ' + DATASET + ' WHERE ' + where + ' GROUP BY event, route, outcome, action, room, code, method, status ORDER BY event, route, outcome LIMIT 10000 FORMAT JSON',
    fiveMinute: 'SELECT intDiv(toUInt32(timestamp), 300) * 300 AS interval_start_utc, blob1 AS event, SUM(_sample_interval) AS estimated_events '
      + 'FROM ' + DATASET + ' WHERE ' + where + ' GROUP BY interval_start_utc, event ORDER BY interval_start_utc, event LIMIT 10000 FORMAT JSON',
  };
}

export async function exportMetrics(accountId, token, from, to) {
  if (!/^[a-f0-9]{32}$/i.test(accountId ?? '') || !token) throw Error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_ANALYTICS_READ_TOKEN locally');
  const queries = metricQueries(from, to);
  const report = { environment: 'staging', dataset: DATASET, from: new Date(from).toISOString(), to: new Date(to).toISOString(), generatedAt: new Date().toISOString(), estimates: true };
  for (const [name, sql] of Object.entries(queries)) {
    const res = await fetch('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/analytics_engine/sql', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'text/plain' }, body: sql, signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw Error('Analytics query failed with HTTP ' + res.status + '; check account read access and dataset ingestion');
    const result = await res.json();
    if (!Array.isArray(result.data) || result.data.length >= 10000) throw Error('Unexpected or truncated analytics result');
    report[name] = result.data;
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [from, to] = process.argv.slice(2);
    console.log(JSON.stringify(await exportMetrics(process.env.CLOUDFLARE_ACCOUNT_ID, process.env.CLOUDFLARE_ANALYTICS_READ_TOKEN, from, to), null, 2));
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
