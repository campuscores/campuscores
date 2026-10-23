import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { apiFetch } from '../../services/api.js';

const isEmptyList = data => data == null || (Array.isArray(data) && data.length === 0);

/**
 * One staff GET (design "Frontend data flow"). Loads on entry, when `path` changes and on `reload` ("Try again") only:
 * no polling (Req 22.4). `status` is 'loading', 'ready', 'empty' or 'error'; `data` is null unless ready or empty, so no
 * stale list shows after an error or during a reload (Req 14.6). `isEmpty(data)` decides 'empty' (default: null or []).
 * A response from a superseded request (older path, earlier reload, unmounted screen) is dropped, so a slow old
 * response never replaces a newer one and nothing is set after unmount. `error` is the `apiFetch` error: no `status`
 * for a network failure, else its HTTP status and code; show it with `messageFor` (Req 20.3) and, for 401, offer
 * "Sign in again" (Req 20.8). A null `path` sends nothing and stays 'loading', for a read that waits on another one.
 */
export default function useStaffData(path, getToken, isEmpty = isEmptyList) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null); // { key, data, error } of the latest finished request
  const key = `${attempt} ${path}`;
  const waiting = path == null;
  const load = useEffectEvent(async () => apiFetch(path, { token: await getToken() }));
  useEffect(() => {
    if (waiting) return undefined;
    let current = true;
    load().then(
      data => { if (current) setResult({ key, data, error: null }); },
      error => { if (current) setResult({ key, data: null, error }); },
    );
    return () => { current = false; };
  }, [key, waiting]);
  const reload = useCallback(() => setAttempt(n => n + 1), []);
  // A result for an older key means the current request is still in progress.
  const done = result?.key === key ? result : null;
  const status = !done ? 'loading' : done.error ? 'error' : isEmpty(done.data) ? 'empty' : 'ready';
  return { data: done && !done.error ? done.data : null, error: done?.error ?? null, status, reload };
}
