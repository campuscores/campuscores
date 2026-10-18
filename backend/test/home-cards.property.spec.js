// Feature: backend-live-platform, Property 3: Home card list matches a reference model
// Validates: Requirements 5.1, 5.2
import { env, runInDurableObject } from 'cloudflare:test';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

// Independent model: per match, the latest accepted { card, seq }; the list holds only live entries.
function model(ops) {
  const latest = new Map();
  let seq = 0;
  const accepted = ops.map(({ matchId, card, seq: s }) => {
    const ok = Number.isSafeInteger(s) && s > (latest.get(matchId)?.seq ?? 0);
    if (ok) {
      latest.set(matchId, { card, seq: s });
      seq += 1;
    }
    return ok;
  });
  const list = [...latest.values()].filter((e) => e.card.status === 'LIVE').map((e) => ({ ...e.card, seq: e.seq }));
  return { accepted, seq, list };
}

const byMatch = (a, b) => a.matchId - b.matchId;

const op = fc.integer({ min: 1, max: 4 }).chain((matchId) =>
  fc.record({
    matchId: fc.constant(matchId),
    // Small range forces duplicate and stale seqs; 0, negatives and 1.5 are never accepted.
    seq: fc.oneof(fc.integer({ min: -1, max: 6 }), fc.constant(1.5)),
    // Plain prototype: Workers RPC cannot serialize fast-check's null-prototype records.
    card: fc.record(
      { matchId: fc.constant(matchId), status: fc.constantFrom('LIVE', 'SCHEDULED', 'FINISHED'), score: fc.nat(30) },
      { noNullPrototype: true },
    ),
  }),
);

let room = 0;

describe('Property 3: home card list matches a reference model', () => {
  it('publishCard keeps the latest accepted live card per match and ignores stale calls', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(op, { minLength: 1, maxLength: 12 }), async (ops) => {
        const stub = env.ROOMS.get(env.ROOMS.idFromName(`home-p3-${room++}`)); // fresh storage per run
        const results = [];
        for (const { matchId, card, seq } of ops) results.push(await stub.publishCard(matchId, card, seq));

        const want = model(ops);
        expect(results).toEqual(want.accepted);
        const stored = await runInDurableObject(stub, (_, state) => state.storage.get('message'));
        if (want.seq === 0) {
          expect(stored).toBeUndefined(); // nothing accepted, nothing stored or sent
          return;
        }
        const message = JSON.parse(stored);
        expect(message).toMatchObject({ type: 'snapshot', room: 'home', seq: want.seq });
        expect([...message.data].sort(byMatch)).toEqual([...want.list].sort(byMatch));
      }),
      { numRuns: 100 },
    );
  }, 60000); // 100 runs of Durable Object RPC exceed the 5 s default
});
