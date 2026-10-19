import { useMemo, useReducer } from 'react';

// Lawn tennis scoring derived purely from an ordered point log, so the same points replay
// identically on a backend. Only two action types:
//   { type: 'point', side }  — a point won by side 0|1
//   { type: 'serve', side }  — set the serving side (serve otherwise alternates each game)
// Points roll into games (0/15/30/40, deuce/advantage or no-ad), games into sets (6, win by 2,
// tiebreak at 6-6), sets into the match. Everything below is derived.
//
// format: { setsToWin, gamesPerSet, gameWinBy, advantage (bool), tiebreakAt, tiebreakTo, tiebreakWinBy }

const POINT_LABELS = ['0', '15', '30', '40'];

/** Label for a side's points within a normal (non-tiebreak) game, given both raw point counts. */
function gameScoreLabels(a, b, format) {
  if (!format.advantage) return [POINT_LABELS[Math.min(a, 3)], POINT_LABELS[Math.min(b, 3)]];
  if (a >= 3 && b >= 3) {
    if (a === b) return ['40', '40'];               // deuce
    return a > b ? ['Ad', '40'] : ['40', 'Ad'];     // advantage
  }
  return [POINT_LABELS[a], POINT_LABELS[b]];
}

/** True when raw point counts [a,b] win a normal game under `format`. */
function normalGameWon(a, b, format) {
  if (format.advantage) return a >= 4 && a - b >= 2;      // must reach 4 (game) with a 2-point lead
  return a >= 4;                                           // no-ad: first to 4 (sudden point at deuce)
}

/** True when tiebreak points [a,b] win the breaker. */
function tiebreakWon(a, b, format) {
  return a >= format.tiebreakTo && a - b >= format.tiebreakWinBy;
}

/** True when a set is decided by games [a,b] (either reach gamesPerSet win-by-2, or win the 7-6 tiebreak). */
function setDecidedBy(gamesA, gamesB) {
  // Caller decides tiebreak separately; this covers the plain 6-x win-by-2 case.
  return (gamesA >= 6 || gamesB >= 6) && Math.abs(gamesA - gamesB) >= 2;
}

/** Replay the point log into a snapshot the UI renders. */
function derive(actions, format, firstServe) {
  const sets = [];              // completed sets: { games: [a,b], winner, tiebreak?: [a,b] }
  let setGames = [0, 0];        // games in the current set
  let gamePts = [0, 0];         // raw points in the current game (or tiebreak points)
  let inTiebreak = false;
  let serve = firstServe;       // serving side; alternates each game
  const timeline = [];

  const setsNeeded = format.setsToWin;
  const wonSets = side => sets.filter(s => s.winner === side).length;
  const matchOver = () => wonSets(0) === setsNeeded || wonSets(1) === setsNeeded;

  const closeGame = winner => {
    setGames[winner] += 1;
    gamePts = [0, 0];
    serve = serve == null ? null : 1 - serve; // serve alternates each game
    timeline.push({ kind: 'game', winner, games: [...setGames] });
  };
  const closeSet = (winner, tiebreak) => {
    sets.push({ games: [...setGames], winner, ...(tiebreak ? { tiebreak } : {}) });
    timeline.push({ kind: 'set', winner, games: [...setGames] });
    setGames = [0, 0];
  };

  for (const action of actions) {
    if (matchOver()) break;
    if (action.type === 'serve') { serve = action.side; continue; }
    if (action.type !== 'point') continue;
    if (serve == null) serve = action.side; // infer first server from the first point if unset

    const s = action.side;
    gamePts[s] += 1;
    timeline.push({ kind: 'point', side: s, raw: [...gamePts], tiebreak: inTiebreak });

    if (inTiebreak) {
      if (tiebreakWon(gamePts[s], gamePts[1 - s], format)) {
        const tb = [...gamePts];
        setGames[s] += 1;                         // 7-6
        closeSet(s, tb);
        inTiebreak = false;
        gamePts = [0, 0];
        serve = serve == null ? null : 1 - serve;
      }
      continue;
    }

    if (normalGameWon(gamePts[s], gamePts[1 - s], format)) {
      closeGame(s);
      // Set decided by games?
      if (setDecidedBy(setGames[0], setGames[1])) {
        closeSet(setGames[0] > setGames[1] ? 0 : 1);
      } else if (setGames[0] === format.tiebreakAt && setGames[1] === format.tiebreakAt) {
        inTiebreak = true; // 6-6 -> tiebreak
      }
    }
  }

  const [labelA, labelB] = inTiebreak ? gamePts.map(String) : gameScoreLabels(gamePts[0], gamePts[1], format);
  const score = [wonSets(0), wonSets(1)];
  const winner = score[0] === setsNeeded ? 0 : score[1] === setsNeeded ? 1 : null;
  return {
    sets, setGames, gamePts, inTiebreak, serve, timeline, score, winner,
    gameLabels: [labelA, labelB], setNo: sets.length + 1,
  };
}

/** Would giving `side` the next point win the whole match? */
function wouldWinMatch(state, side, format) {
  // Simulate one more point by re-deriving is heavy; approximate from the live snapshot:
  const other = 1 - side;
  if (state.score[side] + 1 !== format.setsToWin) return false; // not match-deciding set anyway
  if (state.inTiebreak) {
    const a = state.gamePts[side] + 1, b = state.gamePts[other];
    return tiebreakWon(a, b, format);
  }
  const a = state.gamePts[side] + 1, b = state.gamePts[other];
  if (!normalGameWon(a, b, format)) return false;
  // Winning this game must also decide the set.
  const g = [...state.setGames];
  g[side] += 1;
  return setDecidedBy(g[0], g[1]);
}

const reducer = (actions, event) =>
  event.type === 'undo' ? actions.slice(0, -1)
  : event.type === 'reset' ? []
  : [...actions, event];

export function useTennisScoring(format, seedActions = [], firstServe = null) {
  const [actions, dispatch] = useReducer(reducer, seedActions);
  const state = useMemo(() => derive(actions, format, firstServe), [actions, format, firstServe]);
  return {
    ...state,
    actionCount: actions.length,
    point: side => dispatch({ type: 'point', side }),
    setServe: side => dispatch({ type: 'serve', side }),
    undo: () => dispatch({ type: 'undo' }),
  };
}

export { derive, wouldWinMatch, normalGameWon, tiebreakWon, gameScoreLabels };
