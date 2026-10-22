/**
 * "Load more" below a 50-row list (Req 6.2, 6.3). A failed load keeps every loaded row, says so in a live region that
 * stays mounted, and turns the button into "Try again"; a 401 also offers "Sign in again" (Req 20.3, 20.8).
 * `what` names the rows, e.g. "staff accounts". The button ignores clicks while a page loads (Req 20.6).
 */
export default function LoadMore({ what, hasMore, loading, error, onLoadMore, onSignIn }) {
  if (!hasMore) return null;
  return (
    <div className="admin-more">
      <div aria-live="assertive">
        {error && <p className="screen-error"><span className="sr-only">Error: </span>Could not load more {what}. The loaded {what} are still here.</p>}
      </div>
      <div className="page-actions">
        <button type="button" className="button-secondary" aria-disabled={loading || undefined}
          onClick={() => { if (!loading) onLoadMore(); }}>
          {loading ? 'Loading more…' : error ? 'Try again' : 'Load more'}
        </button>
        {error?.status === 401 && onSignIn && <button type="button" className="button-secondary" onClick={onSignIn}>Sign in again</button>}
      </div>
    </div>
  );
}
