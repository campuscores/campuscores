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
