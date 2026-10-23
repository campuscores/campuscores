import { useRef, useState } from 'react';
import { apiFetch } from '../../services/api.js';
import useStaffData from '../staff/useStaffData.js';

/**
 * A Super_Admin list read in pages of 50 (`GET /api/admin/staff`, `GET /api/admin/invitations`): the body is
 * `{ [key]: rows, nextOffset }`, with `nextOffset` null on the last page. The first page loads through useStaffData
 * (entry, a new `path` and `reload` only). `loadMore()` appends the page at `nextOffset` and keeps every loaded row; a
 * failed page keeps them too and sets `moreError`, and calling it again retries the same offset. A second call while a
 * page loads is ignored. A reload or a new `path` starts again from the first page, and a late page for an older first
 * page is dropped.
 */
export default function usePagedList(path, key, getToken) {
  const first = useStaffData(path, getToken);
  // `from` is the first-page body these extra pages follow; `paged` is true once one extra page arrived.
  const [more, setMore] = useState({ from: null, rows: [], paged: false, nextOffset: null, loading: false, error: null });
  const busy = useRef(false);
  const own = first.data && more.from === first.data ? more : null;
  const nextOffset = own?.paged ? own.nextOffset : first.data?.nextOffset ?? null;

  async function loadMore() {
    if (busy.current || nextOffset == null) return;
    busy.current = true;
    const from = first.data;
    const keep = own ?? { rows: [], paged: false, nextOffset: null };
    setMore({ from, rows: keep.rows, paged: keep.paged, nextOffset: keep.nextOffset, loading: true, error: null });
    try {
      const page = await apiFetch(`${path}${path.includes('?') ? '&' : '?'}offset=${nextOffset}`, { token: await getToken() });
      setMore(prev => (prev.from === from
        ? { from, rows: [...keep.rows, ...(page[key] ?? [])], paged: true, nextOffset: page.nextOffset ?? null, loading: false, error: null }
        : prev));
    } catch (error) {
      setMore(prev => (prev.from === from ? { ...prev, loading: false, error } : prev));
    }
    busy.current = false;
  }

  return {
    ...first,
    rows: first.data ? [...(first.data[key] ?? []), ...(own?.rows ?? [])] : [],
    hasMore: nextOffset != null,
    loadingMore: Boolean(own?.loading),
    moreError: own?.error ?? null,
    loadMore,
  };
}
