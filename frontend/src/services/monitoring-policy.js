import { sports } from '../data/sports.js';

export const STAGING_ORIGIN = 'https://thaparlympics-staging.bhatiaarnav05.workers.dev';
const PRODUCTION_ORIGIN = 'https://campuscores.live';
const SPORT_KEYS = sports.map(sport => sport.id).join('|');
const publicPath = new RegExp(`^/(?:sports/(?:${SPORT_KEYS})|tournaments(?:/[^/]+(?:/(?:${SPORT_KEYS}))?)?|privacy)?/?$`);

export function monitoringEnvironment(origin, dsn) {
  if (!/^https:\/\/[a-f0-9]+@o\d+\.ingest\.de\.sentry\.io\/\d+$/.test(dsn ?? '')) return null;
  return origin === STAGING_ORIGIN ? 'staging' : origin === PRODUCTION_ORIGIN ? 'production' : null;
}

export function routeLabel(path) {
  if (path === '/') return 'Home';
  if (path === '/privacy') return 'Privacy';
  if (path === '/tournaments' || path === '/tournaments/') return 'Tournaments';
  if (path.startsWith('/sports/')) return 'Sport';
  if (path.startsWith('/tournaments/')) return 'Tournament';
  return 'Staff';
}

// Record one public entry page only. Navigation stops recording before the next React commit.
export function replayAllowed(location) {
  return publicPath.test(location.pathname) && !location.search && !location.hash;
}

function assetUrl(value, origin) {
  try {
    const url = new URL(value, origin);
    return url.origin === origin && /^\/assets\/[\w-]+\.js$/.test(url.pathname) ? origin + url.pathname : undefined;
  } catch { return undefined; }
}

export function scrubError(event, origin) {
  const values = event.exception?.values?.slice(0, 3).map(exception => ({
    type: /^(?:Error|TypeError|RangeError|ReferenceError|SyntaxError|URIError|EvalError)$/.test(exception.type) ? exception.type : 'Error',
    value: 'Unexpected application error',
    mechanism: { type: 'generic', handled: exception.mechanism?.handled !== false },
    stacktrace: { frames: (exception.stacktrace?.frames ?? []).flatMap(frame => {
      const filename = assetUrl(frame.filename, origin);
      return filename ? [{ filename, lineno: frame.lineno, colno: frame.colno,
        function: /^[\w.$<> ]{1,100}$/.test(frame.function ?? '') ? frame.function : undefined, in_app: true }] : [];
    }) },
  }));
  if (!values?.some(value => value.stacktrace.frames.length)) return null;
  return { event_id: event.event_id, timestamp: event.timestamp, platform: 'javascript', level: 'error',
    release: event.release, environment: event.environment, exception: { values },
    debug_meta: { images: (event.debug_meta?.images ?? []).flatMap(image => {
      const code_file = assetUrl(image.code_file, origin);
      return code_file && /^[a-f0-9-]{36}$/i.test(image.debug_id ?? '') ? [{ type: 'sourcemap', code_file, debug_id: image.debug_id }] : [];
    }) },
  };
}

export function scrubSpan(span) {
  const op = span.attributes?.['sentry.op'];
  const safeOp = /^(?:pageload|navigation|http.client|resource\.(?:script|css|img|other)|ui\.(?:long-task|long-animation-frame|interaction|react.*))$/.test(op ?? '') ? op : 'browser';
  const attributes = { ...signalContext(span.attributes), 'sentry.op': safeOp };
  for (const key of ['http.response.status_code', 'http.response_content_length', 'sentry.sample_rate']) {
    if (Number.isFinite(span.attributes?.[key])) attributes[key] = span.attributes[key];
  }
  return { trace_id: span.trace_id, parent_span_id: span.parent_span_id, span_id: span.span_id,
    name: span.is_segment && ['Home', 'Privacy', 'Tournaments', 'Sport', 'Tournament', 'Staff'].includes(span.name) ? span.name : safeOp, start_timestamp: span.start_timestamp, end_timestamp: span.end_timestamp,
    status: span.status, is_segment: span.is_segment, attributes };
}

export function recoveryAttributes(summary) {
  if (!['recovered', 'paused'].includes(summary?.outcome)) return null;
  const attributes = { outcome: summary.outcome };
  for (const [key, max] of [['durationMs', 86400000], ['ageMs', 86400000], ['pending', 100000], ['retries', 10000]]) {
    if (!Number.isFinite(summary[key]) || summary[key] < 0 || summary[key] > max) return null;
    attributes[key] = summary[key];
  }
  return attributes;
}

function signalContext(attributes) {
  const safe = {};
  if (['staging', 'production'].includes(attributes?.['sentry.environment'])) safe['sentry.environment'] = attributes['sentry.environment'];
  if (/^campuscores@[a-f0-9]{40}$/.test(attributes?.['sentry.release'] ?? '')) safe['sentry.release'] = attributes['sentry.release'];
  return safe;
}

export function scrubLog(log) {
  if (log.message !== 'Scoring queue recovery') return null;
  const attributes = recoveryAttributes(log.attributes);
  return attributes ? { level: attributes.outcome === 'paused' ? 'warn' : 'info', message: 'Scoring queue recovery', attributes: { ...signalContext(log.attributes), ...attributes } } : null;
}

export function scrubMetric(metric) {
  const max = { 'campuscores.queue.drain_ms': 86400000, 'campuscores.queue.peak': 100000 }[metric.name];
  if (!max || !Number.isFinite(metric.value) || metric.value < 0 || metric.value > max || !['recovered', 'paused'].includes(metric.attributes?.outcome)) return null;
  return { name: metric.name, type: 'distribution', value: metric.value,
    unit: metric.name.endsWith('_ms') ? 'millisecond' : undefined, attributes: { ...signalContext(metric.attributes), outcome: metric.attributes.outcome } };
}

// Replay metadata bypasses beforeSend. Keep only technical IDs and the known entry URL.
export function scrubReplayEnvelope(envelope, entryUrl) {
  return [envelope[0], envelope[1].map(([header, payload]) => header.type === 'replay_event' ? [header, {
    type: 'replay_event', replay_id: payload.replay_id, segment_id: payload.segment_id,
    replay_start_timestamp: payload.replay_start_timestamp, timestamp: payload.timestamp, replay_type: payload.replay_type,
    release: payload.release, environment: payload.environment, platform: 'javascript',
    urls: [entryUrl], error_ids: [], trace_ids: [],
  }] : [header, payload])];
}
