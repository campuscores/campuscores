// Guided_Setup steps (Req 9.1): each title reads "Step N of 5: Name"; Back opens the step before.
import { homeBack, tournamentPath } from './manage.js';

const STEPS = [['details', 'Tournament details'], ['sports', 'Sports'], ['teams', 'Teams'], ['matches', 'Matches'], ['scorers', 'Scorers']];

export const stepTitle = n => `Step ${n} of 5: ${STEPS[n - 1][1]}`;
/** Step 1 of a saved tournament is its Tournament details screen; steps 2 to 5 live under `/setup/<step>`. */
export const stepPath = (slug, n) => (n === 1 ? `${tournamentPath(slug)}/details` : `${tournamentPath(slug)}/setup/${STEPS[n - 1][0]}`);
export const stepBack = (role, slug, n) => (n === 1 ? homeBack(role)
  : n === 2 ? { to: stepPath(slug, 1), label: 'Tournament details' }
  : { to: stepPath(slug, n - 1), label: stepTitle(n - 1) });
