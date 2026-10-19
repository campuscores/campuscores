import { sports } from '../../data/sports.js';

const totalColumn = [{ key: 'total', label: 'T', className: 'match-total', description: 'Total' }];

/** Maps a Home_Room card to the `LiveMatchCard` `match` prop (doc/handoff.md "Live snapshot-to-card contract"). */
export function toMatchProp(card) {
  const hasScore = Array.isArray(card.score) && card.score.length === 2 && card.score.every(Number.isFinite);
  return {
    id: card.id,
    sport: card.sport,
    sportLabel: sports.find(sport => sport.id === card.sport)?.label,
    competition: card.competition ?? '',
    score: hasScore ? `${card.score[0]}–${card.score[1]}` : 'VS',
    clock: card.clock ?? '',
    columns: totalColumn,
    sides: [0, 1].map(i => ({ name: card.sides?.[i]?.name ?? 'TBD', values: [hasScore ? String(card.score[i]) : '—'] })),
  };
}
