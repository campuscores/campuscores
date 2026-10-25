import { apiFetch } from './api.js';

export const telemetryEnabled = import.meta.env?.VITE_APP_OBSERVABILITY === 'true';
const STAGING = 'https://thaparlympics-staging.bhatiaarnav05.workers.dev';

// A separate public token is required; never attach the production beacon to staging.
export function startRum(token, origin, doc) {
  if (origin !== STAGING || !/^[a-f0-9]{32}$/i.test(token ?? '') || doc.querySelector('script[src*="cloudflareinsights.com/beacon"]')) return;
  try {
    const script = doc.createElement('script');
    script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    script.defer = true;
    script.setAttribute('data-cf-beacon', JSON.stringify({ token }));
    doc.head.append(script);
  } catch { /* A blocked beacon must not affect the app. */ }
}

// shortcut: page-local observations; use fault tests for recovery across page closure or reload.
export function recoveryObserver() {
  let first = true, episode = null, wasOnline = true, lastAttempt = 0, wasPaused = false;
  return ({ online, pending, attempt, paused, takingOver }, now = performance.now()) => {
    let summary = null;
    if (takingOver) episode = null;
    else {
      if (!episode && pending > 0 && !(paused && wasPaused) && (first || !online || attempt > 0 || paused)) {
        episode = { at: now, onlineAt: online ? now : null, peak: pending, retries: 0 };
      }
      if (episode) {
        episode.peak = Math.max(episode.peak, pending);
        episode.retries += Math.max(0, attempt - lastAttempt);
        if (online && !wasOnline) episode.onlineAt = now;
        if (paused || (online && pending === 0)) {
          summary = { outcome: paused ? 'paused' : 'recovered', durationMs: Math.min(86400000, Math.max(0, now - (episode.onlineAt ?? now))),
            ageMs: Math.min(86400000, Math.max(0, now - episode.at)), pending: Math.min(100000, episode.peak), retries: Math.min(10000, episode.retries) };
          episode = null;
        }
      }
    }
    first = false;
    wasOnline = online;
    wasPaused = Boolean(paused);
    lastAttempt = attempt;
    return summary;
  };
}

export function reportRecovery(summary, getToken) {
  if (!telemetryEnabled) return;
  Promise.resolve().then(getToken).then(token => apiFetch('/operator/metrics', { method: 'POST', token, body: summary })).catch(() => {});
}
