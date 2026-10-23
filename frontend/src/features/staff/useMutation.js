import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../services/api.js';

const IGNORED = { ok: false, ignored: true };

/**
 * Sends one staff write at a time (Req 20.6). `run(path, { method = 'POST', body })` resolves to `{ ok: true, data }`,
 * `{ ok: false, error }` (the `apiFetch` error, also kept in `error`) or `{ ok: false, ignored: true }` when a call is
 * already in progress; it never rejects. The caller closes its dialog or shows its confirmation on `ok`. The hook
 * holds no form values, so a failure keeps every entered value (Req 20.3, 20.8, 20.9); nothing is resent until the
 * caller runs again. `reset()` clears `error`, e.g. when the one dialog of a screen opens for another row.
 */
export default function useMutation(getToken) {
  const [state, setState] = useState({ saving: false, error: null });
  const busy = useRef(false); // set synchronously, so a second click in the same frame is ignored too
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const run = useCallback(async (path, { method = 'POST', body } = {}) => {
    if (busy.current) return IGNORED;
    busy.current = true;
    setState({ saving: true, error: null });
    let outcome;
    try {
      outcome = { ok: true, data: await apiFetch(path, { method, body, token: await getToken() }) };
    } catch (error) {
      outcome = { ok: false, error };
    }
    busy.current = false;
    if (mounted.current) setState({ saving: false, error: outcome.error ?? null });
    return outcome;
  }, [getToken]);
  const reset = useCallback(() => { if (!busy.current) setState({ saving: false, error: null }); }, []);
  return { run, saving: state.saving, error: state.error, reset };
}
