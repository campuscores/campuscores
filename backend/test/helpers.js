// Shared test helpers (not a spec file, so Vitest does not collect it).
import { env } from 'cloudflare:workers';
import { vi } from 'vitest';
import worker from '../src/index.js';
import { withClient } from '../src/db.js';

// Collects waitUntil promises so each test can await client.end().
export const testCtx = () => {
  const pending = [];
  return { waitUntil: (p) => pending.push(p), passThroughOnException() {}, done: () => Promise.all(pending) };
};

export const db = async (fn) => {
  const ctx = testCtx();
  try {
    return await withClient(env.HYPERDRIVE_UNCACHED, ctx, fn);
  } finally {
    await ctx.done();
  }
};
export const one = async (text, params) => (await db((client) => client.query(text, params))).rows[0];

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rsa = () =>
  crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );

// The Worker under test trusts `keys.publicKey`; `keys.other` signs bad-signature tokens.
export const keys = { ...(await rsa()), other: (await rsa()).privateKey };
const spki = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey))));
export const jwtKeyPem = `-----BEGIN PUBLIC KEY-----\n${spki.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;

export const AZP = env.AUTHORIZED_PARTIES.split(',')[0];
// A Clerk-shaped session JWT; `claims` override or extend the defaults.
export async function signJwt(sub, claims = {}, key = keys.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const body = `${enc({ alg: 'RS256', typ: 'JWT', kid: 'ins_test' })}.${enc({
    sub,
    azp: AZP,
    sid: 'sess_test',
    iat: now - 10,
    nbf: now - 10,
    exp: now + 60,
    ...claims,
  })}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(body));
  return `${body}.${b64url(sig)}`;
}

// Calls the real Worker with the in-test public key as CLERK_JWT_KEY.
export async function api(method, path, { user, token, body } = {}) {
  const headers = {};
  const jwt = token ?? (user && (await signJwt(user)));
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const ctx = testCtx();
  const res = await worker.fetch(
    new Request(`http://example.com${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    { ...env, CLERK_JWT_KEY: jwtKeyPem },
    ctx,
  );
  await ctx.done();
  return res;
}

// Intercepts Clerk Backend API calls (api.clerk.com); `handler(method, path, body)` returns
// [status, json]. Returns the recorded calls. Spec files restore it with afterEach(vi.restoreAllMocks).
export function stubClerk(handler) {
  const realFetch = globalThis.fetch;
  const calls = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (url.hostname !== 'api.clerk.com') return realFetch(input, init);
    const text = await req.text();
    const call = { method: req.method, path: url.pathname, body: text ? JSON.parse(text) : undefined };
    calls.push(call);
    const [status, json] = handler(call);
    return new Response(JSON.stringify(json ?? {}), { status, headers: { 'Content-Type': 'application/json' } });
  });
  return calls;
}

// Clerk API JSON for a user with the given emails: [[address, 'verified' | 'unverified'], ...].
export const clerkUser = (id, emails) => ({
  object: 'user',
  id,
  email_addresses: emails.map(([email_address, status], i) => ({
    object: 'email_address',
    id: `idn_${i}`,
    email_address,
    verification: { object: 'verification', status, strategy: 'email_code' },
    linked_to: [],
  })),
});
export const clerkError = [500, { errors: [{ code: 'internal', message: 'stub failure' }] }];
