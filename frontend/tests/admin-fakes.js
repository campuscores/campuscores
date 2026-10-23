// Stateful fake of the Super_Admin endpoints, shared by admin.spec.js and staff-layout.spec.js. The replies copy
// backend/src/routes/admin.js (staff list and detail, ownership transfer, invitation list), accounts.js (disable,
// enable, role change, with their check order), invites.js (invite and cancel) and the Super_Admin parts of manage.js
// (`pendingInvitations` on GET /manage/home; `owner` and `sportManagers` on GET /manage/tournaments).
// `adminFake()` returns `{ state, reply(request) }`: `reply` gives a [status, body] pair or undefined for other paths.
import { apiError, mockManage } from './helpers.js';
import { LATER, ROWS, TODAY, tournamentRow } from './manage-fakes.js';

const DAY = 86400000;
const PAGE = 50;
const ROLES = ['SUPER_ADMIN', 'TOURNAMENT_MANAGER', 'MATCH_OPERATOR'];
const ID = /^[1-9][0-9]{0,17}$/; // backend public.js ID_PATTERN
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // backend invites.js
const NOT_FOUND = [404, apiError('NOT_FOUND', 'Not found')];
const bad = (field, fix) => [400, apiError('BAD_REQUEST', `${field}: ${fix}`)];
// to_json(timestamptz) #>> '{}' text, as the backend returns `expiresAt`.
const pgTime = ms => new Date(ms).toISOString().replace('Z', '+00:00');
export const ADMIN_URLS = /^http:\/\/api\.test\/api\/(admin\/|accounts\/|invites(\/\d+\/cancel)?$|manage\/)/;

/** The signed-in Super Admin is account 1 and the only ACTIVE Super Admin. */
export const STAFF = () => [
  { id: '1', name: 'Arnav Admin', email: 'arnav@example.com', role: 'SUPER_ADMIN', status: 'ACTIVE', activeAssignments: 0 },
  { id: '2', name: 'Mira Coach', email: 'mira@example.com', role: 'TOURNAMENT_MANAGER', status: 'ACTIVE', activeAssignments: 0 },
  { id: '3', name: 'Kabir Rao', email: 'kabir@example.com', role: 'TOURNAMENT_MANAGER', status: 'ACTIVE', activeAssignments: 0 },
  { id: '4', name: 'Asha Singh', email: 'asha@example.com', role: 'MATCH_OPERATOR', status: 'ACTIVE', activeAssignments: 2 },
  { id: '5', name: 'Dev Old', email: 'dev@example.com', role: 'MATCH_OPERATOR', status: 'DISABLED', activeAssignments: 0 },
];
/** `count` more ACTIVE Match Scorers (ids 101…), for paging. */
export const fillerStaff = count => Array.from({ length: count }, (_, i) => ({
  id: String(101 + i), name: null, email: `scorer${String(i + 1).padStart(2, '0')}@example.com`, role: 'MATCH_OPERATOR', status: 'ACTIVE', activeAssignments: 0,
}));
export const TOURNAMENTS = () => [
  { slug: 'spring-cup', name: 'Spring Cup', status: 'ONGOING', startsOn: TODAY, endsOn: LATER, sports: ['badminton', 'football'], ownerId: '2' },
];
export const SPORT_MANAGERS = () => [{ slug: 'spring-cup', sport: 'football', accountId: '3' }];
export const INVITATIONS = () => [
  { id: '61', email: 'new@example.com', role: 'TOURNAMENT_MANAGER', invitedBy: 'Arnav Admin', expiresAt: pgTime(Date.now() + 2 * DAY) },
  { id: '62', email: 'later@example.com', role: 'MATCH_OPERATOR', invitedBy: 'Arnav Admin', expiresAt: pgTime(Date.now() + 5 * DAY) },
];

