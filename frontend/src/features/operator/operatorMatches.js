// Pure helpers for rows from GET /api/operator/matches (Req 19.1). No fixtures: the list comes from the API.
import { sports } from '../../data/sports.js';
import { EVENT_TIME_ZONE } from '../../../../shared/time.mjs';

export const sportLabel = id => sports.find(sport => sport.id === id)?.label ?? id;
export const sideName = (match, index) => match.sides?.[index]?.name ?? 'To be decided';

/**
 * Dashboard section for a match: the user-confirmed map in doc/memory.md ("My Matches sections"). A Not_Scored match
 * (the API `notScored`, by database time) is past, so it moves to Completed (Req 15.4).
 */
export function sectionOf({ status, correctionRoute, notScored }) {
  if (status === 'SCHEDULED') return notScored ? 'completed' : 'scheduled';
  if (status === 'LIVE' || (status === 'REJECTED' && correctionRoute === 'OPERATOR')) return 'live';
  return 'completed'; // PENDING_APPROVAL, APPROVED, REJECTED/MANAGER; read-only for operators
}

/** Matches that accept no more score actions from anyone. */
export const isClosed = ({ status }) => status === 'PENDING_APPROVAL' || status === 'APPROVED';

/** `{ date: 'YYYY-MM-DD', label: '12 Oct', time: '14:30' }` for a scheduled time, or null when unset. */
export function dayOf(iso) {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return null;
  return {
    date: at.toLocaleDateString('en-CA', { timeZone: EVENT_TIME_ZONE.name }),
    label: at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: EVENT_TIME_ZONE.name }),
    time: at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: EVENT_TIME_ZONE.name }),
  };
}

export const stageLabel = ({ kind, stage }) =>
  ({ SF1: 'Semifinal 1', SF2: 'Semifinal 2', FINAL: 'Final' })[stage] ?? (kind === 'CUSTOM' ? 'Match' : ''); // a Regular_Match is "Match" (Req 12.11)
