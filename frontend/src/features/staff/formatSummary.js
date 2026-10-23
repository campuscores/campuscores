// Plain-language Default_Format summary, for example "Best of 3 games to 21, win by 2, capped at 30" (Req 10.8).
import { DEFAULT_FORMATS } from '../../../../shared/scoring.mjs';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = values => values.length > 1 ? `${values.slice(0, -1).join(', ')} or ${values.at(-1)}` : `${values[0]}`;

/** `format` is a stored Default_Format; `{}` or missing fields mean the sport's Official_Preset. */
export function formatSummary(sport, format = {}) {
  const f = { ...DEFAULT_FORMATS[sport], ...format };
  if (f.model === 'periods') {
    const periods = sport === 'football' && f.periodCount === 2 ? '2 halves'
      : sport === 'basketball' && f.periodCount === 4 ? '4 quarters'
      : plural(f.periodCount, 'period');
    return sport === 'football' ? `${periods}, each goal counts 1`
      : `${periods}, scores worth ${list(f.scoreValues)} ${f.scoreValues.length === 1 && f.scoreValues[0] === 1 ? 'point' : 'points'}`;
  }
  const unit = sport === 'volleyball' || f.model === 'tennis' ? 'set' : 'game';
  const count = f.bestOf === 1 ? `1 ${unit}` : `Best of ${f.bestOf} ${unit}s`;
  if (f.model === 'tennis') {
    const tiebreak = f.tiebreakAt == null ? 'no tie-break'
      : `tie-break at ${f.tiebreakAt}–${f.tiebreakAt} to ${plural(f.tiebreakTo, 'point')}, win by ${f.tiebreakWinBy}`;
    return `${count} of ${plural(f.gamesPerSet, 'game')}, win by ${plural(f.gameWinBy, 'game')}, ${tiebreak}, ${f.advantage ? 'advantage' : 'no-ad'} scoring`;
  }
  // The last game uses decidingTarget (pointTarget in shared/scoring.mjs), so a one-game match plays to it.
  if (f.bestOf === 1) return `${count} to ${f.decidingTarget}, win by ${f.winBy}${f.cap == null ? '' : `, capped at ${f.cap}`}`;
  const deciding = f.decidingTarget !== f.target ? `, deciding ${unit} to ${f.decidingTarget}` : '';
  return `${count} to ${f.target}, win by ${f.winBy}${deciding}${f.cap == null ? '' : `, capped at ${f.cap}`}`;
}
