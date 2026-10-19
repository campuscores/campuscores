import { useMemo, useReducer } from 'react';

// Period-model scoring (football, basketball) derived purely from an ordered event log, so the same
// events replay identically on a backend. Events (all carry a player where attributed):
//   { type: 'score', side, player, value }    — goal (value 1) or basket (value 1|2|3)
//   { type: 'card', side, player, card }       — football: 'yellow' | 'red'
//   { type: 'foul', side, player }             — basketball: a personal foul
//   { type: 'sub', side, off, on }             — substitution (player names)
//   { type: 'period', index }                  — advance to period index (0-based)
// Everything else (team score, per-player points/cards/fouls, on/off, period) is derived below.

function derive(actions) {
  const score = [0, 0];
  const period = { index: 0 };
  const players = [{}, {}]; // per side: name -> { points, yellow, red, fouls, off }
  const feed = [];          // chronological event feed

  const touch = (side, name) => (players[side][name] ??= { points: 0, yellow: 0, red: 0, fouls: 0, off: false });

  for (const action of actions) {
    if (action.type === 'score') {
      score[action.side] += action.value;
      touch(action.side, action.player).points += action.value;
      feed.push({ kind: 'score', side: action.side, player: action.player, value: action.value });
    } else if (action.type === 'card') {
      const p = touch(action.side, action.player);
      if (action.card === 'yellow') {
        p.yellow += 1;
        if (p.yellow === 2) p.red += 1; // second yellow is a red
      } else {
        p.red += 1;
      }
      feed.push({ kind: 'card', side: action.side, player: action.player, card: action.card, second: action.card === 'yellow' && p.yellow === 2 });
    } else if (action.type === 'foul') {
      touch(action.side, action.player).fouls += 1;
      feed.push({ kind: 'foul', side: action.side, player: action.player });
    } else if (action.type === 'sub') {
      touch(action.side, action.off).off = true;
      touch(action.side, action.on); // ensure the incoming player exists
      feed.push({ kind: 'sub', side: action.side, off: action.off, on: action.on });
    } else if (action.type === 'period') {
      period.index = action.index;
      feed.push({ kind: 'period', index: action.index });
    }
  }

  const teamFouls = [0, 1].map(side => Object.values(players[side]).reduce((t, p) => t + p.fouls, 0));
  return { score, period: period.index, players, feed, teamFouls };
}

const reducer = (actions, event) =>
  event.type === 'undo' ? actions.slice(0, -1)
  : event.type === 'reset' ? []
  : [...actions, event];

export function usePeriodScoring(seedActions = []) {
  const [actions, dispatch] = useReducer(reducer, seedActions);
  const state = useMemo(() => derive(actions), [actions]);
  return {
    ...state,
    actionCount: actions.length,
    addScore: (side, player, value) => dispatch({ type: 'score', side, player, value }),
    addCard: (side, player, card) => dispatch({ type: 'card', side, player, card }),
    addFoul: (side, player) => dispatch({ type: 'foul', side, player }),
    addSub: (side, off, on) => dispatch({ type: 'sub', side, off, on }),
    setPeriod: index => dispatch({ type: 'period', index }),
    undo: () => dispatch({ type: 'undo' }),
  };
}

export { derive };
