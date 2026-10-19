// IndexedDB side of the Offline_Queue (Req 19.2, 19.8). Records: { actionId, matchId, clientSeq, status, ...request fields }.
const DB = 'thaparlympics-operator';
let dbPromise;

const done = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const committed = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
});

export function openQueueDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('actions', { keyPath: 'actionId' }).createIndex('matchClientSeq', ['matchId', 'clientSeq']);
      db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
  }).catch(err => {
    dbPromise = undefined; // let the next call try again
    throw err;
  });
  return dbPromise;
}

/** Resolves only after the record is durably committed; await it before showing "queued". */
export async function saveAction(record) {
  const tx = (await openQueueDb()).transaction('actions', 'readwrite');
  tx.objectStore('actions').put(record);
  await committed(tx);
}

/** All stored actions for one match, in clientSeq order. */
export async function loadActions(matchId) {
  const index = (await openQueueDb()).transaction('actions').objectStore('actions').index('matchClientSeq');
  return done(index.getAll(IDBKeyRange.bound([matchId, -Infinity], [matchId, Infinity])));
}

/** This device's UUID, created once and then reused (one readwrite transaction, so two tabs agree). */
export async function deviceId() {
  const tx = (await openQueueDb()).transaction('meta', 'readwrite');
  const meta = tx.objectStore('meta');
  let id = await done(meta.get('deviceId'));
  if (!id) {
    id = crypto.randomUUID();
    meta.put(id, 'deviceId');
  }
  await committed(tx);
  return id;
}
