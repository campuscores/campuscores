import { EVENT_TIME_ZONE } from '../../../../shared/time.mjs';

/** Adapts committed public cards to the approved header-only sport card and detail dialog. */
export function toSportMatch(card) {
  const final = card.status === 'APPROVED';
  const date = card.finalizedAt ? new Date(card.finalizedAt) : null;
  const periods = card.periods ?? [{ points: card.score ?? [0, 0], winner: null, current: !final }];
  const periodModel = card.format?.model === 'periods' || ['football', 'basketball'].includes(card.sport);
  return {
    id: String(card.id), status: final ? 'completed' : 'live', realScore: true,
    category: card.competition ?? '', tournament: card.competition ?? '', round: '', venue: '',
    date: date?.toLocaleDateString('en-CA', { timeZone: EVENT_TIME_ZONE.name }), dateLabel: date?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: EVENT_TIME_ZONE.name }) ?? '', timeLabel: '',
    clock: card.winner != null && !final ? 'Awaiting final confirmation' : `${periodModel ? 'Period' : 'Set'} ${periods.length}`,
    sides: [0, 1].map(i => ({ name: card.sides?.[i]?.name ?? 'TBD', team: card.sides?.[i]?.name ?? 'TBD', players: [], serving: !final && card.serve === i })),
    score: card.score ?? [0, 0], ...(card.format?.model === 'tennis' && !final ? { gamePoints: card.gamePoints } : {}), periods, winner: final ? card.winner : null, events: card.events ?? [],
    scoring: { model: periodModel ? 'period' : 'set', unit: periodModel ? 'Period' : 'Set', short: periodModel ? 'P' : 'S', total: 'T', totalName: periodModel ? 'Total points' : 'Sets won', team: true, showLineups: false },
  };
}
