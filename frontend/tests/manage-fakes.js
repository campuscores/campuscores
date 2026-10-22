// Stateful fakes of the manager endpoints in backend/src/routes/manage.js, shared by manage-setup.spec.js,
// manage-matches.spec.js and staff-layout.spec.js. Each `*Fake` returns `{ state, reply(request) }`: `reply` gives a
// [status, body] pair for the paths it knows and undefined for any other path, so specs can combine fakes.
import { DEFAULT_FORMATS } from '../../shared/scoring.mjs';
import { istDate, istToUtc } from '../../shared/time.mjs';
import { apiError, mockManage } from './helpers.js';

const DAY = 86400000;
export const TODAY = istDate(Date.now());
export const LATER = istDate(Date.now() + 3 * DAY);
export const YESTERDAY = istDate(Date.now() - DAY);
const NOT_FOUND = [404, apiError('NOT_FOUND', 'Not found')];
const TEAM_SPORTS = ['football', 'basketball', 'volleyball'];

export const tournamentRow = (over = {}) => ({
  id: '7', slug: 'spring-cup', name: 'Spring Cup', status: 'DRAFT', startsOn: TODAY, endsOn: LATER,
  venue: 'Main Ground', description: null, imageKey: 'field', ...over,
});
const EMPTY_GROUP = { items: [], total: 0 };
const HOME = { today: TODAY, tournaments: [], todayMatches: { live: EMPTY_GROUP, scheduled: EMPTY_GROUP, final: EMPTY_GROUP, notScored: EMPTY_GROUP }, needsScorer: EMPTY_GROUP };

/**
 * The manager tournament, sport and team endpoints. `sports` is `[{ sport, matchCount }]`; `teams` holds the stored
 * Side_Records by sport. Stored players keep only the keys backend `validatePlayers` keeps, so a renamed field is lost
 * as on the real API.
 */
export function tournamentFake({ tournament = null, sports = [], teams = {} } = {}) {
  const state = { tournament, sports, teams, nextId: 40 };
  const teamCount = sport => (state.teams[sport] ?? []).length;
  const nextStep = () => {
    if (state.tournament.status !== 'DRAFT') return null;
    if (!state.sports.length) return 'sports';
    if (state.sports.some(entry => !teamCount(entry.sport))) return 'teams';
    return state.sports.some(entry => entry.matchCount) ? 'scorers' : 'matches';
  };
  const detail = () => ({
    tournament: state.tournament, isOwner: true, nextStep: nextStep(),
    sports: state.sports.map(({ sport, matchCount = 0 }) => ({ sport, defaultFormat: DEFAULT_FORMATS[sport], configVersion: 1, teamCount: teamCount(sport), matchCount, managers: [] })),
  });
  const players = (sport, list = []) => list.map(({ name, jersey, captain }) => ({
    name, ...(TEAM_SPORTS.includes(sport) && jersey != null && { jersey }), ...(TEAM_SPORTS.includes(sport) && captain && { captain: true }),
  }));
  const findTeam = id => Object.entries(state.teams).flatMap(([sport, list]) => list.map(team => ({ sport, team }))).find(entry => entry.team.id === id);
  function reply({ method, path, body }) {
    let m;
    if (path === '/manage/home') return [200, HOME];
    if (path === '/manage/matches') return [200, { matches: [], total: 0 }];
    if (method === 'POST' && path === '/manage/tournaments') {
      state.tournament = tournamentRow({ name: body.name, startsOn: body.startsOn, endsOn: body.endsOn || body.startsOn, venue: body.venue || null, description: body.description || null });
      return [201, { tournament: state.tournament, isOwner: true }];
    }
    if ((m = /^\/manage\/tournaments\/spring-cup(\/.*)?$/.exec(path)) && state.tournament) {
      const rest = m[1] ?? '';
      if (method === 'GET' && !rest) return [200, detail()];
      if (method === 'PATCH' && !rest) {
        state.tournament = { ...state.tournament, ...body };
        return [200, { tournament: state.tournament, isOwner: true }];
      }
      if (method === 'POST' && rest === '/status') {
        state.tournament = { ...state.tournament, status: body.status };
        return [200, { tournament: state.tournament, isOwner: true }];
      }
      if (method === 'DELETE' && !rest) return [200, { removed: { sports: state.sports.length, teams: 0, matches: 0, assignments: 0, sportManagers: 0 } }];
      if (method === 'POST' && rest === '/sports') {
        state.sports.push({ sport: body.sport, matchCount: 0 });
        return [201, { sport: body.sport, defaultFormat: DEFAULT_FORMATS[body.sport] }];
      }
      if ((m = /^\/sports\/([\w-]+)\/teams$/.exec(rest))) {
        const sport = m[1];
        if (method === 'GET') return [200, { teams: state.teams[sport] ?? [] }];
        const team = { id: String(state.nextId++), name: body.name, branch: body.branch || null, year: body.year ?? null, players: players(sport, body.players), locked: false, used: false };
        state.teams[sport] = [...(state.teams[sport] ?? []), team];
        return [201, { team }];
      }
    }
    if ((m = /^\/manage\/teams\/(\d+)$/.exec(path)) && findTeam(m[1])) {
      const { sport, team } = findTeam(m[1]);
      if (method === 'DELETE') {
        state.teams[sport] = state.teams[sport].filter(other => other !== team);
        return [200, { removed: true }];
      }
      Object.assign(team, { name: body.name, branch: body.branch || null, year: body.year ?? null, players: players(sport, body.players) });
      return [200, { team }];
    }
    return undefined;
  }
  return { state, reply };
}

