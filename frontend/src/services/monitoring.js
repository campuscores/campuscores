import { monitoringEnvironment, replayAllowed, routeLabel, scrubError, scrubSpan, scrubLog, scrubMetric,
  recoveryAttributes, scrubReplayEnvelope } from './monitoring-policy.js';

let sdk, ready;
const earlyErrors = [];
const dsn = import.meta.env?.VITE_SENTRY_DSN;
const origin = globalThis.location?.origin;
const environment = monitoringEnvironment(origin, dsn);

export function captureReactError(error, info) {
  if (!environment) return;
  if (sdk) sdk.captureReactException(error, info);
  else if (earlyErrors.length < 5) earlyErrors.push([error, info]);
}

export function startMonitoring(router) {
  if (!environment || ready) return;
  ready = import('@sentry/react').then(Sentry => {
    const entry = window.location;
    const recordReplay = environment === 'staging' && replayAllowed(entry);
    const entryUrl = entry.origin + entry.pathname;
    const integrations = [Sentry.browserTracingIntegration({
      beforeStartSpan: options => ({ ...options, name: routeLabel(window.location.pathname) }),
    })];
    if (recordReplay) integrations.push(Sentry.replayIntegration({
      maskAllText: true, maskAllInputs: true, blockAllMedia: true,
      block: ['a', 'area', '.staff', '[class*="cl-"]', 'form', 'input', 'textarea', 'select'],
      maskAttributes: ['title', 'placeholder', 'aria-label', 'href', 'src', 'value', 'data-id'],
      networkCaptureBodies: false, networkDetailAllowUrls: [],
      networkRequestHeaders: [], networkResponseHeaders: [],
      beforeAddRecordingEvent: () => null,
      maxReplayDuration: 60000,
    }));
    Sentry.init({
      dsn, environment, release: import.meta.env.VITE_SENTRY_RELEASE,
      sendDefaultPii: false, sendClientReports: false, autoSessionTracking: false,
      enableLogs: environment === 'staging',
      tracesSampleRate: environment === 'staging' ? 0.1 : 0.01,
      tracePropagationTargets: [], replaysSessionSampleRate: recordReplay ? 0.01 : 0,
      replaysOnErrorSampleRate: 0,
      integrations: defaults => [...defaults.filter(integration => !['Breadcrumbs', 'BrowserSession'].includes(integration.name)), ...integrations],
      beforeSend: event => scrubError(event, origin), beforeSendSpan: scrubSpan,
      beforeSendLog: scrubLog, beforeSendMetric: scrubMetric,
      transport: options => {
        const transport = Sentry.makeFetchTransport(options);
        return { flush: timeout => transport.flush(timeout), send: envelope => transport.send(scrubReplayEnvelope(envelope, entryUrl)) };
      },
    });
    sdk = Sentry;
    if (recordReplay) {
      const key = router.state.location.key;
      const unsubscribe = router.subscribe(state => {
        if (state.location.key !== key) {
          // Stop synchronously; discard the pending segment before any private screen renders.
          Sentry.getReplay()?.stop({ flush: false }).catch(() => {});
          unsubscribe();
        }
      });
    }
    for (const [error, info] of earlyErrors.splice(0)) Sentry.captureReactException(error, info);
  }).catch(() => { earlyErrors.length = 0; });
}

export function recordRecovery(summary) {
  if (!sdk || environment !== 'staging') return;
  const attributes = recoveryAttributes(summary);
  if (!attributes) return;
  try {
    sdk.logger[attributes.outcome === 'paused' ? 'warn' : 'info']('Scoring queue recovery', attributes);
    sdk.metrics.distribution('campuscores.queue.drain_ms', attributes.durationMs, { unit: 'millisecond', attributes: { outcome: attributes.outcome } });
    sdk.metrics.distribution('campuscores.queue.peak', attributes.pending, { attributes: { outcome: attributes.outcome } });
  } catch { /* Diagnostics must not affect scoring or synchronization. */ }
}
