import testEngine from './test-engine.js';

// Returns the engine for a sport, or null (the route answers 409 SPORT_RULES_OPEN).
export function engineFor(sport, env) {
  if (env.ENABLE_TEST_ENGINE === 'true') return testEngine;
  return null; // production engines stay blocked on doc/rules.md open items
}
