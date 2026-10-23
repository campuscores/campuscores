// Guided_Setup steps (Req 9.1): each title reads "Step N of 5: Name"; Back opens the step before.
import { timeText } from '../../../../shared/time.mjs';
import { sportLabel } from '../staff/labels.js';
import { dateText, homeBack, tournamentPath } from './manage.js';
const STEPS = [['details', 'Tournament details'], ['sports', 'Sports'], ['teams', 'Teams'], ['matches', 'Matches'], ['scorers', 'Scorers']];
export const stepTitle = n => `Step ${n} of 5: ${STEPS[n - 1][1]}`;
/** Step 1 of a saved tournament is its Tournament details screen; steps 2 to 5 live under `/setup/<step>`. */
export const stepPath = (slug, n) => (n === 1 ? `${tournamentPath(slug)}/details` : `${tournamentPath(slug)}/setup/${STEPS[n - 1][0]}`);
export const stepBack = (role, slug, n) => (n === 1 ? homeBack(role)
  : n === 2 ? { to: stepPath(slug, 1), label: 'Tournament details' }
  : { to: stepPath(slug, n - 1), label: stepTitle(n - 1) });
/** Step number (2 to 5) of a `/setup/:step` route parameter, or 0 for an unknown step. */
export const stepNumber = step => {
  const n = STEPS.findIndex(([key]) => key === step) + 1;
  return n >= 2 ? n : 0;
};
/**
 * Where `/setup` without a step goes (Req 9.3): the API `nextStep` (sports, teams, matches or scorers) of a Draft
 * tournament, or the Tournament overview when `nextStep` is null (not Draft).
 */
export const setupTarget = (slug, nextStep) => (stepNumber(nextStep) ? stepPath(slug, stepNumber(nextStep)) : tournamentPath(slug));

/**
 * The API names some fields with other tokens than the form (POST and PATCH /manage/tournaments say `startDate` and
 * `endDate` for `startsOn` and `endsOn`). Returns the error with its "<field>: <fix>" message renamed by `tokens`, so
 * `messageFor` puts it below the right field; any other error is returned as it is.
 */
export function renameFields(error, tokens) {
  const [, field, fix] = /^(\w+): (.+)$/s.exec(error?.message ?? '') ?? [];
  if (error?.code !== 'BAD_REQUEST' || !tokens[field]) return error;
  return Object.assign(new Error(`${tokens[field]}: ${fix}`), { status: error.status, code: error.code, requestId: error.requestId });
}
export const TOURNAMENT_TOKENS = { startDate: 'startsOn', endDate: 'endsOn' };

/**
 * TeamForm values to the POST .../teams body. TeamForm keeps a jersey number as `number`; the API reads `jersey`
 * (backend validate.js `validatePlayers`) and drops any other key.
 */
export const teamBody = ({ name, branch, year, players }) => ({
  name, branch, year,
  players: players.map(({ name: playerName, number, captain }) => ({
    name: playerName, ...(number != null && { jersey: number }), ...(captain && { captain: true }),
  })),
});

/** Sports to add and to remove so the tournament has exactly the `chosen` sport keys (step 2). */
export function sportChanges(sports, chosen) {
  const current = sports.map(entry => entry.sport);
  return { add: chosen.filter(sport => !current.includes(sport)), remove: current.filter(sport => !chosen.includes(sport)) };
}
/** ConfirmDialog text when step 2 removes sports that have teams (Req 10.9, 20.4), else null. */
export function removeSportsDialog(sports, remove) {
  const withTeams = sports.filter(entry => remove.includes(entry.sport) && entry.teamCount > 0);
  if (!withTeams.length) return null;
  const names = remove.map(sportLabel).join(', ');
  return {
    title: `Remove ${names}?`, danger: true, confirmLabel: remove.length > 1 ? 'Remove sports' : 'Remove sport',
    effects: withTeams.map(entry => `${sportLabel(entry.sport)}: its ${entry.teamCount} ${entry.teamCount === 1 ? 'team is' : 'teams are'} deleted.`),
  };
}
/** A repeated add (409 SPORT_EXISTS) or remove (404) means the sport is already as chosen, e.g. after a partial save. */
export const alreadyDone = (error, method) => (method === 'POST' ? error?.code === 'SPORT_EXISTS' : error?.status === 404);

/** A staff match row with `when` as "<date>, <time> <zone>" from `scheduledAt`, through shared/time.mjs. */
export const withWhen = match => ({ ...match, when: match.scheduledAt ? `${dateText(match.date)}, ${timeText(Date.parse(match.scheduledAt))}` : '' });
/** Step 4 sections: each sport of the tournament with its teams and its matches. */
export const sportSections = (sports, teamsBySport, matches) => sports.map(({ sport }) => ({
  sport, teams: teamsBySport[sport] ?? [], matches: matches.filter(match => match.sport === sport),
}));
/** Step 5 (Req 13.6): Upcoming matches with no ACTIVE Assignment. */
export const withoutScorer = matches => matches.filter(match => !match.assignmentId && match.phase === 'upcoming');

/** One screen state from several reads: loading while one loads, else the first error, else ready. */
export function combined(loads) {
  if (loads.some(load => load.status === 'loading')) return { status: 'loading', error: null };
  const failed = loads.find(load => load.status === 'error');
  return failed ? { status: 'error', error: failed.error } : { status: 'ready', error: null };
}
/** ROLE_FORBIDDEN or SCOPE_FORBIDDEN on a read shows the no-access screen (Req 2.6). */
export const isForbidden = error => error?.code === 'ROLE_FORBIDDEN' || error?.code === 'SCOPE_FORBIDDEN';
/**
 * State of a Guided_Setup screen from its reads; `detail` is the GET /manage/tournaments/:slug body. Only the
 * Tournament_Owner or a Super_Admin (`isOwner`) runs the Guided_Setup (design route table), so a Sport_Manager and a
 * forbidden read get 'forbidden'.
 */
export function setupState(loads, detail) {
  const { status, error } = combined(loads);
  if (isForbidden(error) || (status === 'ready' && !detail?.isOwner)) return { status: 'forbidden', error };
  return { status, error };
}
/**
 * Recovery for a failed save (Req 20.3, 20.8, 20.9): 'retry' for no response, 500 or 502; 'signIn' for 401; 'reload'
 * for a 403 or a 409 that means the account, scope or tournament changed (a 409 that names a form field needs no
 * reload); else null.
 */
export function recovery(error) {
  if (!error) return null;
  if (!error.status || error.status === 500 || error.status === 502) return 'retry';
  if (error.status === 401) return 'signIn';
  if (error?.status === 403 || (error?.status === 409 && !['DUPLICATE_NAME', 'STAGE_TAKEN'].includes(error.code))) return 'reload';
  return null;
}
