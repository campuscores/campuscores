import { AppError } from './http.js';

// Manager_Scope resolution (Requirements 3.3, 3.8, 5.2, 5.3, 5.5, 5.6, 9.15).
//
// Account IDs are bigint strings as pg returns them, so every comparison here is string
// equality. Callers must pass ownerId and sportManagerIds as the same string form.

const MANAGER = 'TOURNAMENT_MANAGER';
const SUPER_ADMIN = 'SUPER_ADMIN';

// Pure and total: decides allow/deny from loaded facts for one target.
// level is 'tournament' (owner-only actions) or 'sport' (sport-level actions).
// Super_Admin allows everything; a non-manager, non-admin role is never in scope.
// The Tournament_Owner has both levels; a Sport_Manager has only 'sport' on sports they manage.
export function scopeDecision(account, { ownerId, sportManagerIds = [] }, level) {
  const role = account?.role;
  if (role === SUPER_ADMIN) return { allow: true, reason: 'super_admin' };
  if (role !== MANAGER) return { allow: false, reason: 'not_manager' };
  const id = account.id;
  if (ownerId != null && String(ownerId) === String(id)) return { allow: true, reason: 'owner' };
  if (level === 'sport' && sportManagerIds.map(String).includes(String(id))) {
    return { allow: true, reason: 'sport_manager' };
  }
  return { allow: false, reason: 'out_of_scope' };
}

// In the write transaction: loads the owner and, for a sport target, the sport-manager rows,
// through the passed tx/client (the uncached pool the caller opened). Throws 403 SCOPE_FORBIDDEN
// when denied (Requirement 5.1 step f); resolves when allowed.
// Target is 'tournament' level when only tournamentId is given, 'sport' level when
// tournamentSportId is given (the caller resolves a match/team/assignment to its Tournament_Sport first).
export async function requireScope(tx, account, { tournamentId, tournamentSportId = null }) {
  if (account?.role === SUPER_ADMIN) return; // never SCOPE_FORBIDDEN for a Super_Admin (Requirement 5.3)
  const level = tournamentSportId != null ? 'sport' : 'tournament';

  // Resolve the owning tournament. For a sport target, derive it from the Tournament_Sport.
  let ownerId;
  if (level === 'sport') {
    const { rows } = await tx.query(
      `SELECT t.owner_account_id AS "ownerId"
       FROM tournament_sports ts JOIN tournaments t ON t.id = ts.tournament_id
       WHERE ts.id = $1`,
      [tournamentSportId],
    );
    ownerId = rows[0]?.ownerId ?? null;
  } else {
    const { rows } = await tx.query(
      `SELECT owner_account_id AS "ownerId" FROM tournaments WHERE id = $1`,
      [tournamentId],
    );
    ownerId = rows[0]?.ownerId ?? null;
  }

  let sportManagerIds = [];
  if (level === 'sport') {
    const { rows } = await tx.query(
      `SELECT account_id AS "accountId" FROM tournament_sport_managers WHERE tournament_sport_id = $1`,
      [tournamentSportId],
    );
    sportManagerIds = rows.map((r) => r.accountId);
  }

  const decision = scopeDecision(account, { ownerId, sportManagerIds }, level);
  if (!decision.allow) throw new AppError(403, 'SCOPE_FORBIDDEN', 'Out of scope');
}

// List filter (Requirement 5.5): a parameterized WHERE fragment that keeps only rows inside the
// caller's scope. tAlias is the tournaments alias, tsAlias the tournament_sports alias.
// Super_Admin gets no restriction: { text: '', params: [] }.
// A non-manager caller never reaches a manager list route, but is given a false predicate for safety.
// startIndex is the first placeholder number the caller has free, so the fragment composes with
// other parameters without string interpolation of any value. Returns the placeholders used and
// the params in the same order, so the caller appends params and continues numbering from
// startIndex + params.length.
export function scopeFilter(account, tAlias = 't', tsAlias = 'ts', startIndex = 1) {
  if (account?.role === SUPER_ADMIN) return { text: '', params: [] };
  if (account?.role !== MANAGER) return { text: 'false', params: [] };
  const p = `$${startIndex}`;
  // Owner of the tournament, or a Sport_Manager of this Tournament_Sport.
  const text = `(${tAlias}.owner_account_id = ${p}
    OR EXISTS (SELECT 1 FROM tournament_sport_managers sm
               WHERE sm.tournament_sport_id = ${tsAlias}.id AND sm.account_id = ${p}))`;
  return { text, params: [account.id] };
}
