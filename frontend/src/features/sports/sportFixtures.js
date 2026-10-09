import * as badminton from './badminton/badmintonMatches.js';
import * as basketball from './basketball/basketballMatches.js';
import * as football from './football/footballMatches.js';
import * as lawnTennis from './lawn-tennis/lawnTennisMatches.js';
import * as tableTennis from './table-tennis/tableTennisMatches.js';
import * as volleyball from './volleyball/volleyballMatches.js';
// Each module exports scoring, liveMatches, upcomingMatches and pastMatches.
export const sportFixtures = { football, basketball, 'lawn-tennis': lawnTennis, 'table-tennis': tableTennis, badminton, volleyball };
