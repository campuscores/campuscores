import { Client } from 'pg';

// One client per request; Hyperdrive pools connections to Neon.
export async function withClient(hyperdrive, ctx, fn) {
  const client = new Client({ connectionString: hyperdrive.connectionString });
  // pg re-emits socket errors (including the read after end()) as 'error'; unhandled, that crashes the request.
  // Pending and later queries still reject, so the listener only prevents the crash.
  client.on('error', () => {});
  await client.connect();
  try {
    return await fn(client);
  } finally {
    ctx.waitUntil(client.end());
  }
}

export async function withTx(client, fn) {
  await client.query('BEGIN');
  try {
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

// One Audit_Row per accepted staff mutation, in the same transaction as the write.
// A failed insert throws, so withTx rolls back both the change and the audit (Requirement 5.7).
// actorId stays non-null here, as the routes pass it; actor_label is only for System actors.
export function audit(tx, { actorId, action, entity, entityId, requestId, before = null, after = null, reason = null }) {
  return tx.query(
    `INSERT INTO admin_audit_log (actor_account_id, action, entity, entity_id, request_id, before, after, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [actorId, action, entity, entityId, requestId, before, after, reason],
  );
}
