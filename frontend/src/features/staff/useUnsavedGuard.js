import { useEffect } from 'react';
import { useBlocker } from 'react-router';

/**
 * Asks before a dirty form is left (Req 20.7). In-app links and Back are held by `useBlocker` (needs the data router in
 * main.jsx); reload and tab close get the browser's own `beforeunload` prompt. A navigation to the same path and query
 * (for example Clerk returning to this page after "Sign in again") is not held. Returns the props of the screen's
 * `ConfirmDialog`: `<ConfirmDialog {...useUnsavedGuard(dirty)} />`. Cancel keeps the user and every value on the page.
 * A navigation held just before `dirty` turned false (save, then navigate) goes through without a prompt.
 */
export default function useUnsavedGuard(dirty) {
  const blocker = useBlocker(({ currentLocation: from, nextLocation: to }) =>
    dirty && (from.pathname !== to.pathname || from.search !== to.search));
  const held = blocker.state === 'blocked';
  useEffect(() => {
    if (held && !dirty) blocker.proceed();
  }, [held, dirty, blocker]);
  useEffect(() => {
    if (!dirty) return;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  return {
    open: held && dirty,
    title: 'Leave without saving?',
    effects: ['Your changes on this page will be lost.'],
    confirmLabel: 'Leave without saving',
    danger: true,
    onConfirm: () => blocker.proceed(),
    onCancel: () => blocker.reset(),
  };
}
