import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { EVENT_TIME_ZONE } from '../../../../shared/time.mjs';
import { apiFetch } from '../../services/api.js';
import ConfirmDialog from '../staff/ConfirmDialog.jsx';
import ScreenState, { NoAccess } from '../staff/ScreenState.jsx';
import StaffShell from '../staff/StaffShell.jsx';
import { messageFor, sportLabel } from '../staff/labels.js';
import useMutation from '../staff/useMutation.js';
import useStaffData from '../staff/useStaffData.js';
import useUnsavedGuard from '../staff/useUnsavedGuard.js';
import SetupMatchesView from './SetupMatchesView.jsx';
import SetupScorersView from './SetupScorersView.jsx';
import SetupSportsView from './SetupSportsView.jsx';
import SetupTeamsView from './SetupTeamsView.jsx';
import { sidesText, tournamentNav, tournamentPath } from './manage.js';
import {
  alreadyDone, removeSportsDialog, setupState, setupTarget, sportChanges, sportSections, stepNumber, stepPath,
  stepTitle, teamBody, withWhen, withoutScorer,
} from './setup.js';

/*
 * Guided_Setup steps 2 to 5 at `/manage/tournaments/:slug/setup/:step` (Req 9.1 to 9.3), for the Tournament_Owner or a
 * Super_Admin. Each step mounts on its own (key = slug and step), so it reads fresh data on entry and has its own
 * unsaved guard (Req 20.7). API calls and their mapping to View props:
 *   every step  GET /manage/tournaments/:slug → { tournament, isOwner, nextStep, sports: [{ sport, defaultFormat,
 *               teamCount, matchCount, … }] }; `tournament` and `sports` pass to the View as they are.
 *   2 sports    POST /manage/tournaments/:slug/sports { sport } per added sport, DELETE …/sports/:sport per removed one;
 *               then step 3. Removing a sport that has teams asks first (its teams are deleted).
 *   3 teams     GET …/sports/:sport/teams → { teams } per sport; POST …/sports/:sport/teams with `teamBody(values)`
 *               → 201 { team }, added to the list.
 *   4 matches   also GET /manage/matches?tournament=:slug → { matches }; POST /manage/matches { tournament, sport,
 *               date, time, stage, sideA, sideB, venue } → 201 { match }, added to the list. Dates and times are
 *               India_Time; the label comes from shared/time.mjs.
 *   5 scorers   GET /manage/matches?tournament=:slug; lists Upcoming matches with no Assignment.
 * `/setup` without a step opens the API `nextStep` (Req 9.3); an unknown step opens `/setup`.
 */
export default function SetupStepPage(props) {
  const { slug, step } = useParams();
  if (step === undefined) return <OpenNextStep key={slug} slug={slug} {...props} />;
  const n = stepNumber(step);
  if (!n) return <Navigate replace to={`${tournamentPath(slug)}/setup`} />;
  const Step = STEPS[n];
  return <Step key={`${slug} ${n}`} slug={slug} {...props} />;
}

/** Several staff GETs read together, with the useStaffData rules: on entry, on a new path list and on `reload`. */
function useReads(paths, getToken) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const key = `${attempt} ${paths.join(' ')}`;
  const load = useEffectEvent(() => Promise.all(paths.map(async path => apiFetch(path, { token: await getToken() }))));
  useEffect(() => {
    let current = true;
    load().then(
      data => { if (current) setResult({ key, data, error: null }); },
      error => { if (current) setResult({ key, data: null, error }); },
    );
    return () => { current = false; };
  }, [key]);
  const reload = useCallback(() => setAttempt(n => n + 1), []);
  const done = result?.key === key ? result : null;
  return { data: done?.data ?? null, error: done?.error ?? null, status: !done ? 'loading' : done.error ? 'error' : 'ready', reload };
}