export function adminFake({ staff = STAFF(), tournaments = TOURNAMENTS(), sportManagers = SPORT_MANAGERS(), invitations = INVITATIONS() } = {}) {
  const state = { staff, tournaments, sportManagers, invitations, nextInvitation: 70 };
  const find = id => state.staff.find(member => member.id === id);
  const owned = id => state.tournaments.filter(t => t.ownerId === id).sort((a, b) => a.name.localeCompare(b.name));
  const scopeNames = id => [...new Set([...owned(id).map(t => t.name),
    ...state.sportManagers.filter(sm => sm.accountId === id).map(sm => state.tournaments.find(t => t.slug === sm.slug).name)])].sort();
  const person = member => ({ accountId: member.id, name: member.name, email: member.email });
  const lastSuper = member => member.role === 'SUPER_ADMIN' && member.status === 'ACTIVE'
    && state.staff.filter(other => other.role === 'SUPER_ADMIN' && other.status === 'ACTIVE').length === 1;
  const dropAccess = member => {
    member.activeAssignments = 0;
    state.sportManagers = state.sportManagers.filter(sm => sm.accountId !== member.id);
  };
  const offsetOf = query => Number(query.offset || 0);
  const paged = (rows, offset) => ({ items: rows.slice(offset, offset + PAGE), nextOffset: rows.length > offset + PAGE ? offset + PAGE : null });

  function home() {
    const rows = ROWS();
    const group = items => ({ items, total: items.length });
    const today = rows.filter(row => row.date === TODAY);
    return {
      today: TODAY, tournaments: [],
      todayMatches: {
        live: group(today.filter(row => row.phase === 'live')), scheduled: group(today.filter(row => row.phase === 'upcoming')),
        final: group(today.filter(row => row.phase === 'past' && row.status !== 'SCHEDULED')),
        notScored: group(today.filter(row => row.phase === 'past' && row.status === 'SCHEDULED')),
      },
      needsScorer: group(rows.filter(row => row.phase === 'upcoming' && !row.assignmentId)),
      pendingInvitations: state.invitations.length,
    };
  }

  function reply({ method, path, query, body }) {
    let m;
    if (method === 'GET' && path === '/manage/home') return [200, home()];
    if (method === 'GET' && path === '/manage/tournaments') {
      const rows = [...state.tournaments].sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.name.localeCompare(b.name));
      return [200, {
        tournaments: rows.map(({ slug, name, status, startsOn, endsOn, sports, ownerId }) => ({
          ...tournamentRow({ slug, name, status, startsOn, endsOn }), sports, isOwner: true, owner: person(find(ownerId)),
          sportManagers: state.sportManagers.filter(sm => sm.slug === slug).map(sm => ({ sport: sm.sport, ...person(find(sm.accountId)) })),
        })),
      }];
    }

    if (method === 'GET' && path === '/admin/staff') {
      if (query.role && !ROLES.includes(query.role)) return bad('role', 'Choose Super Admin, Tournament Manager or Match Scorer.');
      if (query.status && !['ACTIVE', 'DISABLED'].includes(query.status)) return bad('status', 'Choose Active or Disabled.');
      const rows = state.staff.filter(member => (!query.role || member.role === query.role) && (!query.status || member.status === query.status))
        .sort((a, b) => (a.status !== 'ACTIVE') - (b.status !== 'ACTIVE') || a.email.localeCompare(b.email) || Number(a.id) - Number(b.id));
      const { items, nextOffset } = paged(rows, offsetOf(query));
      return [200, { staff: items.map(({ id, name, email, role, status }) => ({ id, name, email, role, status, tournaments: scopeNames(id) })), nextOffset }];
    }
    if (method === 'GET' && (m = /^\/admin\/staff\/([^/]+)$/.exec(path))) {
      if (!ID.test(m[1])) return [400, apiError('BAD_REQUEST', 'Malformed ID')];
      const member = find(m[1]);
      if (!member) return [404, apiError('NOT_FOUND', 'Account not found')];
      const { id, name, email, role, status, activeAssignments } = member;
      const sportScope = state.sportManagers.filter(sm => sm.accountId === id).map(sm => {
        const t = state.tournaments.find(entry => entry.slug === sm.slug);
        return { tournament: { slug: t.slug, name: t.name }, sport: sm.sport };
      });
      return [200, { member: { id, name, email, role, status, owned: owned(id).map(t => ({ slug: t.slug, name: t.name })), sportScope, activeAssignments } }];
    }
    if (method === 'POST' && (m = /^\/admin\/tournaments\/([^/]+)\/owner$/.exec(path))) {
      const t = state.tournaments.find(entry => entry.slug === m[1]);
      if (!t) return [404, apiError('NOT_FOUND', 'Tournament not found')];
      const wanted = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!EMAIL.test(wanted)) return bad('email', 'Enter an email address like name@example.com.');
      const owner = state.staff.find(member => member.email === wanted && member.status === 'ACTIVE' && member.role === 'TOURNAMENT_MANAGER');
      if (!owner) return bad('email', 'Enter the email of an active tournament manager.');
      if (owner.id === t.ownerId) return bad('email', 'This tournament manager already owns this tournament.');
      t.ownerId = owner.id;
      state.sportManagers = state.sportManagers.filter(sm => !(sm.slug === t.slug && sm.accountId === owner.id));
      return [200, { tournament: { slug: t.slug, owner: person(owner) } }];
    }
    if (method === 'GET' && path === '/admin/invitations') {
      const rows = [...state.invitations].sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt) || Number(a.id) - Number(b.id));
      const { items, nextOffset } = paged(rows, offsetOf(query));
      return [200, { invitations: items, nextOffset }];
    }

    if (method === 'POST' && (m = /^\/accounts\/([^/]+)\/(disable|enable|role)$/.exec(path))) {
      const [, id, action] = m;
      if (!ID.test(id)) return [400, apiError('BAD_REQUEST', 'Malformed ID')];
      if (action === 'disable' && (typeof body?.reason !== 'string' || !body.reason.trim())) return [409, apiError('REASON_REQUIRED', 'A reason is required')];
      if (action === 'role' && !ROLES.includes(body?.role)) return bad('role', 'Choose Super Admin, Tournament Manager or Match Scorer.');
      const member = find(id);
      if (!member) return [404, apiError('NOT_FOUND', 'Account not found')];
      const ownsOne = owned(id).length > 0;
      if (action === 'enable') {
        if (member.status === 'ACTIVE') return [409, apiError('ALREADY_ACTIVE', 'The account is already active')];
        member.status = 'ACTIVE';
        return [200, { account: { id, status: 'ACTIVE' } }];
      }
      if (action === 'disable') {
        if (member.status === 'DISABLED') return [409, apiError('ALREADY_DISABLED', 'The account is already disabled')];
        if (lastSuper(member)) return [409, apiError('LAST_SUPER_ADMIN', 'Cannot disable the last active Super Admin')];
        if (ownsOne) return [409, apiError('OWNER_TRANSFER_REQUIRED', 'Transfer tournament ownership first')];
        member.status = 'DISABLED';
        dropAccess(member);
        return [200, { account: { id, status: 'DISABLED', revokedAssignmentIds: [] } }];
      }
      if (member.status === 'DISABLED') return [409, apiError('ACCOUNT_DISABLED', 'Re-enable the account first')];
      if (member.role === body.role) return bad('role', 'Choose a role different from the current role.');
      if (lastSuper(member)) return [409, apiError('LAST_SUPER_ADMIN', 'Cannot change the role of the last active Super Admin')];
      if (ownsOne) return [409, apiError('OWNER_TRANSFER_REQUIRED', 'Transfer tournament ownership first')];
      member.role = body.role;
      dropAccess(member);
      return [200, { account: { id, role: body.role, status: 'ACTIVE' }, revokedAssignmentIds: [] }];
    }

    if (method === 'POST' && path === '/invites') {
      if (!ROLES.includes(body?.role)) return [403, apiError('ROLE_FORBIDDEN', 'Not allowed to invite this role')];
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (email.length > 254 || !EMAIL.test(email)) return [400, apiError('BAD_REQUEST', 'Valid email required')];
      if (state.invitations.some(invitation => invitation.email === email)) return [409, apiError('INVITE_PENDING', 'This email already has a pending invitation')];
      const invitation = { id: String(state.nextInvitation++), email, role: body.role, status: 'PENDING', expiresAt: pgTime(Date.now() + 7 * DAY) };
      state.invitations.push({ ...invitation, invitedBy: 'Arnav Admin' });
      return [201, { invitation }];
    }
    if (method === 'POST' && (m = /^\/invites\/(\d+)\/cancel$/.exec(path))) {
      if (!ID.test(m[1])) return [400, apiError('BAD_REQUEST', 'Malformed ID')];
      const index = state.invitations.findIndex(invitation => invitation.id === m[1]);
      if (index < 0) return [409, apiError('INVITE_CLOSED', 'This invitation is no longer pending')];
      state.invitations.splice(index, 1);
      return [200, { invitation: { id: m[1], status: 'REVOKED' } }];
    }
    return undefined;
  }
  return { state, reply };
}

/** `adminFake` on the page. `before(request, state)` may return a reply first (an error, 'abort' or a held reply). */
export async function adminApi(page, { before, ...options } = {}) {
  const fake = adminFake(options);
  const requests = await mockManage(page, async request => (await before?.(request, fake.state)) || fake.reply(request) || NOT_FOUND, ADMIN_URLS);
  return { state: fake.state, requests, sent: (method, path) => requests.filter(r => r.method === method && r.path === path) };
}