/** `tournamentFake` on the page. `before(request)` may return a reply first (an error or a held reply). */
export async function tournamentApi(page, { before, ...options } = {}) {
  const fake = tournamentFake(options);
  const requests = await mockManage(page, async request => (await before?.(request)) || fake.reply(request) || NOT_FOUND);
  return { state: fake.state, requests, sent: (method, path) => requests.filter(r => r.method === method && r.path === path) };
}

export const TEAMS = {
  badminton: [{ id: '11', name: 'Falcons' }, { id: '12', name: 'Hawks' }, { id: '17', name: 'Eagles' }, { id: '18', name: 'Owls' }],
  football: [{ id: '13', name: 'Lions' }, { id: '14', name: 'Tigers' }],
  'table-tennis': [{ id: '15', name: 'Aces' }, { id: '16', name: 'Spins' }],
};
export const TOURNAMENT = {
  id: '7', slug: 'spring-cup', name: 'Spring Cup', status: 'ONGOING', startsOn: TODAY, endsOn: LATER, venue: 'Main Ground',
  description: null, imageKey: 'field', sports: ['badminton', 'football', 'table-tennis'], isOwner: true,
};

/** A staff match row with the flags of backend validate.js `matchFlags` (in scope, Ongoing tournament). */
export function matchRow({ id, sport = 'badminton', stage = null, status = 'SCHEDULED', phase = 'upcoming', date = TODAY, time = '14:30',
  sides = TEAMS[sport].slice(0, 2), venue = 'Main Ground', score = null, scorer = null, hasActions = false }) {
  const open = phase === 'upcoming' && status === 'SCHEDULED';
  return {
    id, tournament: { slug: 'spring-cup', name: 'Spring Cup', status: 'ONGOING' }, sport, kind: stage ? 'BRACKET' : 'CUSTOM', stage, status, phase,
    label: phase === 'live' ? 'Live' : phase === 'upcoming' ? 'Scheduled' : status === 'SCHEDULED' ? 'Not scored' : 'Final',
    scheduledAt: new Date(istToUtc(date, time)).toISOString(), date, time, when: `${time} IST`, venue, sides, score, scorer,
    assignmentId: scorer ? '91' : null, hasActions, canEdit: open, canDelete: open && !hasActions, canAssign: phase !== 'past', canScore: false,
  };
}
export const ROWS = () => [
  matchRow({ id: '21', stage: 'SF1' }),
  matchRow({ id: '22', status: 'LIVE', phase: 'live', time: '09:00', sides: TEAMS.badminton.slice(2), score: '11\u20137', scorer: { name: 'Ravi', email: 'ravi@example.com' }, hasActions: true }),
  matchRow({ id: '23', sport: 'football', status: 'APPROVED', phase: 'past', time: '08:00', score: '2\u20131', hasActions: true }),
  matchRow({ id: '24', sport: 'table-tennis', phase: 'past', date: YESTERDAY }),
];

/** The manager match endpoints, with GET /manage/tournaments and the side choices of TEAMS. */
export function matchesFake() {
  const state = { matches: ROWS() };
  const team = (sport, id) => TEAMS[sport].find(entry => entry.id === id) ?? null;
  function reply({ method, path, query, body }) {
    let m;
    if (path === '/manage/tournaments') return [200, { tournaments: [TOURNAMENT] }];
    if ((m = /^\/manage\/tournaments\/spring-cup\/sports\/([\w-]+)\/teams$/.exec(path))) {
      return [200, { teams: (TEAMS[m[1]] ?? []).map(entry => ({ ...entry, branch: null, year: null, players: [], locked: false, used: false })) }];
    }
    if (path === '/manage/matches' && method === 'GET') {
      const rows = state.matches.filter(row => (!query.tournament || row.tournament.slug === query.tournament) && (!query.sport || row.sport === query.sport)
        && (!query.date || row.date === query.date) && (!query.phase || row.phase === query.phase));
      return [200, { matches: rows, total: rows.length }];
    }
    if (path === '/manage/matches' && method === 'POST') {
      const match = matchRow({ id: '30', sport: body.sport, stage: body.stage, date: body.date, time: body.time, venue: body.venue || null, sides: [team(body.sport, body.sideA), team(body.sport, body.sideB)] });
      state.matches.push(match);
      return [201, { match }];
    }
    if ((m = /^\/manage\/matches\/(\d+)$/.exec(path))) {
      const index = state.matches.findIndex(row => row.id === m[1]);
      if (index < 0) return [404, apiError('NOT_FOUND', 'Match not found')];
      const row = state.matches[index];
      if (method === 'GET') return [200, { match: row }];
      if (method === 'DELETE') {
        state.matches.splice(index, 1);
        return [200, { removed: true }];
      }
      const match = matchRow({ id: row.id, sport: row.sport, stage: body.stage, date: body.date, time: body.time, venue: body.venue || null, sides: [team(row.sport, body.sideA), team(row.sport, body.sideB)] });
      state.matches[index] = match;
      return [200, { match }];
    }
    return undefined;
  }
  return { state, reply };
}

/** `matchesFake` on the page. `before(request, state)` may return a reply first. */
export async function matchesApi(page, { before } = {}) {
  const fake = matchesFake();
  const requests = await mockManage(page, async request => (await before?.(request, fake.state)) || fake.reply(request) || NOT_FOUND);
  return {
    state: fake.state, requests,
    sent: (method, path) => requests.filter(r => r.method === method && r.path === path),
    lastList: () => requests.filter(r => r.method === 'GET' && r.path === '/manage/matches').at(-1)?.query,
  };
}