/** The tournament read every step starts from. */
const useTournament = (slug, getToken) => useStaffData(`/manage/tournaments/${encodeURIComponent(slug)}`, getToken);
const matchesPath = slug => `/manage/matches?tournament=${encodeURIComponent(slug)}`;
const sportsPath = slug => `/manage/tournaments/${encodeURIComponent(slug)}/sports`;
const sportPath = (slug, sport) => `${sportsPath(slug)}/${sport}`;
/** Teams of each tournament sport, by sport key. */
function useTeams(slug, sports, getToken) {
  const reads = useReads(sports.map(entry => `${sportPath(slug, entry.sport)}/teams`), getToken);
  const bySport = Object.fromEntries(sports.map((entry, index) => [entry.sport, reads.data?.[index]?.teams ?? []]));
  return { ...reads, bySport };
}

/** A read failed with 401: keep the page, offer "Sign in again" and "Try again" (Req 20.8). Also used by Matches. */
export function SignInScreen({ role, title, current = tournamentNav(role), error, signInAgain, onRetry }) {
  return (
    <StaffShell role={role} title={title} current={current}>
      <p role="alert">{messageFor(error)}</p>
      <div className="page-actions">
        <button type="button" className="button-primary" onClick={signInAgain}>Sign in again</button>
        <button type="button" className="button-secondary" onClick={onRetry}>Try again</button>
      </div>
    </StaffShell>
  );
}

function OpenNextStep({ slug, screen, role, getToken, signInAgain }) {
  const load = useTournament(slug, getToken);
  const { status, error } = setupState([load], load.data);
  if (error?.status === 401) return <SignInScreen role={role} title={screen.title} error={error} signInAgain={signInAgain} onRetry={load.reload} />;
  if (status === 'forbidden') return <NoAccess role={role} />;
  if (status === 'ready') return <Navigate replace to={setupTarget(slug, load.data.nextStep)} />;
  return (
    <StaffShell role={role} title={screen.title} current={tournamentNav(role)}>
      <ScreenState state={status} what="the tournament" onRetry={load.reload} />
    </StaffShell>
  );
}

function SportsStep({ slug, role, getToken, signInAgain }) {
  const navigate = useNavigate();
  const load = useTournament(slug, getToken);
  const { run, saving, error } = useMutation(getToken);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(null); // { dialog, keys } while the remove confirmation is open
  const busy = useRef(false); // one save at a time across its several requests (Req 20.6)
  const [working, setWorking] = useState(false);
  const guard = useUnsavedGuard(dirty);
  const { status, error: loadError } = setupState([load], load.data);
  const sports = load.data?.sports ?? [];
  async function save(keys) {
    if (busy.current) return;
    busy.current = true;
    setWorking(true);
    const { add, remove } = sportChanges(sports, keys);
    const calls = [
      ...add.map(sport => ({ method: 'POST', path: sportsPath(slug), body: { sport } })),
      ...remove.map(sport => ({ method: 'DELETE', path: sportPath(slug, sport) })),
    ];
    let ok = true;
    for (const call of calls) {
      const result = await run(call.path, call);
      // A sport already added or removed by an earlier, partly failed save counts as saved.
      if (!result.ok && !alreadyDone(result.error, call.method)) { ok = false; break; }
    }
    busy.current = false;
    setWorking(false);
    if (!ok) return;
    setDirty(false);
    navigate(stepPath(slug, 3));
  }
  function submit(keys) {
    const dialog = removeSportsDialog(sports, sportChanges(sports, keys).remove);
    if (dialog) setPending({ dialog, keys });
    else save(keys);
  }
  if (loadError?.status === 401) return <SignInScreen role={role} title={stepTitle(2)} error={loadError} signInAgain={signInAgain} onRetry={load.reload} />;
  return <>
    <SetupSportsView role={role} state={status} onRetry={load.reload} tournament={load.data?.tournament} sports={sports}
      saving={saving || working} error={error} onSubmit={submit} onDirty={setDirty} onSignIn={signInAgain} />
    <ConfirmDialog open={Boolean(pending)} {...pending?.dialog}
      onConfirm={() => { const { keys } = pending; setPending(null); save(keys); }} onCancel={() => setPending(null)} />
    <ConfirmDialog {...guard} />
  </>;
}

