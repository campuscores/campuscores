// Pure scoring rules. `now` and the window bounds come from the database; client times are never read.

// Null bound is open; start inclusive, end exclusive.
export const isWithinWindow = (now, from, until) =>
  (from == null || now >= from) && (until == null || now < until);

export function leaseDecision(lease, req, holderHasActiveAssignment) {
  if (!lease || !holderHasActiveAssignment) return 'GRANT';
  if (lease.deviceId === req.deviceId && lease.accountId === req.accountId) return 'KEEP';
  if (lease.accountId === req.accountId && req.takeover) return 'TAKEOVER';
  return 'LEASE_HELD';
}

// Same expression as doc/architecture.md (Scoring authorization chain).
export const acceptsScores = (match, account) =>
  match.status === 'LIVE' ||
  (match.status === 'REJECTED' &&
    (match.correction_route === 'OPERATOR' ||
      (match.correction_route === 'MANAGER' &&
        ['TOURNAMENT_MANAGER', 'SUPER_ADMIN'].includes(account.role))));

// Returns [status, code] for the first failed check, or null when scoring is allowed.
// ctx comes from one SELECT inside the write transaction (match FOR UPDATE, lease FOR UPDATE).
export function evaluateChain(ctx) {
  if (!ctx.userId) return [401, 'UNAUTHENTICATED'];
  if (!ctx.account) return [403, 'NOT_STAFF'];
  if (ctx.account.status !== 'ACTIVE') return [403, 'ACCOUNT_DISABLED'];
  if (!ctx.assignment) return [403, 'NOT_ASSIGNED'];
  if (!isWithinWindow(ctx.now, ctx.assignment.validFrom, ctx.assignment.validUntil)) return [403, 'OUTSIDE_WINDOW'];
  if (ctx.assignment.permission !== 'SCORE') return [403, 'PERMISSION_DENIED'];
  if (!acceptsScores(ctx.match, ctx.account)) return [409, 'SCORING_LOCKED'];
  if (!ctx.lease || ctx.lease.deviceId !== ctx.deviceId || ctx.lease.accountId !== ctx.account.id) {
    return [409, 'LEASE_REQUIRED'];
  }
  return null;
}

// The chain SELECT. Call inside the write transaction. Returns null when the match does not exist (404).
// Locking CTEs: Postgres refuses FOR UPDATE on the nullable side of an outer join, and the lease may be absent.
// shortcut: no `existing` action or `snapshot` yet (score_actions/match_snapshots arrive in task 9.1), task 9.3 joins them here.
export async function loadScoringContext(tx, matchId, clerkUserId, deviceId) {
  const { rows } = await tx.query(
    `WITH m AS (SELECT * FROM matches WHERE id = $1 FOR UPDATE),
          l AS (SELECT * FROM scorer_leases WHERE match_id = $1 FOR UPDATE)
     SELECT m.id, m.tournament_sport_id, m.status, m.correction_route, m.config_snapshot, m.config_version, m.last_seq,
            a.id AS account_id, a.status AS account_status, a.role,
            moa.valid_from, moa.valid_until, moa.permission,
            l.account_id AS lease_account_id, l.device_id, l.last_client_seq,
            now() AS now
     FROM m
     LEFT JOIN admin_accounts a ON a.clerk_user_id = $2
     LEFT JOIN match_operator_assignments moa ON moa.match_id = m.id AND moa.account_id = a.id AND moa.status = 'ACTIVE'
     LEFT JOIN l ON true`,
    [matchId, clerkUserId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    userId: clerkUserId,
    deviceId,
    now: r.now,
    match: {
      id: r.id,
      tournament_sport_id: r.tournament_sport_id,
      status: r.status,
      correction_route: r.correction_route,
      config_snapshot: r.config_snapshot,
      config_version: r.config_version,
      last_seq: r.last_seq,
    },
    account: r.account_id && { id: r.account_id, status: r.account_status, role: r.role },
    assignment: r.permission && { validFrom: r.valid_from, validUntil: r.valid_until, permission: r.permission },
    lease: r.lease_account_id && { accountId: r.lease_account_id, deviceId: r.device_id, lastClientSeq: r.last_client_seq },
  };
}
