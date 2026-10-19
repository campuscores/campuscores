// Offline_Queue reducer (pure, runs in Node) and IndexedDB store (runs in each browser engine).
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { emptyQueue, nextClientSeq, nextToSend, queueReducer, restoreQueue, retryDelay } from '../src/features/operator/queue.js';

const item = (clientSeq, actionId = `a${clientSeq}`) => ({ actionId, clientSeq, matchId: 'm1' });
const run = (events, state = emptyQueue) => events.reduce(queueReducer, state);
const statuses = state => state.items.map(i => `${i.actionId}:${i.status}`);

test.describe('queue reducer', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Pure Node logic: run in one project only.');

  test('keeps clientSeq order and sends one at a time (Req 19.3, 19.7)', () => {
    let s = run([{ type: 'ENQUEUE', item: item(2) }, { type: 'ENQUEUE', item: item(1) }, { type: 'ENQUEUE', item: item(1) }]);
    expect(s.items.map(i => i.clientSeq)).toEqual([1, 2]); // duplicate actionId ignored
    expect(nextToSend(s).actionId).toBe('a1');
    expect(run([{ type: 'SEND_START', actionId: 'a2' }], s)).toBe(s); // not the head
    s = run([{ type: 'SEND_START', actionId: 'a1' }], s);
    expect(nextToSend(s)).toBeNull();
    s = run([{ type: 'SEND_OK', seq: 41 }], s);
    expect(s.items[0]).toMatchObject({ actionId: 'a1', status: 'synced', seq: 41 });
    expect(nextToSend(s).actionId).toBe('a2');
    expect(nextClientSeq(s)).toBe(3);
    expect(nextClientSeq(emptyQueue, 7)).toBe(8);
  });

  for (const type of ['SEND_NETWORK_ERROR', 'SEND_5XX']) {
    test(`${type} requeues the same action with growing backoff (Req 19.6)`, () => {
      let s = run([{ type: 'ENQUEUE', item: item(1) }, { type: 'SEND_START', actionId: 'a1' }, { type }]);
      expect(statuses(s)).toEqual(['a1:queued']);
      expect(nextToSend(s).actionId).toBe('a1');
      expect(retryDelay(s, () => 0.999)).toBe(999);
      s = run([{ type: 'SEND_START', actionId: 'a1' }, { type }], s);
      expect(retryDelay(s, () => 0.999)).toBe(1998);
      s = run([{ type: 'SEND_START', actionId: 'a1' }, { type: 'SEND_OK', seq: 1 }], s);
      expect(retryDelay(s)).toBe(0);
    });
  }

  for (const [status, code] of [[401, 'UNAUTHENTICATED'], [403, 'NOT_ASSIGNED'], [409, 'SEQUENCE_CONFLICT']]) {
    test(`${status} pauses with the code and keeps every action (Req 19.5)`, () => {
      let s = run([
        { type: 'ENQUEUE', item: item(1) }, { type: 'ENQUEUE', item: item(2) },
        { type: 'SEND_START', actionId: 'a1' }, { type: 'SEND_REJECTED', status, code },
      ]);
      expect(s.paused).toBe(code);
      expect(statuses(s)).toEqual(['a1:queued', 'a2:queued']);
      expect(nextToSend(s)).toBeNull();
      s = run([{ type: 'ENQUEUE', item: item(3) }], s);
      expect(nextToSend(s)).toBeNull();
      s = run([{ type: 'RESUME' }], s);
      expect(nextToSend(s).actionId).toBe('a1');
    });
  }

  test('outcomes without a send in flight change nothing', () => {
    const s = run([{ type: 'ENQUEUE', item: item(1) }]);
    for (const type of ['SEND_OK', 'SEND_NETWORK_ERROR', 'SEND_5XX', 'SEND_REJECTED']) expect(queueReducer(s, { type, seq: 1, status: 403 })).toBe(s);
  });

  test('restore sorts records and requeues an unanswered send (Req 19.8)', () => {
    const s = restoreQueue([{ ...item(3), status: 'syncing' }, { ...item(1), status: 'synced', seq: 9 }, { ...item(2), status: 'queued' }]);
    expect(statuses(s)).toEqual(['a1:synced', 'a2:queued', 'a3:queued']);
    expect(nextToSend(s).actionId).toBe('a2');
  });
});

test.describe('queue store', () => {
  test.skip(({ isMobile }) => isMobile, 'Engine coverage comes from the desktop projects.');

  test('commits actions, reads them per match in clientSeq order and keeps one device ID', async ({ page }) => {
    await page.goto('/');
    // The preview serves built files only, so inject the store module source directly.
    const source = readFileSync(new URL('../src/features/operator/queueStore.js', import.meta.url), 'utf8');
    await page.addScriptTag({ type: 'module', content: `${source}\nwindow.queueStore = { saveAction, loadActions, deviceId };` });
    await page.waitForFunction(() => window.queueStore);
    const first = await page.evaluate(async () => {
      const { saveAction, loadActions, deviceId } = window.queueStore;
      await saveAction({ actionId: 'b', matchId: 'm1', clientSeq: 2, status: 'queued' });
      await saveAction({ actionId: 'a', matchId: 'm1', clientSeq: 1, status: 'queued' });
      await saveAction({ actionId: 'c', matchId: 'm2', clientSeq: 1, status: 'queued' });
      await saveAction({ actionId: 'a', matchId: 'm1', clientSeq: 1, status: 'synced', seq: 5 }); // same key overwrites
      return { rows: await loadActions('m1'), ids: await Promise.all([deviceId(), deviceId()]) };
    });
    expect(first.rows).toEqual([
      { actionId: 'a', matchId: 'm1', clientSeq: 1, status: 'synced', seq: 5 },
      { actionId: 'b', matchId: 'm1', clientSeq: 2, status: 'queued' },
    ]);
    expect(first.ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.ids[1]).toBe(first.ids[0]);

    await page.reload();
    await page.addScriptTag({ type: 'module', content: `${source}\nwindow.queueStore = { loadActions, deviceId };` });
    await page.waitForFunction(() => window.queueStore);
    const after = await page.evaluate(async () => ({
      rows: (await window.queueStore.loadActions('m1')).map(r => r.actionId),
      id: await window.queueStore.deviceId(),
    }));
    expect(after).toEqual({ rows: ['a', 'b'], id: first.ids[0] });
  });
});
