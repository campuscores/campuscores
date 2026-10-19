import { useMemo, useReducer } from 'react';
import { maxGames, targetFor } from './scoringConfig.js';

// Set-model scoring (badminton, table tennis) derived purely from an ordered action log, so the
// same actions replay identically on a backend. Actions:
//   { type: 'point', side }          — a rally won by side 0|1
//   { type: 'finishGame', winner }   — scorer ends the current game for winner 0|1 (walkover/DQ etc.)
//   { type: 'serve', side }          — set the serving side (first serve, or manual override)
// Everything else (points, games won, current game, serve, match winner) is derived below.

/**
 * True when `[a, b]` game points already decide a game under `format`.
 * `gameIndex` (0-based) picks the target so a deciding set can use a lower one (volleyball 15).
 */
function gameWon(a, b, format, gameIndex = 0) {
  const target = targetFor(format, gameIndex);
  const hi = Math.max(a, b), lo = Math.min(a, b);
  if (format.cap && hi >= format.cap) return hi > lo; // at the cap, any 1-point lead wins
  return hi >= target && hi - lo >= format.winBy;
}

/**
 * Serving side for the 'alternate' model (table tennis): the first server holds for `serveEvery`
 * points, then it swaps; at deuce (both at pointsPerGame-1) serve swaps every single point.
 * `firstServer` is who served the game's first point. Returns 0|1.
 */
function alternateServer(a, b, format, firstServer) {
  const played = a + b;
  const deuce = a >= format.pointsPerGame - 1 && b >= format.pointsPerGame - 1;
  const swaps = deuce
    ? Math.floor(2 * (format.pointsPerGame - 1) / format.serveEvery) + (played - 2 * (format.pointsPerGame - 1))
    : Math.floor(played / format.serveEvery);
  return (firstServer + swaps) % 2;
}

/** Replay the action log into a snapshot the UI renders. */
function derive(actions, format, firstServe) {
  const games = [];            // completed games: { points: [a, b], winner }
  let cur = [0, 0];            // current game points
  let chosen = firstServe;     // the serving side chosen before the current game's first point
  let lastWinner = null;       // last rally winner (for the 'rally' serve model)
  const timeline = [];         // human-readable recent events, newest last

  const gamesNeeded = format.gamesToWin;
  const wonCount = side => games.filter(g => g.winner === side).length;
  const matchOver = () => wonCount(0) === gamesNeeded || wonCount(1) === gamesNeeded;

  for (const action of actions) {
    if (matchOver()) break; // ignore anything after the match is decided
    if (action.type === 'serve') { chosen = action.side; continue; }
    if (action.type === 'point') {
      if (games.length >= maxGames(format)) continue;
      if (chosen == null) chosen = action.side; // no explicit first serve: infer from the first point
      cur[action.side] += 1;
      lastWinner = action.side;
      timeline.push({ kind: 'point', side: action.side, score: [...cur] });
      if (gameWon(cur[0], cur[1], format, games.length)) {
        games.push({ points: [...cur], winner: cur[0] > cur[1] ? 0 : 1 });
        timeline.push({ kind: 'game', winner: cur[0] > cur[1] ? 0 : 1, score: [...cur] });
        cur = [0, 0];
        chosen = null; // next game's first server is chosen/inferred again
        lastWinner = null;
      }
    } else if (action.type === 'finishGame') {
      games.push({ points: [...cur], winner: action.winner, manual: true });
      timeline.push({ kind: 'game', winner: action.winner, score: [...cur], manual: true });
      cur = [0, 0];
      chosen = null;
      lastWinner = null;
    }
  }

  // Serving side: rally model follows the last point winner; alternate model computes from counts.
  let serve;
  if (format.serveModel === 'alternate') {
    serve = chosen == null ? null : alternateServer(cur[0], cur[1], format, chosen);
  } else {
    serve = lastWinner != null ? lastWinner : chosen;
  }

  const score = [wonCount(0), wonCount(1)];
  const winner = score[0] === gamesNeeded ? 0 : score[1] === gamesNeeded ? 1 : null;
  return { games, current: cur, serve, timeline, score, winner, gameNo: games.length + 1 };
}

/**
 * Would giving `side` the next point win the whole match? Pure prediction from a snapshot:
 * the point must both win the current game and give `side` its deciding game.
 */
function wouldWinMatch(state, side, format) {
  const next = [...state.current];
  next[side] += 1;
  if (!gameWon(next[0], next[1], format, state.games.length)) return false;
  return state.score[side] + 1 === format.gamesToWin;
}

const reducer = (actions, event) =>
  event.type === 'undo' ? actions.slice(0, -1)
  : event.type === 'reset' ? []
  : [...actions, event];

/**
 * @param {object} format set-model format from scoringConfig
 * @param {Array} seedActions optional actions to preload (fixture seed or backend snapshot)
 * @param {number|null} firstServe serving side chosen before the first point
 */
export function useSetScoring(format, seedActions = [], firstServe = null) {
  const [actions, dispatch] = useReducer(reducer, seedActions);
  const state = useMemo(() => derive(actions, format, firstServe), [actions, format, firstServe]);
  return {
    ...state,
    actionCount: actions.length,
    point: side => dispatch({ type: 'point', side }),
    finishGame: winner => dispatch({ type: 'finishGame', winner }),
    setServe: side => dispatch({ type: 'serve', side }),
    undo: () => dispatch({ type: 'undo' }),
  };
}

export { gameWon, derive, wouldWinMatch, alternateServer };
