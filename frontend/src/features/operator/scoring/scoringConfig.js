// Sport scoring format config. This is the seam for backend/admin integration:
// the admin sets the format when scheduling a match, and the backend sends this object with the
// match. Until then the UI uses these defaults. The scoring UI and win logic read ONLY from here,
// so swapping in a server-provided config needs no UI change.
//
// Set-model format fields (badminton, table tennis):
//   gamesToWin    — games a side needs to win the match (best of 3 -> 2, best of 5 -> 3)
//   pointsPerGame — target points for a normal game (badminton 21, table tennis 11)
//   winBy         — points a side must lead by to win a game (2)
//   cap           — hard ceiling; at cap-all the next point wins (badminton 30; null = no cap)
//   serveModel    — 'rally' (badminton: server is the last point winner) or
//                   'alternate' (table tennis: serve swaps every `serveEvery` points, every 1 at deuce)
//   serveEvery    — points between serve swaps for the 'alternate' model (table tennis 2)

/** BWF baseline, used until an admin/backend format arrives. */
export const BADMINTON_DEFAULT = { gamesToWin: 2, pointsPerGame: 21, winBy: 2, cap: 30, serveModel: 'rally' };

/** ITTF baseline, used until an admin/backend format arrives. */
export const TABLE_TENNIS_DEFAULT = { gamesToWin: 3, pointsPerGame: 11, winBy: 2, cap: null, serveModel: 'alternate', serveEvery: 2 };

// Volleyball adds a deciding-set target: the final set (gamesToWin*2-1) is played to a lower score.
//   decidingPoints — target for the deciding set (FIVB: 15; null = same as pointsPerGame)
/** FIVB baseline, used until an admin/backend format arrives. */
export const VOLLEYBALL_DEFAULT = { gamesToWin: 3, pointsPerGame: 25, winBy: 2, cap: null, decidingPoints: 15, serveModel: 'rally' };

// Lawn tennis (point -> game -> set). advantage=false means no-ad (sudden point at deuce).
//   setsToWin, gamesPerSet, gameWinBy, advantage, tiebreakAt, tiebreakTo, tiebreakWinBy
/** ITF baseline: best of 3 advantage sets, 7-point tiebreak at 6-6. */
export const TENNIS_DEFAULT = { setsToWin: 2, gamesPerSet: 6, gameWinBy: 2, advantage: true, tiebreakAt: 6, tiebreakTo: 7, tiebreakWinBy: 2 };

// Period-model (football, basketball). `periods` are the ordered period labels; `scoreValues` are
// the point buttons; `events` lists which attributed events the console offers.
/** IFAB baseline: two halves; goals, cards, substitutions. */
export const FOOTBALL_DEFAULT = { periods: ['First half', 'Second half'], scoreValues: [1], events: ['goal', 'card', 'sub'] };
/** FIBA baseline: four quarters (+OT when tied); 1/2/3 points, fouls, substitutions. */
export const BASKETBALL_DEFAULT = { periods: ['Q1', 'Q2', 'Q3', 'Q4', 'OT'], scoreValues: [1, 2, 3], events: ['basket', 'foul', 'sub'] };

/** Merge a partial (future server/admin) config over the sport default. */
export function badmintonFormat(override) {
  return { ...BADMINTON_DEFAULT, ...(override ?? {}) };
}

export function tableTennisFormat(override) {
  return { ...TABLE_TENNIS_DEFAULT, ...(override ?? {}) };
}

export function volleyballFormat(override) {
  return { ...VOLLEYBALL_DEFAULT, ...(override ?? {}) };
}

export function tennisFormat(override) {
  return { ...TENNIS_DEFAULT, ...(override ?? {}) };
}

export function footballFormat(override) {
  return { ...FOOTBALL_DEFAULT, ...(override ?? {}) };
}

export function basketballFormat(override) {
  return { ...BASKETBALL_DEFAULT, ...(override ?? {}) };
}

/** Total sets possible for a best-of tennis match, e.g. setsToWin 2 -> 3. */
export const maxSets = format => format.setsToWin * 2 - 1;

/** Total games possible for a best-of series, e.g. gamesToWin 2 -> 3, 3 -> 5. */
export const maxGames = format => format.gamesToWin * 2 - 1;

/** Target points for game/set index `i` (0-based): the deciding set may use a lower target. */
export const targetFor = (format, i) =>
  format.decidingPoints != null && i === maxGames(format) - 1 ? format.decidingPoints : format.pointsPerGame;
