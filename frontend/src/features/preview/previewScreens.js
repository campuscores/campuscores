// Stage 1 layout preview metadata (Req 1.1 to 1.5): every layout with its role, purpose, Primary_Action, entry and
// exit points, and the preview states it supports. Each Stage 2 slice deletes the entries of the screens it connects
// (Req 1.11); fake data for each key lives in previewData.js.
//
// States: 'ready', 'empty', 'loading', 'error' and 'forbidden' ("You do not have access to this page"). Staff screens
// that read data support all five. Form-only screens read no data, so they have only 'ready' and 'forbidden'.

export const STATE_LABELS = { ready: 'Ready', empty: 'Empty', loading: 'Loading', error: 'Error', forbidden: 'No access' };

/** One group per role. `role` is the stored role the Views get (null for public pages). */
export const GROUPS = [
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
  { roleName: 'Viewer', start: 'Home', links: [
    ['Tournaments', 'Home'], ['Tournament', 'Tournaments'], ['Tournament sport', 'Tournament'], ['Match detail dialog', 'Tournament sport'],
    ['Sport page', 'Home'], ['Match detail dialog', 'Sport page'], ['Sign-in choice', 'Home'],
  ] },
  { roleName: 'Match Scorer', start: 'my-matches', links: [['score-console', 'my-matches'], ['Account', 'my-matches']] },
  { roleName: 'Tournament Manager', start: 'Manager home', links: [
    ['Step 1 of 5: Tournament details', 'Manager home'], ['Step 2 of 5: Sports', 'Step 1 of 5: Tournament details'], ['Step 3 of 5: Teams', 'Step 2 of 5: Sports'], ['Step 4 of 5: Matches', 'Step 3 of 5: Teams'], ['Step 5 of 5: Scorers', 'Step 4 of 5: Matches'],
    ['Tournament overview', 'Manager home'], ['Tournament details', 'Tournament overview'], ['Sport setup', 'Tournament overview'], ['Teams', 'Sport setup'],
    ['Matches', 'Manager home'], ['Match editor', 'Matches'], ['Assign scorer', 'Matches'], ['score-console', 'Matches'],
    ['Invite scorer', 'Manager home'], ['Account', 'Manager home'],
  ] },
  { roleName: 'Super Admin', start: 'Admin home', previewRole: 'SUPER_ADMIN', links: [
    ['All tournaments', 'Admin home'], ['Tournament overview', 'All tournaments'], ['Tournament details', 'Tournament overview'], ['Sport setup', 'Tournament overview'], ['Teams', 'Sport setup'],
    ['Step 1 of 5: Tournament details', 'Admin home'], ['Step 2 of 5: Sports', 'Step 1 of 5: Tournament details'], ['Step 3 of 5: Teams', 'Step 2 of 5: Sports'], ['Step 4 of 5: Matches', 'Step 3 of 5: Teams'], ['Step 5 of 5: Scorers', 'Step 4 of 5: Matches'],
    ['Matches', 'Admin home'], ['Match editor', 'Matches'], ['Assign scorer', 'Matches'], ['score-console', 'Matches'], ['Invite scorer', 'Admin home'],
    ['Staff list', 'Admin home'], ['Invite staff', 'Staff list'], ['Staff member detail', 'Staff list'], ['Pending invitations', 'Admin home'], ['Account', 'Admin home'],
  ] },
];