function TeamsStep({ slug, role, getToken, signInAgain }) {
  const load = useTournament(slug, getToken);
  const sports = load.data?.sports ?? [];
  const teams = useTeams(slug, sports, getToken);
  const { run, saving, error } = useMutation(getToken);
  const [added, setAdded] = useState({}); // teams saved on this page, by sport
  const [status, setStatus] = useState('');
  const [dirty, setDirty] = useState(false);
  const guard = useUnsavedGuard(dirty);
  const state = setupState([load, teams], load.data);
  const retry = () => { setAdded({}); load.reload(); teams.reload(); };
  async function addTeam(sport, values) {
    setStatus('');
    const result = await run(`${sportPath(slug, sport)}/teams`, { body: teamBody(values) });
    if (!result.ok) return;
    const { team } = result.data;
    setDirty(false);
    setAdded(current => ({ ...current, [sport]: [...(current[sport] ?? []), team] }));
    setStatus(`Added ${team.name} to ${sportLabel(sport)}.`);
  }
  if (state.error?.status === 401) return <SignInScreen role={role} title={stepTitle(3)} error={state.error} signInAgain={signInAgain} onRetry={retry} />;
  if (state.status === 'ready' && !sports.length) return <Navigate replace to={stepPath(slug, 2)} />;
  return <>
    <SetupTeamsView role={role} state={state.status} onRetry={retry} tournament={load.data?.tournament}
      sports={sports.map(({ sport }) => ({ sport, teams: [...teams.bySport[sport], ...(added[sport] ?? [])] }))}
      saving={saving} error={error} status={status} onAddTeam={addTeam} onDirty={setDirty} onSignIn={signInAgain} />
    <ConfirmDialog {...guard} />
  </>;
}

function MatchesStep({ slug, role, getToken, signInAgain }) {
  const load = useTournament(slug, getToken);
  const sports = load.data?.sports ?? [];
  const teams = useTeams(slug, sports, getToken);
  const matches = useStaffData(matchesPath(slug), getToken);
  const { run, saving, error } = useMutation(getToken);
  const [added, setAdded] = useState([]); // matches saved on this page
  const [status, setStatus] = useState('');
  const [dirty, setDirty] = useState(false);
  const guard = useUnsavedGuard(dirty);
  const state = setupState([load, teams, matches], load.data);
  const retry = () => { setAdded([]); load.reload(); teams.reload(); matches.reload(); };
  async function addMatch(sport, values) {
    setStatus('');
    const result = await run('/manage/matches', { body: { tournament: slug, sport, ...values } });
    if (!result.ok) return;
    const match = withWhen(result.data.match);
    setDirty(false);
    setAdded(current => [...current, match]);
    setStatus(`Saved ${sidesText(match)}, ${match.when}.`);
  }
  if (state.error?.status === 401) return <SignInScreen role={role} title={stepTitle(4)} error={state.error} signInAgain={signInAgain} onRetry={retry} />;
  if (state.status === 'ready' && !sports.length) return <Navigate replace to={stepPath(slug, 2)} />;
  const rows = [...(matches.data?.matches ?? []).map(withWhen), ...added];
  return <>
    <SetupMatchesView role={role} state={state.status} onRetry={retry} tournament={load.data?.tournament}
      sports={sportSections(sports, teams.bySport, rows)} zone={EVENT_TIME_ZONE.label}
      saving={saving} error={error} status={status} onAddMatch={addMatch} onDirty={setDirty} onSignIn={signInAgain} />
    <ConfirmDialog {...guard} />
  </>;
}

function ScorersStep({ slug, role, getToken, signInAgain }) {
  const navigate = useNavigate();
  const load = useTournament(slug, getToken);
  const matches = useStaffData(matchesPath(slug), getToken);
  const state = setupState([load, matches], load.data);
  const retry = () => { load.reload(); matches.reload(); };
  if (state.error?.status === 401) return <SignInScreen role={role} title={stepTitle(5)} error={state.error} signInAgain={signInAgain} onRetry={retry} />;
  const rows = withoutScorer(matches.data?.matches ?? []).map(withWhen);
  return (
    <SetupScorersView role={role} state={state.status === 'ready' && !rows.length ? 'empty' : state.status} onRetry={retry}
      tournament={load.data?.tournament} matches={rows} onFinish={() => navigate(tournamentPath(slug))} />
  );
}

const STEPS = { 2: SportsStep, 3: TeamsStep, 4: MatchesStep, 5: ScorersStep };
