import { useAuth, useClerk } from '@clerk/react';

/**
 * Clerk access for staff containers, which load only in the lazy auth chunk (Req 4.1). `getToken` feeds `useStaffData`,
 * `useMutation` and `useMe`; `signInAgain()` opens the Clerk sign-in modal after a 401, so the page and its entered
 * values stay and nothing is resent until the user submits again (Req 20.8). Views stay Clerk-free and receive
 * `signInAgain` as a prop.
 */
export default function useStaffAuth() {
  const { getToken } = useAuth();
  const clerk = useClerk();
  return { getToken, signInAgain: () => clerk.openSignIn() };
}
