// Clearly fake sample data for the Stage 1 layout preview (Req 1.7). Every person, team and tournament name ends in
// "(fake)", like the seed; emails use the reserved example.test domain. Public pages reuse the Display_Fixtures.
// Times arrive as formatted text, as the containers will pass them. This file is a Display_Fixture: the
// Event_Time_Zone guard (task 11.1) skips it, so the "IST" text may live here only.
import { sports } from '../../data/sports.js';
import { sportFixtures } from '../sports/sportFixtures.js';

/** Stands in for an accepted API request, so success notices show. Sends nothing. */
export const done = () => new Promise(resolve => setTimeout(() => resolve(true), 300));

const ZONE = 'IST';
const TODAY_TEXT = '24 Oct 2026';

const asha = { accountId: '12', name: 'Asha Verma (fake)', email: 'asha.verma@example.test' };
const ravi = { accountId: '21', name: 'Ravi Sood (fake)', email: 'ravi.sood@example.test' };
const neha = { accountId: '22', name: 'Neha Gill (fake)', email: 'neha.gill@example.test' };
const owner = { accountId: '11', name: 'Kabir Singh (fake)', email: 'kabir.singh@example.test' };

const cup = {
  slug: 'campus-cup-fake', name: 'Campus Cup (fake)', status: 'ONGOING', startsOn: '2026-10-22', endsOn: '2026-10-30',
  venue: 'Main sports complex (fake)', description: 'A sample tournament for the layout review. Every name on this page is fake.', imageKey: 'stadium',
};
const draft = { ...cup, slug: 'winter-league-fake', name: 'Winter League (fake)', status: 'DRAFT', startsOn: '2026-11-10', endsOn: '2026-11-14', description: '', imageKey: null };

const hostels = ['Hostel A (fake)', 'Hostel B (fake)', 'Hostel C (fake)', 'Hostel D (fake)'].map((name, i) => ({ id: `t${i + 1}`, name }));
const players = ['Kiran Rao (fake)', 'Meera Das (fake)', 'Dev Malik (fake)', 'Isha Nair (fake)'].map((name, i) => ({ id: `p${i + 1}`, name }));

/** One staff match row, as `GET /api/manage/matches` will return it, with formatted `when`, `date` and `time` text. */
const row = (id, sport, sides, day, time, more) => ({
  id, sport, sides, stage: null, tournament: { slug: cup.slug, name: cup.name }, venue: `Court ${id} (fake)`,
  date: `${day} Oct 2026`, time: `${time} ${ZONE}`, when: `${day} Oct 2026, ${time} ${ZONE}`,
  phase: 'upcoming', status: 'SCHEDULED', scorer: null, canEdit: true, canAssign: true, canDelete: true, ...more,
});
const live = row('1', 'football', [hostels[0], hostels[1]], 24, '14:30', { stage: 'SF1', phase: 'live', status: 'LIVE', score: '1–0', scorer: ravi, canEdit: false, canDelete: false, canScore: true });
const scheduled = row('2', 'badminton', [players[0], players[1]], 24, '17:00');
const final = row('3', 'football', [hostels[2], hostels[3]], 24, '10:00', { stage: 'SF2', phase: 'past', status: 'APPROVED', score: '3–2', scorer: neha, canEdit: false, canAssign: false, canDelete: false });
const notScored = row('4', 'badminton', [players[2], players[3]], 24, '09:00', { phase: 'past', canEdit: false, canAssign: false, canDelete: false });
const finalTbd = row('5', 'football', [hostels[0]], 26, '16:00', { stage: 'FINAL' });
const nextDay = row('6', 'badminton', [players[1], players[2]], 25, '10:00');
const group = items => ({ items, total: items.length });
const todayMatches = { live: group([live]), scheduled: group([scheduled]), final: group([final]), notScored: group([notScored]) };
const needsScorer = group([scheduled, nextDay, finalTbd]);

const sport = id => sports.find(entry => entry.id === id);
const withPhase = (matches, phase) => matches.map(match => ({ ...match, phase }));
const fixtureMatches = ({ liveMatches, upcomingMatches, pastMatches }) =>
  [...withPhase(liveMatches, 'live'), ...withPhase(upcomingMatches, 'upcoming'), ...withPhase(pastMatches, 'past')];
const badminton = sportFixtures.badminton;
const football = sportFixtures.football;

/**
 * Per preview key: `props` always reach the View (the role comes from previewScreens.js); `data` only in the ready
 * state and `empty` only in the empty state, as a container passes data only after a load. In the empty state the
 * View gets `emptyState`: 'empty' when it has its own empty state, else 'ready' with the empty data.
 */
