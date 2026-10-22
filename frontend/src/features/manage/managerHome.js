// Maps `GET /api/manage/home` (backend/src/routes/manage.js) to ManagerHomeView props (Req 8). Pure, so it is testable.
// API body: { today: 'YYYY-MM-DD', tournaments: [{ id, slug, name, status, startsOn, endsOn, venue, description, imageKey,
// sports[], isOwner }], todayMatches: { live, scheduled, final, notScored }, needsScorer, pendingInvitations? (Super_Admin) },
// each group { items: staff match rows (≤ 50), total }.
import { timeText } from '../../../../shared/time.mjs';
import { dateText } from './manage.js';

const GROUP_KEYS = ['live', 'scheduled', 'final', 'notScored'];

/** True for a `{ items: [], total }` group; a missing or malformed group fails only its own section (Req 8.7). */
const isGroup = group => Array.isArray(group?.items);

/** No Manager_Scope: the read worked and returned no tournament (Req 8.6). */
export const hasNoScope = data => Array.isArray(data?.tournaments) && data.tournaments.length === 0;

/**
 * `when` text of a staff match row. Today's groups show the time only; "Needs a scorer" spans 7 dates, so its rows
 * also show the date. The time comes from `scheduledAt` through shared/time.mjs; the API `when` is the fallback.
 */
function whenText(row, withDate) {
  const ms = row.scheduledAt ? Date.parse(row.scheduledAt) : NaN;
  const time = Number.isNaN(ms) ? row.when ?? '' : timeText(ms);
  return withDate && row.date && time ? `${dateText(row.date)}, ${time}` : time;
}

const toGroup = (group, withDate) => ({
  items: group.items.map(row => ({ ...row, when: whenText(row, withDate) })),
  total: Number.isFinite(group.total) ? group.total : group.items.length,
});

/**
 * `{ data, sections }` for ManagerHomeView from a loaded body. `sections` marks a section 'error' when its part of the
 * body is missing or malformed, so the other sections still show.
 */
export function toHomeProps(body) {
  const sections = {};
  const todayMatches = body?.todayMatches;
  const todayOk = GROUP_KEYS.every(key => isGroup(todayMatches?.[key]));
  if (!todayOk) sections.today = 'error';
  if (!isGroup(body?.needsScorer)) sections.needsScorer = 'error';
  if (!Array.isArray(body?.tournaments)) sections.tournaments = 'error';
  const data = {
    today: body?.today ? dateText(body.today) : '',
    todayMatches: todayOk ? Object.fromEntries(GROUP_KEYS.map(key => [key, toGroup(todayMatches[key], false)])) : undefined,
    needsScorer: sections.needsScorer ? undefined : toGroup(body.needsScorer, true),
    tournaments: sections.tournaments ? undefined : body.tournaments.map(t => ({ ...t, sports: Array.isArray(t.sports) ? t.sports : [] })),
  };
  // Super_Admin only (absent for a Tournament_Manager); Admin home shows it, Manager home does not.
  if (Number.isFinite(body?.pendingInvitations)) data.pendingInvitations = body.pendingInvitations;
  return { data, sections };
}

/** Whole-screen kind of a failed read (design "Error Handling"): 'signIn' (401), 'forbidden', 'changed' or 'error'. */
export function failureKind(error) {
  if (error?.status === 401) return 'signIn';
  if (error?.code === 'ROLE_FORBIDDEN' || error?.code === 'SCOPE_FORBIDDEN') return 'forbidden';
  if (error?.code === 'NOT_STAFF' || error?.code === 'ACCOUNT_DISABLED') return 'changed';
  return 'error';
}
