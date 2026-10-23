// Display helpers shared by the Tournament_Manager Views. Times arrive as formatted text in props (`match.when`).
import { sideName } from '../operator/operatorMatches.js';
import { sportLabel, startScreen } from '../staff/labels.js';

const SUPER_ADMIN = 'SUPER_ADMIN';

/** Completed and Archived tournaments accept only a status change (Req 9.11). */
export const isLocked = status => status === 'COMPLETED' || status === 'ARCHIVED';

/** Back link to the role's start screen (Req 4.10). */
export const homeBack = role => ({ to: startScreen(role), label: role === SUPER_ADMIN ? 'Admin home' : 'Manager home' });
/** Tournament screens belong to Home for a manager and to Tournaments for a Super_Admin (design "Staff navigation"). */
export const tournamentNav = role => (role === SUPER_ADMIN ? 'tournaments' : 'home');
export const overviewBack = role => (role === SUPER_ADMIN ? { to: '/admin/tournaments', label: 'All tournaments' } : homeBack(role));
export const tournamentPath = slug => `/manage/tournaments/${slug}`;

/** Team sports take jersey numbers and a captain (Req 11.3, 11.6). */
export const TEAM_SPORTS = ['football', 'basketball', 'volleyball'];

/** A calendar date (YYYY-MM-DD) is the event's own date, so it is formatted as-is with no zone shift. */
export const dateText = date => (date ? new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
export const datesText = (startsOn, endsOn) => (!endsOn || startsOn === endsOn ? dateText(startsOn) : `${dateText(startsOn)} to ${dateText(endsOn)}`);

/** "Side A vs Side B", with "To be decided" for an empty FINAL side (Req 12.11). */
export const sidesText = match => `${sideName(match, 0)} vs ${sideName(match, 1)}`;

/** ConfirmDialog text for removing a Sport_Manager (Req 3.7, 20.4). */
export function removeManagerDialog(manager, tournamentName) {
  const who = manager.name || manager.email;
  const sport = sportLabel(manager.sport);
  return {
    title: `Remove ${who} from ${sport}?`, danger: true, confirmLabel: 'Remove sport manager', reason: 'optional',
    effects: [`${who} can no longer change ${sport} in ${tournamentName}.`, 'Matches they already score keep their assignments.'],
  };
}

/**
 * Delete-match dialog props (Super Admin only). A match that is not an untouched Upcoming one has public scores or a
 * result, so the API needs a reason (409 REASON_REQUIRED) and the dialog says the score history goes too.
 */
export function deleteMatchDialog(match) {
  const played = Boolean(match) && (match.phase !== 'upcoming' || match.status !== 'SCHEDULED' || match.hasActions);
  return {
    reason: played ? 'required' : 'optional',
    effects: ['Removes the match from the schedule.', ...(played ? ['Removes its score history and result. Viewers stop seeing it.'] : []),
      'Removes its scorer assignment.', 'This cannot be undone.'],
  };
}
