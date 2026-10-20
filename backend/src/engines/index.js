import testEngine from './test-engine.js';

// Returns the engine for a sport, or null (the route answers 409 SPORT_RULES_OPEN).
export function engineFor(sport, env) {
  if (env.ENABLE_TEST_ENGINE === 'true') return testEngine;
  return null; // legacy matches without a frozen real format cannot score in production
}
