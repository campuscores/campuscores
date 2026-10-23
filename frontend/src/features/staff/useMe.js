import { STAFF_NAV } from './labels.js';
import useStaffData from './useStaffData.js';

/**
 * The caller's role from one `GET /api/me` per Staff_Area mount (Req 4.6). Call it once Clerk has loaded.
 * `status`: 'loading' (show a text status and no navigation, Req 4.7); 'error' (network, 5xx or another failure: show
 * the message with "Try again" = `reload` and no screen content, Req 4.8); 'signedOut' (401: show the sign-in page,
 * Req 4.8); 'viewer' (no ACTIVE staff role, Req 4.4); 'staff' with `role` set to a `STAFF_NAV` key.
 */
export default function useMe(getToken) {
  const { data, error, status, reload } = useStaffData('/me', getToken);
  const role = STAFF_NAV[data?.role] ? data.role : null;
  const state = status === 'loading' ? 'loading'
    : error?.status === 401 ? 'signedOut'
    : error ? 'error'
    : role ? 'staff' : 'viewer';
  return { status: state, role, error, reload };
}
