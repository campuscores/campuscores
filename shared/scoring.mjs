// One pure scoring model for server acceptance and the operator's pending projection.
export const RULE_SOURCES = {
  badminton: ['BWF 2025 · valid until 3 January 2027', 'https://corporate.bwfbadminton.com/statutes/'],
  'table-tennis': ['ITTF 2026 · best of an odd number of games', 'https://www.ittf.com/statutes/'],
  volleyball: ['FIVB 2025–2028', 'https://www.fivb.com/volleyball/the-game/official-volleyball-rules/'],
  'lawn-tennis': ['ITF 2026 · tie-break sets', 'https://www.itftennis.com/en/about-us/governance/rules-and-regulations/'],
  football: ['IFAB 2026/27 · team goals', 'https://www.theifab.com/laws/latest/'],
  basketball: ['FIBA 2026 · team points', 'https://refereeing.fiba.basketball/en/rules'],
};
export const DEFAULT_FORMATS = {
  badminton: { model: 'sets', bestOf: 3, target: 21, winBy: 2, cap: 30, decidingTarget: 21, firstServe: 0 },
  'table-tennis': { model: 'sets', bestOf: 5, target: 11, winBy: 2, cap: null, decidingTarget: 11, firstServe: 0 },
  volleyball: { model: 'sets', bestOf: 5, target: 25, winBy: 2, cap: null, decidingTarget: 15, firstServe: 0 },
  'lawn-tennis': { model: 'tennis', bestOf: 3, gamesPerSet: 6, gameWinBy: 2, advantage: true, tiebreakAt: 6, tiebreakTo: 7, tiebreakWinBy: 2, firstServe: 0 },
  football: { model: 'periods', periodCount: 2, scoreValues: [1] },
  basketball: { model: 'periods', periodCount: 4, scoreValues: [1, 2, 3] },
};
const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
const integer = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const side = v => v === 0 || v === 1;
const object = v => v && typeof v === 'object' && !Array.isArray(v);
export function validateFormat(sport, input) {
  const base = DEFAULT_FORMATS[sport];
  requireValue(base && object(input), 'Choose a supported sport format.');
  requireValue(Object.keys(input).every(k => Object.hasOwn(base, k)), 'Unknown format field.');
  const f = { ...base, ...input };
  requireValue(f.model === base.model, 'The scoring model cannot change.');
  if (f.model === 'periods') {
    requireValue(integer(f.periodCount, 1, 12), 'Choose 1 to 12 periods.');
    requireValue(Array.isArray(f.scoreValues) && f.scoreValues.length > 0 && f.scoreValues.length <= 3 && f.scoreValues.every(v => integer(v, 1, 100)) && new Set(f.scoreValues).size === f.scoreValues.length, 'Choose one to three different scoring values from 1 to 100.');
    if (sport === 'football') requireValue(f.scoreValues.length === 1 && f.scoreValues[0] === 1, 'A football goal counts once.');
    f.scoreValues = [...f.scoreValues];
  } else {
    requireValue(integer(f.bestOf, 1, 15) && f.bestOf % 2 === 1, 'Best of must be an odd number from 1 to 15.');
    requireValue(side(f.firstServe), 'Choose the first serving side.');
    if (f.model === 'sets') {
      requireValue(integer(f.target, 1, 999) && integer(f.decidingTarget, 1, 999), 'Point targets must be from 1 to 999.');
      requireValue(integer(f.winBy, 1, 10), 'Winning margin must be from 1 to 10.');
      requireValue(f.cap === null || (integer(f.cap, Math.max(f.target, f.decidingTarget), 9999)), 'Golden point must be at or above both point targets.');
    } else {
      requireValue(integer(f.gamesPerSet, 1, 20) && integer(f.gameWinBy, 1, 2), 'Choose a valid set length and game margin.');
      requireValue(typeof f.advantage === 'boolean', 'Choose advantage or no-ad games.');
      requireValue(f.tiebreakAt === null || integer(f.tiebreakAt, Math.max(1, f.gamesPerSet - 1), 30), 'Tie-break starts too early for this set length.');
      requireValue(integer(f.tiebreakTo, 1, 99) && integer(f.tiebreakWinBy, 1, 10), 'Choose a valid tie-break target and margin.');
    }
  }
  return f;
}
export const pointTarget = (format, index) => index === format.bestOf - 1 ? format.decidingTarget : format.target;
export const winsPoints = (a, b, target, margin, cap = null) =>
  a > b && ((cap != null && a >= cap) || (a >= target && a - b >= margin));
