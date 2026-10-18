// Display fixtures only: the matches assigned to one Match Operator.
// Reuses the existing sport fixture modules (sportFixtures) so no new scoring model is introduced.
// Backend assignment, auth and sync are not implemented; this is the scorer's "My Matches" list only.
// A real assignment list will replace this once accounts and match assignments exist (see doc/prd.md).
import { sportFixtures } from '../sports/sportFixtures.js';

// Each assignment names a sport and a match id from that sport's fixtures, plus the scoring state
// this operator sees: 'live' (continue scoring), 'scheduled' (start scoring), 'completed' (submitted, read-only).
const assignments = [
  { sport: 'football', matchId: 'live-m-cse-ece', state: 'live' },
  { sport: 'badminton', matchId: 'live-ms-iyer-khan', state: 'live' },
  { sport: 'basketball', matchId: 'up-w-cse-elec', state: 'scheduled' },
  { sport: 'volleyball', matchId: 'up-m-civil-mech', state: 'scheduled' },
  { sport: 'table-tennis', matchId: 'up-ms-saluja-anand', state: 'scheduled' },
  { sport: 'lawn-tennis', matchId: 'up-ws-mann-kohli', state: 'scheduled' },
  { sport: 'badminton', matchId: 'live-ms-mehta-bose', state: 'completed' },
  { sport: 'table-tennis', matchId: 'live-md-walia-batra', state: 'completed' },
];

const pools = {
  live: fixtures => fixtures.liveMatches,
  scheduled: fixtures => fixtures.upcomingMatches,
  completed: fixtures => fixtures.liveMatches, // 'ended' matches live in the liveMatches list in the sport fixtures
};

/** Resolve each assignment to its real fixture match, tagged with sport and scorer state. */
export const assignedMatches = assignments
  .map(({ sport, matchId, state }) => {
    const match = pools[state](sportFixtures[sport]).find(m => m.id === matchId);
    return match && { ...match, sport, state };
  })
  .filter(Boolean);

export const assignedBy = state => assignedMatches.filter(match => match.state === state);
