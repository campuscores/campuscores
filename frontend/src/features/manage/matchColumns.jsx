// DataList columns for staff match rows (design "Staff match row"). `match.when` is formatted date and time text.
import { PHASE_LABELS, sportLabel, stageLabeler, staffPhase } from '../staff/labels.js';
import { sidesText } from './manage.js';

/**
 * Stage text per match ID for one screen, in display order: "SF1 (Semi-final 1)" on first use, then "SF1" (Req 19.4).
 * Computed once, because DataList renders each cell twice (cards and table).
 */
export function stageNames(matches) {
  const label = stageLabeler();
  return new Map(matches.filter(match => match.stage).map(match => [match.id, label(match.stage)]));
}

export function matchColumns(stages, { status = true, scorer = true } = {}) {
  const columns = [
    { label: 'Match', cell: match => <>
      {stages.has(match.id) && `${stages.get(match.id)}: `}{sidesText(match)}
      <span className="data-sub">{[sportLabel(match.sport), match.tournament?.name].filter(Boolean).join(' · ')}</span>
    </> },
    { label: 'When', cell: match => <>{match.when}{match.venue && <span className="data-sub">{match.venue}</span>}</> },
  ];
  if (status) columns.unshift({ label: 'Status', cell: match => {
    const phase = staffPhase(match);
    return <><span className="status" data-phase={phase}>{PHASE_LABELS[phase]}</span>{match.score && <span className="data-score">{match.score}</span>}</>;
  } });
  if (scorer) columns.push({ label: 'Scorer', cell: match => (match.scorer
    ? <>{match.scorer.name}<span className="data-sub">{match.scorer.email}</span></>
    : 'No scorer') });
  return columns;
}
