import { describe, expect, it } from 'vitest';
import { shouldSweep, sweep, SWEEP_WINDOW_MS } from '../src/outbox.js';
import { testCtx } from './helpers.js';

describe('shouldSweep', () => {
  const now = 1_800_000_000_000;
  it('sweeps at exactly 15 minutes and skips one ms later', () => {
    expect(shouldSweep(now, now - SWEEP_WINDOW_MS)).toBe(true);
    expect(shouldSweep(now, now - SWEEP_WINDOW_MS - 1)).toBe(false);
  });
  it('skips when no write was ever recorded', () => {
    expect(shouldSweep(now, 0)).toBe(false);
  });
});

describe('sweep', () => {
  // A Home_Room with a fixed Write_Signal age and a pool binding that records any connection attempt.
  const bindings = (ageMs) => {
    const touched = [];
    const env = {
      ROOMS: { idFromName: (name) => name, get: () => ({ lastWriteAt: async () => Date.now() - ageMs }) },
      HYPERDRIVE_UNCACHED: {
        get connectionString() {
          touched.push(true);
          throw new Error('database touched');
        },
      },
    };
    return { env, touched };
  };

  it('makes no database query when the Write_Signal is older than 15 minutes', async () => {
    const { env, touched } = bindings(SWEEP_WINDOW_MS + 60_000);
    await sweep(env, testCtx());
    expect(touched).toEqual([]);
  });

  it('opens the uncached pool when the Write_Signal is recent', async () => {
    const { env, touched } = bindings(1000);
    await expect(sweep(env, testCtx())).rejects.toThrow('database touched');
    expect(touched).toEqual([true]);
  });
});
