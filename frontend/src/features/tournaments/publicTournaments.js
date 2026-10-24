import { EVENT_TIME_ZONE, istDate, matchPhase, timeText } from '../../../../shared/time.mjs';
import { sports } from '../../data/sports.js';
import { toSportMatch } from '../sports/liveSportMatches.js';
import { sportFixtures } from '../sports/sportFixtures.js';
import { stageLabel } from '../operator/operatorMatches.js';
import useStaffData from '../staff/useStaffData.js';
import { mergeCards } from './mergeCards.js';
import { sampleTournaments } from './sampleTournaments.js';
import { VENUES } from './venues.js';

const noToken = async () => undefined;
const neverEmpty = () => false;

/**
 * One public GET (no token) on entry and on `reload` ("Try again") only, no polling (Req 22.1). A null `path` sends
 * nothing. `status`: 'loading' | 'ready' | 'error' | 'not-found'; a 404 or a 400 malformed key is 'not-found' (Req 17.7).
 */
export function usePublicRead(path) {
  const { data, error, status, reload } = useStaffData(path, noToken, neverEmpty);
  return { data, reload, status: status === 'error' && [400, 404].includes(error?.status) ? 'not-found' : status };
}

// Display_Fixtures (no VITE_API_BASE, Req 17.10). They carry no phase; all show as Live, as on the homepage row.
const imageKeyOf = event => Object.keys(VENUES).find(key => VENUES[key].image === event.image);
export const fixtureTournaments = sampleTournaments.map(event => ({
  slug: event.id, name: event.name, startsOn: event.start, endsOn: event.end, imageKey: imageKeyOf(event), phase: 'live',
}));
const withPhase = (matches, phase) => matches.map(match => ({ ...match, phase }));
export function fixtureMatches(sportId, tournamentName) {
  const { liveMatches, upcomingMatches, pastMatches } = sportFixtures[sportId];
  return [...withPhase(liveMatches, 'live'), ...withPhase(upcomingMatches, 'upcoming'), ...withPhase(pastMatches, 'past')]
    .filter(match => match.tournament === tournamentName);
}
/** A fixture tournament with the sports that have fixture matches for it, or undefined. */
export function fixtureTournament(slug) {
  const tournament = fixtureTournaments.find(entry => entry.slug === slug);
  return tournament && { ...tournament, sports: sports.filter(sport => fixtureMatches(sport.id, tournament.name).length).map(sport => sport.id) };
}

/** One public `match` DTO (merged with its live card when `fromCard`) to the sport card shape of TournamentSportView. */
function toPublicMatch(match, tournamentName, fromCard) {
  const at = match.scheduledAt ? Date.parse(match.scheduledAt) : NaN;
  const timed = Number.isFinite(at);
  const card = fromCard ? toSportMatch(match) : null;
  const stage = stageLabel(match) || 'Match';
  return {
    ...card,
    id: String(match.id),
    // A card's LIVE or APPROVED status gives its phase with no clock (shared/time.mjs). A SCHEDULED card keeps the API
    // phase, because only the Worker clock knows whether its match day has ended (Not scored, Req 17.16).
    phase: fromCard && (match.status !== 'SCHEDULED' || !match.phase) ? matchPhase({ status: match.status }) : match.phase,
    status: card?.status ?? (match.status === 'LIVE' ? 'live' : match.status === 'APPROVED' ? 'completed' : 'scheduled'),
    clock: card?.clock ?? 'Live',
    category: stage, round: stage, tournament: tournamentName, venue: match.venue ?? '',
    // A card the read lacks has no scheduled time; a final one keeps its finalizedAt day from toSportMatch.
    date: timed ? istDate(at) : card?.date,
    dateLabel: timed ? new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: EVENT_TIME_ZONE.name }) : card?.dateLabel ?? '',
    timeLabel: timed ? timeText(at) : '',
    // A null name stays null, so TournamentSportView shows "To be decided".
    sides: [0, 1].map(i => match.sides?.[i]?.name ? { name: match.sides[i].name, team: match.sides[i].name, players: [], serving: card?.sides[i].serving } : null),
  };
}

/** `cards` merged into `read` by match ID (cards the read lacks are appended), each in the sport card shape. */
function mergedSportMatches(read, cards, nameOf) {
  const live = new Set(cards.map(card => String(card.id)));
  return mergeCards(read, cards).map(match => toPublicMatch(match, nameOf(match), live.has(String(match.id))));
}

/**
 * The sport's matches of one public tournament read, with the live home-room cards merged by match ID (Req 17.13).
 * A card applies when its `tournamentId` names this tournament, so a match created after the read still shows. A card
 * stored before `tournamentId` existed (an old room snapshot) applies only when this read contains its match.
 */
export function tournamentSportMatches(tournament, sportId, cards) {
  const read = (tournament.matches ?? []).filter(match => match.sport === sportId);
  const ids = new Set(read.map(match => String(match.id)));
  const scoped = (cards ?? []).filter(card => card.sport === sportId
    && (card.tournamentId != null ? String(card.tournamentId) === String(tournament.id) : ids.has(String(card.id))));
  return mergedSportMatches(read, scoped, () => tournament.name);
}

/** The Sport page: one sport's matches of every public tournament (`GET /api/sports/:sport/matches`) with its live cards merged (Req 17.3, 17.13). */
export function sportPageMatches(matches, sportId, cards) {
  const scoped = (cards ?? []).filter(card => card.sport === sportId);
  return mergedSportMatches(matches ?? [], scoped, match => match.tournamentName ?? match.competition ?? '');
}

const TO_BE_DECIDED = { name: 'To be decided', team: 'To be decided', players: [] };
/** An empty FINAL side reads "To be decided" (Req 12.11); a Past match with no final result is Not scored (Req 17.4). */
export const forDisplay = match => ({
  ...match,
  sides: [0, 1].map(i => match.sides?.[i]?.name ? match.sides[i] : TO_BE_DECIDED),
  status: match.phase === 'past' && match.status !== 'completed' ? 'not-scored' : match.status,
});
/** Date chips of a section from its matches' India_Time dates, in date order. */
export const datesOf = matches => [...new Map(matches.filter(m => m.date).map(m => [m.date, { date: m.date, label: m.dateLabel }])).values()]
  .sort((a, b) => a.date.localeCompare(b.date));
