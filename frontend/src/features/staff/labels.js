// Display text for Staff_Area screens. Visible text never shows a stored value, code or ID (Req 19.4, 20.3).
export { sportLabel } from '../operator/operatorMatches.js';

const ROLES = { SUPER_ADMIN: 'Super Admin', TOURNAMENT_MANAGER: 'Tournament Manager', MATCH_OPERATOR: 'Match Scorer' };
const ACCOUNT_STATUSES = { ACTIVE: 'Active', DISABLED: 'Disabled' };
const TOURNAMENT_STATUSES = { DRAFT: 'Draft', ONGOING: 'Ongoing', COMPLETED: 'Completed', ARCHIVED: 'Archived' };

export const roleLabel = role => ROLES[role] ?? '';
export const accountStatusLabel = status => ACCOUNT_STATUSES[status] ?? '';
export const tournamentStatusLabel = status => TOURNAMENT_STATUSES[status] ?? '';

/** Staff navigation per role, in fixed order (Req 4.9). The first item is the role's start screen (Req 2.7). */
export const STAFF_NAV = {
  MATCH_OPERATOR: [
    { key: 'my-matches', label: 'My Matches', to: '/operator/matches' },
    { key: 'account', label: 'Account', to: '/account' },
  ],
  TOURNAMENT_MANAGER: [
    { key: 'home', label: 'Home', to: '/manage' },
    { key: 'matches', label: 'Matches', to: '/manage/matches' },
    { key: 'invite', label: 'Invite scorer', to: '/manage/invite' },
    { key: 'account', label: 'Account', to: '/account' },
  ],
  SUPER_ADMIN: [
    { key: 'home', label: 'Home', to: '/admin' },
    { key: 'tournaments', label: 'Tournaments', to: '/admin/tournaments' },
    { key: 'matches', label: 'Matches', to: '/manage/matches' },
    { key: 'staff', label: 'Staff', to: '/admin/staff' },
    { key: 'account', label: 'Account', to: '/account' },
  ],
};
export const startScreen = role => STAFF_NAV[role]?.[0].to ?? '/';

/** Staff Match_Phase from the API `phase` and `status`; also the `data-phase` value of the `.status` marker. */
export const staffPhase = ({ phase, status }) =>
  phase === 'live' ? 'live' : phase === 'upcoming' ? 'scheduled' : status === 'SCHEDULED' ? 'not-scored' : 'final';
export const PHASE_LABELS = { live: 'Live', scheduled: 'Scheduled', final: 'Final', 'not-scored': 'Not scored' };

const STAGES = { SF1: ['SF1', 'Semi-final 1'], SF2: ['SF2', 'Semi-final 2'] };
/** "SF1 (Semi-final 1)" when `full`, else "SF1"; FINAL is "Final"; a Regular_Match is "Match" (Req 19.4, 12.11). */
export function stageLabel(stage, full = true) {
  if (stage === 'FINAL') return 'Final';
  const [short, long] = STAGES[stage] ?? [];
  return !short ? 'Match' : full ? `${short} (${long})` : short;
}
/** Labeler for one screen: spells out each abbreviation on its first use only. */
export function stageLabeler() {
  const seen = new Set();
  return stage => {
    const full = !seen.has(stage);
    seen.add(stage);
    return stageLabel(stage, full);
  };
}

// Plain-language sentence per Error_Body code (design "Error Handling"). FIELDS names the form field a code belongs to.
const MESSAGES = {
  UNAUTHENTICATED: 'Your sign-in has expired.',
  NOT_STAFF: 'Your staff access has changed.',
  ACCOUNT_DISABLED: 'Your staff access has changed.',
  ROLE_FORBIDDEN: 'Your staff access has changed.',
  SCOPE_FORBIDDEN: 'You no longer manage this sport.',
  NOT_FOUND: 'This item no longer exists.',
  INTERNAL: 'Something went wrong. Nothing was saved.',
  CLERK_UNAVAILABLE: 'The sign-in service is unavailable.',
  SCORER_NOT_FOUND: 'No scorer account uses this email.',
  NOT_A_SCORER: 'This email belongs to an account that is not a Match Scorer.',
  INVITE_PENDING: 'An invitation to this email is waiting to be accepted.',
  MANAGER_NOT_ELIGIBLE: 'Enter the email of an active Tournament Manager who is not already on this sport.',
  DUPLICATE_NAME: 'This name is already used in this sport.',
  STAGE_TAKEN: 'This stage is already used in this sport.',
  SPORT_EXISTS: 'This sport is already in the tournament.',
  REASON_REQUIRED: 'Enter a reason.',
  TOURNAMENT_LOCKED: 'This tournament is completed or archived, so it cannot change.',
  MATCH_CLOSED: 'This match is live, final or not scored, so it cannot change.',
  TEAM_IN_USE: 'A match uses this team, so it cannot change.',
  SPORT_HAS_MATCHES: 'This sport has matches. Delete its matches first.',
  NOT_DRAFT: 'Only a draft tournament can be deleted.',
  NO_SPORTS: 'Add a sport before you publish the tournament.',
  LIVE_MATCHES: 'A match is still live. Finish it before you complete the tournament.',
  STATUS_CHANGE_INVALID: 'This status change is not allowed.',
  OWNER_TRANSFER_REQUIRED: 'This account owns a tournament. Transfer ownership first.',
  LAST_SUPER_ADMIN: 'This is the last active Super Admin. Invite or enable another Super Admin first.',
  ALREADY_DISABLED: 'This account is already disabled.',
  ALREADY_ACTIVE: 'This account is already active.',
  INVITE_CLOSED: 'This invitation was already accepted, cancelled or has expired.',
  ASSIGNMENT_CONFLICT: 'Another scorer was assigned at the same time. Reload to see the current scorer.',
};
const FIELDS = { SCORER_NOT_FOUND: 'email', NOT_A_SCORER: 'email', INVITE_PENDING: 'email', MANAGER_NOT_ELIGIBLE: 'email', DUPLICATE_NAME: 'name', STAGE_TAKEN: 'stage', SPORT_EXISTS: 'sport', REASON_REQUIRED: 'reason' };
const BY_STATUS = { 400: 'Check your entries and try again.', 403: MESSAGES.NOT_STAFF, 404: MESSAGES.NOT_FOUND, 409: 'This changed since you opened the page. Reload to see the latest.' };

/** Field and fix of an error: `BAD_REQUEST` messages read "<field>: <fix>" (backend validate.js). */
function parse(err) {
  if (err.code === 'BAD_REQUEST') {
    const [, field, fix] = /^(\w+): (.+)$/.exec(err.message ?? '') ?? [];
    return { field, text: fix ?? BY_STATUS[400] };
  }
  if (err.code === 'DATES_EXCLUDE_MATCHES') {
    const n = Number(/\d+/.exec(err.message ?? '')?.[0]);
    return { text: n ? `${n} ${n === 1 ? 'match falls' : 'matches fall'} outside these dates. Move ${n === 1 ? 'it' : 'them'} first.` : 'Some matches fall outside these dates. Move them first.' };
  }
  const text = !err.status ? 'Could not reach the server. Your changes are still here.'
    : MESSAGES[err.code] ?? BY_STATUS[err.status] ?? MESSAGES.INTERNAL;
  return { field: FIELDS[err.code], text };
}

/**
 * One plain sentence for an `apiFetch` error, with no code or request ID (Req 20.3).
 * With `field`, returns the sentence only when the error belongs to that form field, else null.
 */
export function messageFor(err, field) {
  if (!err) return null;
  const parsed = parse(err);
  return field === undefined || parsed.field === field ? parsed.text : null;
}