export const PREVIEW_DATA = {
  // Viewer screens: Display_Fixtures.
  home: {},
  tournaments: {
    data: { tournaments: [
      { ...cup, phase: 'live' },
      { slug: 'river-relay-fake', name: 'River Relay (fake)', startsOn: '2026-10-20', endsOn: '2026-10-27', imageKey: 'track', phase: 'live' },
      { slug: 'winter-league-fake', name: 'Winter League (fake)', startsOn: '2026-11-10', endsOn: '2026-11-14', imageKey: 'court', phase: 'upcoming' },
      { slug: 'racquet-open-fake', name: 'Racquet Open (fake)', startsOn: '2026-11-20', endsOn: '2026-11-22', imageKey: 'tennis', phase: 'upcoming' },
      { slug: 'monsoon-cup-fake', name: 'Monsoon Cup (fake)', startsOn: '2026-08-03', endsOn: '2026-08-09', imageKey: 'field', phase: 'past' },
    ] },
    empty: { tournaments: [] },
  },
  tournament: {
    data: { tournament: { ...cup, sports: ['football', 'badminton', 'volleyball'] } },
    empty: { tournament: { ...cup, sports: [] } },
  },
  'tournament-sport': {
    props: { sport: sport('badminton'), scoring: badminton.scoring },
    data: { tournament: cup, matches: fixtureMatches(badminton) },
    empty: { tournament: cup, matches: [] },
  },
  'sport-page': {
    props: { sport: sport('football'), scoring: football.scoring },
    data: { matches: fixtureMatches(football) },
    empty: { matches: [] },
  },
  'match-dialog': {
    props: {
      sport: sport('badminton'), scoring: badminton.scoring,
      // A FINAL with one side still open shows "To be decided" (Req 12.11).
      match: { ...badminton.upcomingMatches.find(match => match.round === 'Final'), sides: [badminton.upcomingMatches[0].sides[0], { name: 'To be decided', team: 'To be decided', players: [] }] },
    },
  },
  'sign-in-choice': {},

  // Tournament Manager screens.
  'assign-scorer': { data: { match: scheduled } },
  'invite-scorer': {},

  // Super Admin screens.
  'admin-home': {
    data: { today: TODAY_TEXT, todayMatches, needsScorer, pendingInvitations: 2 },
    empty: { today: TODAY_TEXT, todayMatches: {}, needsScorer: group([]), pendingInvitations: 0 },
  },
  'all-tournaments': {
    props: { onTransferOwner: done },
    data: { tournaments: [
      { ...cup, dates: '22 Oct to 30 Oct 2026', owner, sports: [{ sport: 'football', managers: [asha] }, { sport: 'badminton', managers: [] }] },
      { ...draft, dates: '10 Nov to 14 Nov 2026', owner: asha, sports: [{ sport: 'badminton', managers: [] }] },
    ] },
    empty: { tournaments: [] },
  },
  'staff-list': {
    props: { filters: { role: '', status: '' } },
    data: { hasMore: true, staff: [
      { id: '11', ...owner, role: 'TOURNAMENT_MANAGER', status: 'ACTIVE', tournaments: [cup.name] },
      { id: '12', ...asha, role: 'TOURNAMENT_MANAGER', status: 'ACTIVE', tournaments: [cup.name, draft.name] },
      { id: '21', ...ravi, role: 'MATCH_OPERATOR', status: 'ACTIVE', tournaments: [] },
      { id: '22', ...neha, role: 'MATCH_OPERATOR', status: 'DISABLED', tournaments: [] },
    ] },
    empty: { staff: [] },
  },
  'invite-staff': {
    props: { onSubmit: async () => (await done()) && { expires: `31 Oct 2026, 14:30 ${ZONE}` } },
  },
  'staff-member': {
    props: { onChangeRole: done, onDisable: done, onEnable: done, onTransferOwner: done },
    data: { member: { id: '12', ...asha, role: 'TOURNAMENT_MANAGER', status: 'ACTIVE', owned: [], activeAssignments: 1,
      sportScope: [{ tournament: { slug: cup.slug, name: cup.name }, sport: 'football' }] } },
    // The account no longer exists.
    empty: {}, emptyState: 'empty',
  },
  'pending-invitations': {
    // This View's onCancel cancels an invitation, so it replaces the preview's dialog handler.
    props: { onCancel: done },
    data: { invitations: [
      { id: '1', email: 'new.scorer@example.test', role: 'MATCH_OPERATOR', invitedBy: asha.name, expires: `27 Oct 2026, 09:15 ${ZONE}` },
      { id: '2', email: 'coach.two@example.test', role: 'TOURNAMENT_MANAGER', invitedBy: 'Priya Kaur (fake)', expires: `30 Oct 2026, 18:00 ${ZONE}` },
    ] },
    empty: { invitations: [] },
  },
};
