import { sports } from '../../data/sports.js';

const totalColumn = [{ key: 'total', label: 'T', className: 'match-total', description: 'Total' }];

/** Maps a Home_Room card to the `LiveMatchCard` `match` prop (doc/handoff.md "Live snapshot-to-card contract"). */
export function toMatchProp(card) {
  const hasScore = Array.isArray(card.score) && card.score.length === 2 && card.score.every(Number.isFinite);
  const detailed = Array.isArray(card.periods) && card.format;
  const periods = detailed ? card.periods : [];
  const columns = detailed ? [...periods.map((p, i) => ({ key: `period-${i}`, label: `${card.format.model === 'periods' ? 'P' : 'S'}${i + 1}`, className: p.current ? 'is-current' : '', description: `${card.format.model === 'periods' ? 'Period' : 'Set'} ${i + 1}${p.manual ? ', ended early' : ''}` })), ...totalColumn] : totalColumn;
  const outcome = detailed ? card.status === 'APPROVED' ? `Final · ${card.sides?.[card.winner]?.name ?? 'Winner'} won` : card.winner != null ? 'Awaiting final confirmation' : `${card.format.model === 'periods' ? 'Period' : 'Set'} ${periods.length}` : card.clock ?? '';
  return {
    id: card.id,
    sport: card.sport,
    sportLabel: sports.find(sport => sport.id === card.sport)?.label,
    competition: card.competition ?? '',
    score: hasScore ? `${card.score[0]}–${card.score[1]}` : 'VS',
    clock: outcome,
    columns,
    sides: [0, 1].map(i => ({ name: card.sides?.[i]?.name ?? 'TBD', values: [...periods.map(p => String(p.points[i])), hasScore ? String(card.score[i]) : '—'], ...(detailed ? { winners: [...periods.map(p => p.winner === i), false] } : {}) })),
  };
}
