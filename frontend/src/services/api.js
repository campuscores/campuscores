// `?.` lets plain Node test runners import live.js, where import.meta.env does not exist.
export const apiBase = import.meta.env?.VITE_API_BASE ?? '';

/**
 * Calls `${apiBase}/api${path}` and returns the parsed JSON body (null when empty).
 * A failed call throws an Error with `status`, `code` and `requestId` from the Error_Body
 * `{ error: { code, message, requestId } }`; a network failure has no `status`.
 */
export async function apiFetch(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res, data;
  try {
    res = await fetch(`${apiBase}/api${path}`, { method, headers, signal: controller.signal, body: body === undefined ? undefined : JSON.stringify(body) });
    data = await res.json().catch(err => { if (controller.signal.aborted) throw err; return null; });
  } catch {
    throw new Error(controller.signal.aborted ? 'the server took too long to respond' : 'the server could not be reached');
  } finally {
    clearTimeout(timeout);
  }
  if (res.ok) return data;
  const error = data?.error;
  throw Object.assign(new Error(error?.message ?? `the server returned status ${res.status}`), {
    status: res.status,
    code: error?.code,
    requestId: error?.requestId,
  });
}