export const periodLabel = (sport, index, format) => format.model !== 'periods' ? `Set ${index + 1}`
  : index >= format.periodCount ? `Extra period ${index - format.periodCount + 1}`
  : sport === 'basketball' ? `Q${index + 1}` : `Period ${index + 1}`;
export function activeActions(actions) {
  const reversed = new Set(actions.map(a => a.reversesActionId).filter(Boolean));
  return actions.filter(a => a.type !== 'REVERSE' && !reversed.has(a.actionId));
}
// Validate input shape before it joins the durable command log. Never trust the UI's selected side/value.
export function validateSportAction(sport, format, action) {
  const p = action.payload;
  requireValue(object(p), 'Action payload must be an object.');
  const keys = allowed => requireValue(Object.keys(p).every(k => allowed.includes(k)), 'Unknown action field.');
  switch (action.type) {
    case 'START': keys(['format']); validateFormat(sport, p.format); break;
    case 'POINT':
      keys(['side', 'value']); requireValue(side(p.side), 'Choose a scoring side.');
      requireValue(format.model === 'periods' ? format.scoreValues.includes(p.value ?? 1) : (p.value == null || p.value === 1), 'This scoring value is not in the match format.'); break;
    case 'END_SET': keys(['winner']); requireValue(format.model !== 'periods' && side(p.winner), 'Choose the early set winner.'); break;
    case 'END_PERIOD': keys([]); requireValue(format.model === 'periods', 'Only period sports use this command.'); break;
    case 'EXTRA_PERIOD': keys([]); requireValue(sport === 'basketball', 'The football tie policy must be agreed before a deciding period.'); break;
    case 'CARD':
      keys(['side', 'player', 'card']); requireValue(sport === 'football' && side(p.side) && ['yellow', 'red'].includes(p.card), 'Choose a football side and card.');
      requireValue(typeof p.player === 'string' && p.player.trim().length > 0 && p.player.length <= 80, 'Enter the player name (up to 80 characters).'); break;
    case 'SUB':
      keys(['side', 'off', 'on']); requireValue(format.model === 'periods' && side(p.side), 'Choose the substitution side.');
      requireValue([p.off, p.on].every(v => typeof v === 'string' && v.trim().length > 0 && v.length <= 80) && p.off.trim() !== p.on.trim(), 'Enter different outgoing and incoming players (up to 80 characters).'); break;
    case 'FOUL': keys(['side']); requireValue(sport === 'basketball' && side(p.side), 'Choose the foul side.'); break;
    case 'FINALIZE': keys([]); break;
    case 'REVERSE': keys([]); requireValue(typeof action.reversesActionId === 'string', 'Choose an action to undo.'); break;
    default: throw new Error('Unsupported scoring action.');
  }
}
/** Replay only accepted/queued score commands, never browser timers or client-declared totals. */
export function scoreMatch({ matchId, sport, sides, format: input, actions = [], status = 'LIVE' }) {
  const format = validateFormat(sport, input);
  const periods = [];
  let current = [0, 0], games = [0, 0], wins = [0, 0], totals = [0, 0];
  let serve = format.firstServe ?? null, winner = null, finalized = false;
  let tiebreak = false, tbFirst = null, periodOpen = true;
  const events = [], fouls = [0, 0];
  const finishSet = (won, manual = false, breaker = null) => {
    periods.push({ points: [...(format.model === 'tennis' ? games : current)], winner: won, current: false, manual, ...(breaker ? { tiebreak: [...breaker] } : {}) });
    wins[won] += 1; current = [0, 0]; games = [0, 0];
    if (wins[won] === (format.bestOf + 1) / 2) winner = won;
    if (format.model === 'sets' && sport !== 'table-tennis') serve = won;
    if (sport === 'table-tennis') serve = (format.firstServe + periods.length) % 2;
    tiebreak = false; tbFirst = null;
  };
  const finishGame = won => {
    games[won] += 1; current = [0, 0]; serve = 1 - serve;
    if (winsPoints(games[won], games[1 - won], format.gamesPerSet, format.gameWinBy)) finishSet(won);
    else if (format.tiebreakAt != null && games[0] === format.tiebreakAt && games[1] === format.tiebreakAt) { tiebreak = true; tbFirst = serve; }
  };
  for (const action of activeActions(actions)) {
    validateSportAction(sport, format, action);
    const p = action.payload;
    if (action.type === 'START') continue;
    requireValue(!finalized, 'The result is final and locked.');
    if (action.type === 'FINALIZE') {
      requireValue(winner != null, 'A tied or undecided match cannot be finalized.');
      finalized = true; continue;
    }
    requireValue(winner == null, 'Correct the deciding action before entering more scores.');
    if (action.type === 'POINT') {
      requireValue(periodOpen, 'End the period or add an extra period before scoring.');
      const s = p.side;
      if (format.model === 'periods') { current[s] += p.value ?? 1; totals[s] += p.value ?? 1; }
      else if (format.model === 'sets') {
        current[s] += 1;
        if (sport === 'table-tennis') {
          const first = (format.firstServe + periods.length) % 2, played = current[0] + current[1];
          const deuceAt = 2 * (pointTarget(format, periods.length) - 1);
          const swaps = played >= deuceAt ? Math.floor(deuceAt / 2) + played - deuceAt : Math.floor(played / 2);
          serve = (first + swaps) % 2;
        } else serve = s;
        if (winsPoints(current[s], current[1 - s], pointTarget(format, periods.length), format.winBy, format.cap)) finishSet(s);
      } else {
        current[s] += 1;
        if (tiebreak) {
          if (winsPoints(current[s], current[1 - s], format.tiebreakTo, format.tiebreakWinBy)) {
            const tb = [...current], nextServer = 1 - tbFirst;
            games[s] += 1; finishSet(s, false, tb); serve = nextServer;
          } else {
            const played = current[0] + current[1];
            serve = played === 0 ? tbFirst : (tbFirst + 1 + Math.floor((played - 1) / 2)) % 2;
          }
        } else if (winsPoints(current[s], current[1 - s], 4, format.advantage ? 2 : 1)) finishGame(s);
      }
    } else if (action.type === 'END_SET') finishSet(p.winner, true);
    else if (action.type === 'END_PERIOD') {
      requireValue(periodOpen, 'This period has already ended.');
      periods.push({ points: [...current], winner: current[0] === current[1] ? null : current[0] > current[1] ? 0 : 1, current: false, manual: false });
      current = [0, 0];
      periodOpen = periods.length < format.periodCount;
      if (!periodOpen && totals[0] !== totals[1]) winner = totals[0] > totals[1] ? 0 : 1;
    } else if (action.type === 'EXTRA_PERIOD') {
      requireValue(!periodOpen && totals[0] === totals[1] && periods.length < 30, 'Extra periods are only available after a tied completed period.');
      periodOpen = true;
    } else {
      requireValue(periodOpen, 'Start the extra period before recording events.');
      if (action.type === 'FOUL') fouls[p.side] += 1;
      events.push({ type: action.type, ...p, period: periods.length });
    }
  }
  const rows = [...periods];
  if (winner == null && (format.model !== 'periods' || periodOpen)) rows.push({ points: [...(format.model === 'tennis' ? games : current)], winner: null, current: true, manual: false });
  const labels = format.model === 'tennis' && !tiebreak ? current.map((n, i) => {
    if (format.advantage && current[0] >= 3 && current[1] >= 3) return n > current[1 - i] ? 'Ad' : '40';
    return ['0', '15', '30', '40'][Math.min(n, 3)];
  }) : current.map(String);
  const total = format.model === 'periods' ? totals : wins;
  return { matchId, sport, status: finalized ? 'APPROVED' : status, format, sides: sides.map((name, i) => ({ name: name?.name ?? name, points: total[i] })), periods: rows, currentPoints: [...current], gamePoints: labels, serve, winner, finalized, tiebreak, fouls, events, corrected: false };
}
/** A reversal compensates a durable action; START, FINALIZE and reversals themselves are immutable. */
export function checkReversal(actions, action) {
  if (action.type !== 'REVERSE') { requireValue(action.reversesActionId == null, 'Only a reversal may reference another action.'); return; }
  const target = activeActions(actions).find(a => a.actionId === action.reversesActionId);
  requireValue(target && !['START', 'FINALIZE'].includes(target.type), 'This action cannot be undone.');
}