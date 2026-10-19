// Display fixtures only: the matches assigned to one Match Operator.
// Reuses the existing sport fixture modules (sportFixtures) so no new scoring model is introduced.
// Backend assignment, auth and sync are not implemented; this is the scorer's "My Matches" list only.
// A real assignment list will replace this once accounts and match assignments exist (see doc/prd.md).
import { sportFixtures } from '../sports/sportFixtures.js';

// Each assignment names a sport and a match id from that sport's fixtures, plus the scoring state
// this operator sees: 'live' (continue scoring), 'scheduled' (start scoring), 'completed' (submitted, read-only).
// One live + one scheduled assignment per sport so every sport's scoring page is reachable to test,
// plus a couple of completed ones. Match ids come from each sport's fixtures.
const assignments = [
  // Live — "Continue scoring"
  { sport: 'badminton', matchId: 'live-ms-iyer-khan', state: 'live' },
  { sport: 'table-tennis', matchId: 'live-ms-sharma-gupta', state: 'live' },
  { sport: 'volleyball', matchId: 'live-m-cse-ece', state: 'live' },
  { sport: 'lawn-tennis', matchId: 'live-ms-rao-singh', state: 'live' },
  { sport: 'football', matchId: 'live-m-cse-ece', state: 'live' },
  { sport: 'basketball', matchId: 'live-m-cse-ece', state: 'live' },
  // Scheduled — "Start scoring"
  { sport: 'badminton', matchId: 'up-ws-gill-verma', state: 'scheduled' },
  { sport: 'table-tennis', matchId: 'up-ws-taneja-khurana', state: 'scheduled' },
  { sport: 'volleyball', matchId: 'up-w-cse-elec', state: 'scheduled' },
  { sport: 'lawn-tennis', matchId: 'up-ws-mann-kohli', state: 'scheduled' },
  { sport: 'football', matchId: 'up-w-cse-elec', state: 'scheduled' },
  { sport: 'basketball', matchId: 'up-m-civil-mech', state: 'scheduled' },
  // Completed — "View match" (read-only)
  { sport: 'badminton', matchId: 'live-ms-mehta-bose', state: 'completed' },
  { sport: 'table-tennis', matchId: 'live-md-walia-batra', state: 'completed' },
];

const pools = {
  live: fixtures => fixtures.liveMatches,
  scheduled: fixtures => fixtures.upcomingMatches,
  completed: fixtures => fixtures.liveMatches, // 'ended' matches live in the liveMatches list in the sport fixtures
};

/**
 * Resolve each assignment to its real fixture match, tagged with sport, scorer state, and a unique
 * `key` (sport + match id). Fixtures reuse the same match id across sports, so the key — not the raw
 * match id — identifies an assignment in the dashboard and the scoring route. A real backend gives
 * each match a globally unique id and this key collapses to that id.
 */
export const assignedMatches = assignments
  .map(({ sport, matchId, state }) => {
    const match = pools[state](sportFixtures[sport]).find(m => m.id === matchId);
    return match && { ...match, sport, state, key: `${sport}__${matchId}` };
  })
  .filter(Boolean);

export const assignedBy = state => assignedMatches.filter(match => match.state === state);

/** Find an assignment by its unique key (used by the scoring route). */
export const findAssignment = key => assignedMatches.find(match => match.key === key);
