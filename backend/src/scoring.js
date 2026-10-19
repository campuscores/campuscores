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
// `actionId` and `reversesActionId` (optional) load the existing action slot and the reversal target.
// The match lock is its own statement first: a READ COMMITTED statement that waits for a row lock still
// reads the other tables from its start snapshot, so a revoke or score that committed meanwhile would be missed.
// Locking CTEs: Postgres refuses FOR UPDATE on the nullable side of an outer join, and the lease may be absent.
export async function loadScoringContext(tx, matchId, clerkUserId, deviceId, actionId = null, reversesActionId = null) {
  const locked = await tx.query('SELECT 1 FROM matches WHERE id = $1 FOR UPDATE', [matchId]);
  if (!locked.rows[0]) return null;
  const { rows } = await tx.query(
    `WITH m AS (SELECT * FROM matches WHERE id = $1 FOR UPDATE),
          l AS (SELECT * FROM scorer_leases WHERE match_id = $1 FOR UPDATE)
     SELECT m.id, m.tournament_sport_id, m.status, m.correction_route, m.config_snapshot, m.config_version, m.last_seq,
            ts.sport, t.name AS tournament_name, sa.label AS side_a, sb.label AS side_b,
            a.id AS account_id, a.status AS account_status, a.role,
            moa.valid_from, moa.valid_until, moa.permission,
            l.account_id AS lease_account_id, l.device_id, l.last_client_seq,
            e.seq AS existing_seq, e.payload_hash AS existing_hash, e.result AS existing_result,
            s.data AS snapshot,
            tg.type AS target_type, tg.payload AS target_payload,
            EXISTS (SELECT 1 FROM score_actions r WHERE r.match_id = m.id AND r.reverses_action_id = tg.action_id) AS target_reversed,
            now() AS now
     FROM m
     JOIN tournament_sports ts ON ts.id = m.tournament_sport_id
     JOIN tournaments t ON t.id = ts.tournament_id
     LEFT JOIN teams sa ON sa.id = m.side_a_team_id
     LEFT JOIN teams sb ON sb.id = m.side_b_team_id
     LEFT JOIN admin_accounts a ON a.clerk_user_id = $2
     LEFT JOIN match_operator_assignments moa ON moa.match_id = m.id AND moa.account_id = a.id AND moa.status = 'ACTIVE'
     LEFT JOIN l ON true
     LEFT JOIN score_actions e ON e.match_id = m.id AND e.action_id = $3
     LEFT JOIN match_snapshots s ON s.match_id = m.id
     LEFT JOIN score_actions tg ON tg.match_id = m.id AND tg.action_id = $4`,
    [matchId, clerkUserId, actionId, reversesActionId],
  );
  const r = rows[0];
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
      sport: r.sport,
      tournamentName: r.tournament_name,
      sides: [r.side_a, r.side_b],
    },
    account: r.account_id && { id: r.account_id, status: r.account_status, role: r.role },
    assignment: r.permission && { validFrom: r.valid_from, validUntil: r.valid_until, permission: r.permission },
    lease: r.lease_account_id && { accountId: r.lease_account_id, deviceId: r.device_id, lastClientSeq: r.last_client_seq },
    existing: r.existing_seq != null ? { seq: r.existing_seq, payloadHash: r.existing_hash, result: r.existing_result } : null,
    snapshot: r.snapshot,
    target: r.target_type != null ? { type: r.target_type, payload: r.target_payload, reversed: r.target_reversed } : null,
  };
}

// Pure decision after the chain passes. `existing` is the stored action with the same actionId, if any.
export function decideAction({ existing, lease, lastSeq }, req) {
  if (existing) {
    return existing.payloadHash === req.payloadHash
      ? { kind: 'REPLAY', seq: existing.seq, result: existing.result }
      : { kind: 'ERROR', status: 409, code: 'IDEMPOTENCY_MISMATCH' };
  }
  if (req.clientSeq !== lease.lastClientSeq + 1) return { kind: 'ERROR', status: 409, code: 'SEQUENCE_CONFLICT' };
  return { kind: 'ACCEPT', seq: lastSeq + 1 };
}

// JSON with object keys sorted at every level, so equal payloads hash equally whatever their key order.
export const canonicalJson = (v) =>
  Array.isArray(v)
    ? `[${v.map(canonicalJson).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`
      : JSON.stringify(v ?? null);

// SHA-256 hex of the canonical request fields that define an action (deviceId and actionId excluded).
export async function payloadHash({ clientSeq, type, payload, reversesActionId = null }) {
  const bytes = new TextEncoder().encode(canonicalJson({ clientSeq, type, payload, reversesActionId }));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
