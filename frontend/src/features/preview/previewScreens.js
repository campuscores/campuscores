// Stage 1 layout preview metadata (Req 1.1 to 1.5): every layout with its role, purpose, Primary_Action, entry and
// exit points, and the preview states it supports. Each Stage 2 slice deletes the entries of the screens it connects
// (Req 1.11); fake data for each key lives in previewData.js.
//
// States: 'ready', 'empty', 'loading', 'error' and 'forbidden' ("You do not have access to this page"). Staff screens
// that read data support all five. Form-only screens read no data, so they have only 'ready' and 'forbidden'. Public
// pages have no access check, so they have no 'forbidden'; single public pages add 'not-found'.

const READS = ['ready', 'empty', 'loading', 'error', 'forbidden'];
const READS_NO_EMPTY = ['ready', 'loading', 'error', 'forbidden'];
const FORM = ['ready', 'forbidden'];
const PUBLIC_LIST = ['ready', 'empty', 'loading', 'error'];
const PUBLIC_PAGE = [...PUBLIC_LIST, 'not-found'];

export const STATE_LABELS = { ready: 'Ready', empty: 'Empty', loading: 'Loading', error: 'Error', forbidden: 'No access', 'not-found': 'Not found' };

/** One group per role. `role` is the stored role the Views get (null for public pages). */
export const GROUPS = [
  {
    title: 'Viewer screens', roleName: 'Viewer', role: null,
    screens: [
      { key: 'home', title: 'Home', states: ['ready'],
        purpose: 'See live matches and tournaments, and filter live matches by sport.', primary: 'None',
        entry: ['Wordmark and Home link on every page', 'Continue as guest on Sign in'],
        exit: ['Sport tiles filter live matches in place', 'Tournament card to Tournament', 'Header Tournaments to Tournaments', 'Header Sports to Sport page', 'Header Sign in to Sign-in choice'] },
      { key: 'tournaments', title: 'Tournaments', states: PUBLIC_LIST,
        purpose: 'Find a tournament that is live, upcoming or past.', primary: 'None',
        entry: ['Header Tournaments link'],
        exit: ['Tournament card to Tournament', 'Header Home'] },
      { key: 'tournament', title: 'Tournament', states: PUBLIC_PAGE,
        purpose: 'See the dates, venue and sports of one tournament.', primary: 'None',
        entry: ['Tournament card on Home or Tournaments'],
        exit: ['Sport tile to Tournament sport', 'Browser Back to Tournaments'] },
      { key: 'tournament-sport', title: 'Tournament sport', states: PUBLIC_PAGE,
        purpose: 'See the live, upcoming and past matches of one sport in one tournament.', primary: 'None',
        entry: ['Sport tile on Tournament'],
        exit: ['Match card to Match detail dialog', 'Browser Back to Tournament'] },
      { key: 'sport-page', title: 'Sport page', states: PUBLIC_LIST,
        purpose: 'See the matches of one sport across public tournaments.', primary: 'None',
        entry: ['Header Sports menu'],
        exit: ['Match card to Match detail dialog', 'Header Home'] },
      { key: 'match-dialog', title: 'Match detail dialog', states: ['ready'],
        purpose: 'See the score details of one match.', primary: 'Close',
        entry: ['Match card on Sport page or Tournament sport'],
        exit: ['Close or Escape returns to the page it opened from'] },
    ],
  },
  {
    title: 'Match Scorer screens', roleName: 'Match Scorer', role: 'MATCH_OPERATOR',
    // Existing screens: their captures come from the mocked operator browser specs, with the new staff navigation.
    screens: [
      { key: 'my-matches', title: 'My Matches', states: [], capturedBySpecs: true,
        purpose: 'See the matches assigned to you and open one to score it.', primary: 'None: each match has its own Score link',
        entry: ['Start screen after sign-in', 'Staff navigation: My Matches'],
        exit: ['Score link to Score console', 'Staff navigation: Account'] },
      { key: 'score-console', title: 'Score console', states: [], capturedBySpecs: true,
        purpose: 'Choose the format, start the match and record each point.', primary: 'Start match, then the score buttons',
        entry: ['Score link on My Matches', 'Score on Matches, for a manager who holds the assignment'],
        exit: ['Back to My Matches', 'Back to Matches, for a manager'] },
    ],
  },
  {
    title: 'Tournament Manager screens', roleName: 'Tournament Manager', role: 'TOURNAMENT_MANAGER',
    screens: [
      { key: 'assign-scorer', title: 'Assign scorer', states: READS_NO_EMPTY,
        purpose: 'Give one match its scorer.', primary: 'Assign scorer, or Reassign scorer when it has one',
        entry: ['Assign scorer on Matches, Manager home or Step 5'],
        exit: ['Invite as Match Scorer to Invite scorer', 'Back to Matches'] },
      { key: 'invite-scorer', title: 'Invite scorer', states: FORM,
        purpose: 'Invite a Match Scorer by email.', primary: 'Send invitation',
        entry: ['Staff navigation: Invite scorer', 'Invite as Match Scorer on Assign scorer', 'Invite the scorer on Step 5'],
        exit: ['Back to Manager home'] },
    ],
  },
  {
    title: 'Super Admin screens', roleName: 'Super Admin', role: 'SUPER_ADMIN',
    screens: [
      { key: 'admin-home', title: 'Admin home', states: READS,
        purpose: 'See what needs attention across all tournaments.', primary: 'Invite staff',
        entry: ['Start screen after sign-in', 'Staff navigation: Home'],
        exit: ['Pending invitations', 'Assign scorer to Assign scorer', 'See all in Matches'] },
      { key: 'all-tournaments', title: 'All tournaments', states: READS,
        purpose: 'See every tournament with its owner and sport managers.', primary: 'Create tournament',
        entry: ['Staff navigation: Tournaments'],
        exit: ['Tournament name to Tournament overview', 'Create tournament to Step 1', 'Transfer ownership opens a confirmation', 'Back to Admin home'] },
      { key: 'staff-list', title: 'Staff list', states: READS,
        purpose: 'Find any staff account.', primary: 'Invite staff',
        entry: ['Staff navigation: Staff'],
        exit: ['Name to Staff member detail', 'Invite staff', 'Back to Admin home'] },
      { key: 'invite-staff', title: 'Invite staff', states: FORM,
        purpose: 'Invite a Super Admin, Tournament Manager or Match Scorer.', primary: 'Send invitation',
        entry: ['Invite staff on Admin home, Staff list or Pending invitations'],
        exit: ['Back to Staff list'] },
      { key: 'staff-member', title: 'Staff member detail', states: READS,
        purpose: 'Change the role or access of one account.', primary: 'Change role, or Re-enable account when disabled',
        entry: ['Name on Staff list'],
        exit: ['Owned tournament to Tournament overview', 'Back to Staff list'] },
      { key: 'pending-invitations', title: 'Pending invitations', states: READS,
        purpose: 'See and cancel invitations that wait to be accepted.', primary: 'Invite staff',
        entry: ['Pending invitations on Admin home'],
        exit: ['Invite staff', 'Back to Admin home'] },
    ],
  },
  {
    title: 'Sign-in', roleName: 'Everyone', role: null,
    screens: [
      { key: 'sign-in-choice', title: 'Sign-in choice', states: ['ready'],
        purpose: 'Continue as a guest or sign in as staff.', primary: 'None: three equal choices',
        entry: ['Header Sign in'],
        exit: ['Continue as guest to Home', 'Sign in as Match Scorer to the sign-in form', 'Sign in as Tournament Manager to the sign-in form'] },
    ],
  },
];

