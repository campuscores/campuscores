import { test, expect } from '@playwright/test';
import { recoveryObserver, startRum } from '../src/services/telemetry.js';
const state = (change = {}) => ({ online: true, pending: 0, attempt: 0, paused: null, takingOver: false, ...change });

test('ordinary scoring does not become an outage measurement', () => {
  const observe = recoveryObserver();
  for (const pending of [0, 1, 0, 2, 0]) expect(observe(state({ pending }))).toBeNull();
});
test('one offline episode reports peak queue and drain time after reconnection, without scoring details', () => {
  const observe = recoveryObserver();
  expect(observe(state(), 0)).toBeNull();
  expect(observe(state({ online: false, pending: 1 }), 100)).toBeNull();
  expect(observe(state({ online: false, pending: 3 }), 500)).toBeNull();
  expect(observe(state({ pending: 3 }), 1000)).toBeNull();
  expect(observe(state({ pending: 2, attempt: 1 }), 1100)).toBeNull();
  expect(observe(state({ pending: 1, attempt: 0 }), 1200)).toBeNull();
  expect(observe(state({ pending: 1, attempt: 1 }), 1300)).toBeNull();
  expect(observe(state(), 1500)).toEqual({ outcome: 'recovered', durationMs: 500, ageMs: 1400, pending: 3, retries: 2 });
  expect(observe(state(), 1600)).toBeNull();
});
test('a retry while the browser says online still records recovery; restored queues start a new page-local observation', () => {
  const retry = recoveryObserver(); retry(state(), 0);
  retry(state({ pending: 1, attempt: 1 }), 100);
  expect(retry(state(), 400)).toEqual({ outcome: 'recovered', durationMs: 300, ageMs: 300, pending: 1, retries: 1 });
  const restored = recoveryObserver(); restored(state({ pending: 2 }), 500);
  expect(restored(state(), 900)).toMatchObject({ durationMs: 400, ageMs: 400, pending: 2 });
});
test('another disconnect resets the reconnect drain clock and a paused queue is not reported as recovered', () => {
  const observe = recoveryObserver(); observe(state(), 0);
  observe(state({ online: false, pending: 2 }), 10); observe(state({ pending: 2 }), 100);
  observe(state({ online: false, pending: 2 }), 200); observe(state({ pending: 2 }), 400);
  expect(observe(state({ pending: 2, paused: 'SCORING_LOCKED' }), 500)).toEqual({ outcome: 'paused', durationMs: 100, ageMs: 490, pending: 2, retries: 0 });
  expect(observe(state({ pending: 2, paused: 'SCORING_LOCKED' }), 800)).toBeNull();
});
test('takeover discards the measurement along with unsent actions and never claims recovery', () => {
  const observe = recoveryObserver(); observe(state({ online: false, pending: 3 }), 10);
  expect(observe(state({ pending: 3, takingOver: true }), 100)).toBeNull();
  expect(observe(state({ pending: 0, takingOver: true }), 110)).toBeNull();
  expect(observe(state(), 120)).toBeNull();
});

function fakeDocument() {
  const scripts = [];
  return { scripts, querySelector: () => scripts[0], createElement: () => ({ setAttribute(key, value) { this[key] = value; } }), head: { append: script => scripts.push(script) } };
}
const token = 'a'.repeat(32);
const staging = 'https://thaparlympics-staging.bhatiaarnav05.workers.dev';
test('a public staging token creates one deferred beacon and never duplicates automatic injection', () => {
  const doc = fakeDocument(); startRum(token, staging, doc); startRum(token, staging, doc);
  expect(doc.scripts).toHaveLength(1);
  expect(doc.scripts[0]).toMatchObject({ src: 'https://static.cloudflareinsights.com/beacon.min.js', defer: true, 'data-cf-beacon': JSON.stringify({ token }) });
});
test('production, local previews, missing and invalid tokens never install a staging beacon', () => {
  for (const [origin, key] of [['https://campuscores.live', token], ['http://127.0.0.1:4176', token], [staging, undefined], [staging, 'private-api-token']]) {
    const doc = fakeDocument(); startRum(key, origin, doc); expect(doc.scripts).toHaveLength(0);
  }
});
test('a blocked beacon cannot break application startup', () => {
  const doc = fakeDocument(); doc.head.append = () => { throw Error('blocked'); };
  expect(() => startRum(token, staging, doc)).not.toThrow();
});
