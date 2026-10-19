// Turn a badminton fixture match into a starting action log, so "Continue scoring" opens a live
// match at its current score and "Start scoring" opens a scheduled match at 0-0. A real backend
// would instead return the accepted action log (or a snapshot) for the match; this seeder stands in
// until then and keeps the hook's input shape identical to what the backend will provide.

/** Build point actions that reproduce a completed game's final points for `winner`. */
function gameActions(points, winner) {
  const loser = 1 - winner;
  const actions = [];
  // Interleave points so neither side's running total can prematurely trip the game-won check
  // before the real final score; a simple alternation up to each side's total is enough for display.
  const [lead, trail] = [points[winner], points[loser]];
  for (let i = 0; i < Math.max(lead, trail); i++) {
    if (i < trail) actions.push({ type: 'point', side: loser });
    if (i < lead - 1 || (i === lead - 1 && i >= trail)) actions.push({ type: 'point', side: winner });
  }
  // Ensure the winner has exactly `lead` points and takes the final rally.
  const have = actions.filter(a => a.side === winner).length;
  for (let i = have; i < lead; i++) actions.push({ type: 'point', side: winner });
  return actions;
}

/** Win one normal game for `side`: 4 straight points closes a game in the tennis engine. */
function winGame(side) {
  return Array.from({ length: 4 }, () => ({ type: 'point', side }));
}

/**
 * Seed tennis point actions from a fixture match's set list so a live match opens at its games/sets.
 * Each fixture period is a set: { points:[gamesA,gamesB], winner, tiebreak?:[a,b], current? }.
 * Completed set: play the loser's games, then the winner's games (last game to 6-x), or 6-6 + the
 * tiebreak for a 7-6 set. Current set: play each side's games, then the live game points if present.
 * This reproduces the displayed games/sets; it is display seed data, not a real point history.
 */
export function seedTennisFromMatch(match) {
  if (!match?.periods) return [];
  const actions = [];
  const pointLabelToCount = { '0': 0, '15': 1, '30': 2, '40': 3, 'Ad': 4 };
  for (const set of match.periods) {
    if (!set) continue;
    const [ga, gb] = set.points;
    if (set.current) {
      // Play completed games of the in-progress set (alternating is irrelevant to games count).
      for (let i = 0; i < gb; i++) actions.push(...winGame(1));
      for (let i = 0; i < ga; i++) actions.push(...winGame(0));
      // Then the live within-game points, if the fixture carries them (not a tiebreak-only shape).
      if (match.gamePoints && !(ga === 6 && gb === 6)) {
        const a = pointLabelToCount[match.gamePoints[0]] ?? 0;
        const b = pointLabelToCount[match.gamePoints[1]] ?? 0;
        for (let i = 0; i < b; i++) actions.push({ type: 'point', side: 1 });
        for (let i = 0; i < a; i++) actions.push({ type: 'point', side: 0 });
      }
      continue;
    }
    // Completed set.
    const winner = set.winner;
    const loser = 1 - winner;
    if (set.tiebreak) {
      // 6-6 then the tiebreak points to the set winner.
      for (let i = 0; i < 6; i++) { actions.push(...winGame(0)); actions.push(...winGame(1)); }
      const [ta, tb] = set.tiebreak;
      for (let i = 0; i < tb; i++) actions.push({ type: 'point', side: 1 });
      for (let i = 0; i < ta; i++) actions.push({ type: 'point', side: 0 });
    } else {
      const loserGames = set.points[loser];
      for (let i = 0; i < loserGames; i++) actions.push(...winGame(loser));
      const winnerGames = set.points[winner];
      for (let i = 0; i < winnerGames; i++) actions.push(...winGame(winner));
    }
  }
  return actions;
}

/** Seed actions from a fixture match's completed + current periods. */
export function seedFromMatch(match) {
  if (!match?.periods) return [];
  const actions = [];
  for (const period of match.periods) {
    if (!period) continue;
    if (period.current) {
      // Replay the in-progress game's points so the current game opens at its live score.
      const [a, b] = period.points;
      for (let i = 0; i < Math.max(a, b); i++) {
        if (i < b) actions.push({ type: 'point', side: 1 });
        if (i < a) actions.push({ type: 'point', side: 0 });
      }
    } else if (period.winner != null) {
      actions.push(...gameActions(period.points, period.winner));
    }
  }
  return actions;
}
