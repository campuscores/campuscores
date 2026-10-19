// Feature: backend-live-platform, Property 13: Score decisions keep sequence and idempotency
// Validates: Requirements 16.2, 16.3, 16.4, 16.5
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decideAction, payloadHash } from '../src/scoring.js';

// Tiny pools so duplicate actionIds, repeated payloads and the next clientSeq occur often.
const request = fc.record({
  actionId: fc.constantFrom('a1', 'a2', 'a3', 'a4', 'a5', 'a6'),
  clientSeqOffset: fc.integer({ min: -2, max: 2 }), // 1 means "the next clientSeq"
  type: fc.constantFrom('POINT', 'UNDO'),
  payload: fc.constantFrom({ side: 'A' }, { side: 'B' }, { side: 'A', points: 2 }),
});

// In-memory stand-in for the write path: stores what an ACCEPT would commit and nothing else.
async function run(requests) {
  const stored = new Map();
  const lease = { lastClientSeq: 0 };
  let lastSeq = 0;
  const accepted = [];
  for (const r of requests) {
    const req = { clientSeq: lease.lastClientSeq + r.clientSeqOffset, type: r.type, payload: r.payload };
    req.payloadHash = await payloadHash(req);
    const existing = stored.get(r.actionId) ?? null;
    const before = { size: stored.size, lastSeq, lastClientSeq: lease.lastClientSeq };
    const d = decideAction({ existing, lease, lastSeq }, req);

    if (existing) {
      if (existing.payloadHash === req.payloadHash) {
        // 16.3: same payload replays the original seq and result.
        expect(d).toEqual({ kind: 'REPLAY', seq: existing.seq, result: existing.result });
      } else {
        // 16.4: changed payload is refused.
        expect(d).toEqual({ kind: 'ERROR', status: 409, code: 'IDEMPOTENCY_MISMATCH' });
      }
    } else if (req.clientSeq !== lease.lastClientSeq + 1) {
      // 16.5: a non-next clientSeq is refused.
      expect(d).toEqual({ kind: 'ERROR', status: 409, code: 'SEQUENCE_CONFLICT' });
    } else {
      // 16.2: next Server_Sequence is last_seq + 1.
      expect(d).toEqual({ kind: 'ACCEPT', seq: lastSeq + 1 });
    }

    if (d.kind === 'ACCEPT') {
      lastSeq = d.seq;
      lease.lastClientSeq = req.clientSeq;
      stored.set(r.actionId, { seq: d.seq, payloadHash: req.payloadHash, result: { seq: d.seq, actionId: r.actionId } });
      accepted.push(d.seq);
    } else {
      // REPLAY and ERROR add nothing.
      expect({ size: stored.size, lastSeq, lastClientSeq: lease.lastClientSeq }).toEqual(before);
    }
  }
  return accepted;
}

describe('Property 13: score decisions keep sequence and idempotency', () => {
  it('accepts gapless Server_Sequences and replays or refuses everything else', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(request, { maxLength: 30 }), async (requests) => {
        const accepted = await run(requests);
        expect(accepted).toEqual(accepted.map((_, i) => i + 1));
      }),
      { numRuns: 200 },
    );
  });

  it('replays a retry with the same payload even after later actions moved the sequence on', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 50 }), fc.integer({ min: 0, max: 50 }), async (lastSeq, lastClientSeq) => {
        const req = { clientSeq: lastClientSeq - 3, type: 'POINT', payload: { side: 'A' } };
        req.payloadHash = await payloadHash(req);
        const existing = { seq: 7, payloadHash: req.payloadHash, result: { ok: true } };
        expect(decideAction({ existing, lease: { lastClientSeq }, lastSeq }, req)).toEqual({
          kind: 'REPLAY',
          seq: 7,
          result: { ok: true },
        });
      }),
      { numRuns: 100 },
    );
  });
});
