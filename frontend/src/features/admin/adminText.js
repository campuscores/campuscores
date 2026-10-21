// Display helpers shared by the Super_Admin Views. Visible text never shows a stored value (Req 19.4).
import { sideName } from '../operator/operatorMatches.js';

/** Stored role values in the order of the Invite staff choice (design "Super_Admin screens"). */
export const ROLES = ['SUPER_ADMIN', 'TOURNAMENT_MANAGER', 'MATCH_OPERATOR'];
export const ROLE_HELP = {
  SUPER_ADMIN: 'Manages every tournament and all staff accounts.',
  TOURNAMENT_MANAGER: 'Runs the tournaments they create and the sports they are added to.',
  MATCH_OPERATOR: 'Scores the matches they are assigned.',
};

export const personName = person => person?.name || person?.email || '';
export const matchName = match => `${sideName(match, 0)} vs ${sideName(match, 1)}`;
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Same pattern and limit as POST /api/invites (backend/src/routes/invites.js); the API stays the authority.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const emailError = value => {
  const email = value.trim();
  return email.length <= 254 && EMAIL.test(email) ? '' : 'Enter an email address, like name@example.com.';
};