/** Every previewable entry with its group's role; Create tournament contributes its five steps. */
export const SCREENS = GROUPS.flatMap(group => group.screens.flatMap(screen => screen.steps ?? [screen])
  .map(screen => ({ ...screen, role: group.role, roleName: group.roleName })));
export const findScreen = key => SCREENS.find(screen => screen.key === key);

/**
 * Navigation map per role (Req 1.4, design "Navigation maps"): `[screen, parent]` pairs, where the parent is the
 * screen's Back target; `start` is the role's start screen. Names that are not preview keys (such as screens already connected to the API) are shown as text.
 * `previewRole` opens the Tournament Manager screens with the Super Admin navigation.
 */
export const NAV_MAPS = [
  { roleName: 'Viewer', start: 'home', links: [
    ['tournaments', 'home'], ['tournament', 'tournaments'], ['tournament-sport', 'tournament'], ['match-dialog', 'tournament-sport'],
    ['sport-page', 'home'], ['match-dialog', 'sport-page'], ['sign-in-choice', 'home'],
  ] },
  { roleName: 'Match Scorer', start: 'my-matches', links: [['score-console', 'my-matches'], ['Account', 'my-matches']] },
  { roleName: 'Tournament Manager', start: 'Manager home', links: [
    ['Step 1 of 5: Tournament details', 'Manager home'], ['Step 2 of 5: Sports', 'Step 1 of 5: Tournament details'], ['Step 3 of 5: Teams', 'Step 2 of 5: Sports'], ['Step 4 of 5: Matches', 'Step 3 of 5: Teams'], ['Step 5 of 5: Scorers', 'Step 4 of 5: Matches'],
    ['Tournament overview', 'Manager home'], ['Tournament details', 'Tournament overview'], ['Sport setup', 'Tournament overview'], ['Teams', 'Sport setup'],
    ['Matches', 'Manager home'], ['Match editor', 'Matches'], ['assign-scorer', 'Matches'], ['score-console', 'Matches'],
    ['invite-scorer', 'Manager home'], ['Account', 'Manager home'],
  ] },
  { roleName: 'Super Admin', start: 'admin-home', previewRole: 'SUPER_ADMIN', links: [
    ['all-tournaments', 'admin-home'], ['Tournament overview', 'all-tournaments'], ['Tournament details', 'Tournament overview'], ['Sport setup', 'Tournament overview'], ['Teams', 'Sport setup'],
    ['Step 1 of 5: Tournament details', 'admin-home'], ['Step 2 of 5: Sports', 'Step 1 of 5: Tournament details'], ['Step 3 of 5: Teams', 'Step 2 of 5: Sports'], ['Step 4 of 5: Matches', 'Step 3 of 5: Teams'], ['Step 5 of 5: Scorers', 'Step 4 of 5: Matches'],
    ['Matches', 'admin-home'], ['Match editor', 'Matches'], ['assign-scorer', 'Matches'], ['score-console', 'Matches'], ['invite-scorer', 'admin-home'],
    ['staff-list', 'admin-home'], ['invite-staff', 'staff-list'], ['staff-member', 'staff-list'], ['pending-invitations', 'admin-home'], ['Account', 'admin-home'],
  ] },
];
