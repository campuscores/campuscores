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
  let res;
  try {
    res = await fetch(`${apiBase}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error('the server could not be reached');
  }
  const data = await res.json().catch(() => null); // empty or non-JSON body (e.g. an edge error page)
  if (res.ok) return data;
  const error = data?.error;
  throw Object.assign(new Error(error?.message ?? `the server returned status ${res.status}`), {
    status: res.status,
    code: error?.code,
    requestId: error?.requestId,
  });
}
