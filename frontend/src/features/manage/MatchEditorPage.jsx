import { useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { EVENT_TIME_ZONE, istDate } from '../../../../shared/time.mjs';
import ConfirmDialog from '../staff/ConfirmDialog.jsx';
import { sportLabel } from '../staff/labels.js';
import useMutation from '../staff/useMutation.js';
import useStaffData from '../staff/useStaffData.js';
import useUnsavedGuard from '../staff/useUnsavedGuard.js';
import MatchEditorView from './MatchEditorView.jsx';
import { SignInScreen } from './SetupStepPage.jsx';
import { isLocked, sidesText } from './manage.js';
import { combined, isForbidden, withWhen } from './setup.js';

/*
 * Match editor at `/manage/matches/new` (`?tournament=&sport=`) and `/manage/matches/:matchId` (Req 12.1 to 12.11,
 * 14.3, 14.4). API calls and their mapping to View props:
 *   both   GET /manage/tournaments → { tournaments: [{ slug, name, status, startsOn, endsOn, venue, sports: [key] }] }
 *          (sports in the caller's scope); the match's or chosen tournament passes as `tournament`, so MatchForm
 *          prefills a new match with its start date and venue and bounds the date by its dates.
 *          GET /manage/tournaments/:slug/sports/:sport/teams → { teams: [{ id, name }] } for the side choices.
 *   new    POST /manage/matches { tournament, sport, date, time, stage, sideA, sideB, venue } → 201 { match }; then
 *          Matches of that tournament and sport, with a status sentence.
 *   edit   GET /manage/matches/:id → { match } (staff match row with `date`, `time` in India_Time and the flags);
 *          PATCH /manage/matches/:id { date, time, stage, sideA, sideB, venue } → { match }, shown in place.
 *          A Live, Final or Not scored match (no `canEdit`) shows the View's read-only summary.
 *   delete DELETE /manage/matches/:id with an optional { reason } → { removed: true }; then Matches.
 * The 400 field tokens (date, time, stage, sideA, sideB, venue) are the MatchForm field names, so no rename is needed;
 * the create-only tokens `tournament` and `sport` name no field and show in the screen alert. A 409 MATCH_CLOSED or
 * TOURNAMENT_LOCKED reloads the match, so the summary replaces the form. The API reads and sends `date` and `time` in
 * India_Time (shared/time.mjs), whatever the device time zone; the zone label and today come from shared/time.mjs.
 */
export default function MatchEditorPage(props) {
  const { matchId } = useParams();
  const { search } = useLocation();
  return matchId ? <EditMatch key={matchId} matchId={matchId} {...props} /> : <NewMatch key={search} {...props} />;
}

const never = () => false; // an object response is never an empty list
const TITLE = 'Match editor';
const zone = EVENT_TIME_ZONE.label;
const tournamentsPath = '/manage/tournaments';
const matchPath = id => `/manage/matches/${encodeURIComponent(id)}`;
const teamsPath = (slug, sport) => `/manage/tournaments/${encodeURIComponent(slug)}/sports/${encodeURIComponent(sport)}/teams`;
// The India_Time date on this device's clock, read once per screen for the on-blur date check; the API decides by
// database time.
const todayNow = () => istDate(Date.now());
const listPath = (slug, sport) => `/manage/matches?${new URLSearchParams({ tournament: slug, sport })}`;

/** One choice per Tournament_Sport in scope that can take a match (not Completed or Archived), limited to `slug`. */
function sportChoices(tournaments, slug) {
  const open = tournaments.filter(t => !isLocked(t.status));
  const named = open.filter(t => t.slug === slug);
  return (named.length ? named : open).flatMap(t => (t.sports ?? []).map(sport => ({
    key: `${t.slug} ${sport}`, label: `${sportLabel(sport)} · ${t.name}`, tournament: t, sport,
  })));
}

/**
 * The reads of one screen: `loads` holds only the reads it waits on. A 401 offers "Sign in again" (Req 20.8);
 * a ROLE_FORBIDDEN or SCOPE_FORBIDDEN read hides the screen (Req 2.6).
 */
function readsOf(loads) {
  const { status, error } = combined(loads);
  return {
    signIn: loads.find(load => load.error?.status === 401)?.error,
    state: isForbidden(error) ? 'forbidden' : status,
    retry: () => loads.forEach(load => load.reload()),
  };
}

function NewMatch({ role, getToken, signInAgain }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tournaments = useStaffData(tournamentsPath, getToken, never);
  const write = useMutation(getToken);
  const [picked, setPicked] = useState(null);
  const [today] = useState(todayNow);
  const [dirty, setDirty] = useState(false);
  const guard = useUnsavedGuard(dirty);
  const choices = sportChoices(tournaments.data?.tournaments ?? [], params.get('tournament'));
  // The link's tournament and sport, else the only choice; the user's pick wins.
  const target = picked ? choices.find(c => c.key === picked)
    : choices.find(c => c.key === `${params.get('tournament')} ${params.get('sport')}`) ?? (choices.length === 1 ? choices[0] : undefined);
  const teams = useStaffData(target ? teamsPath(target.tournament.slug, target.sport) : null, getToken, never);
  const reads = readsOf(target ? [tournaments, teams] : [tournaments]);

  async function save(values) {
    const { slug } = target.tournament;
    const result = await write.run('/manage/matches', { body: { tournament: slug, sport: target.sport, ...values } });
    if (!result.ok) return;
    setDirty(false);
    const match = withWhen(result.data.match);
    navigate(listPath(slug, target.sport), { state: { status: `Saved ${sidesText(match)}, ${match.when}.` } });
  }

  if (reads.signIn) return <SignInScreen role={role} title={TITLE} current="matches" error={reads.signIn} signInAgain={signInAgain} onRetry={reads.retry} />;
  // Before a sport is chosen only the tournaments read counts; the choice stays mounted while the teams load.
  const state = tournaments.status === 'ready' && !choices.length ? 'empty' : reads.state === 'loading' && target ? 'ready' : reads.state;
  return <>
    <MatchEditorView role={role} state={state} onRetry={reads.retry}
      tournament={teams.status === 'ready' ? target?.tournament : undefined} sport={target?.sport} teams={teams.data?.teams ?? []}
      choices={choices} choice={target?.key} onChoose={key => { write.reset(); setDirty(false); setPicked(key); }}
      today={today} zone={zone} saving={write.saving} error={write.error} onSubmit={save}
      onDirty={setDirty} onSignIn={signInAgain} />
    <ConfirmDialog {...guard} />
  </>;
}

function EditMatch({ matchId, role, getToken, signInAgain }) {
  const navigate = useNavigate();
  const load = useStaffData(matchPath(matchId), getToken, never);
  const tournaments = useStaffData(tournamentsPath, getToken, never);
  const write = useMutation(getToken);
  const [saved, setSaved] = useState(null); // the PATCH response, shown in place so the form keeps focus
  const [today] = useState(todayNow);
  const [status, setStatus] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [dirty, setDirty] = useState(false);
  const guard = useUnsavedGuard(dirty);
  const row = saved ?? load.data?.match;
  const match = row ? withWhen(row) : null;
  const tournament = tournaments.data?.tournaments?.find(t => t.slug === match?.tournament?.slug);
  const teams = useStaffData(match?.canEdit && tournament ? teamsPath(tournament.slug, match.sport) : null, getToken, never);
  const reads = readsOf(match?.canEdit && tournament ? [load, tournaments, teams] : [load, tournaments]);
  const reload = () => { setSaved(null); load.reload(); };

  async function save(values) {
    setStatus('');
    const result = await write.run(matchPath(matchId), { method: 'PATCH', body: values });
    if (result.ok) {
      const next = withWhen(result.data.match);
      setDirty(false);
      setSaved(result.data.match);
      setStatus(`Saved ${sidesText(next)}, ${next.when}.`);
    } else if (['MATCH_CLOSED', 'TOURNAMENT_LOCKED'].includes(result.error?.code)) {
      setDirty(false); // the form gives way to the read-only summary
      reload();
    }
  }
  async function remove(reason) {
    setStatus('');
    const result = await write.run(matchPath(matchId), { method: 'DELETE', body: reason ? { reason } : undefined });
    if (result.ok) {
      setDirty(false);
      navigate('/manage/matches', { state: { status: `Deleted ${sidesText(match)}.` } });
    } else if ([404, 409].includes(result.error?.status)) {
      setConfirm(false); // the alert shows the error; the reloaded match shows only the controls the API still allows
      reload();
    }
  }

  if (reads.signIn) return <SignInScreen role={role} title={TITLE} current="matches" error={reads.signIn} signInAgain={signInAgain} onRetry={() => { setSaved(null); reads.retry(); }} />;
  return <>
    <MatchEditorView role={role} state={reads.state} onRetry={() => { setSaved(null); reads.retry(); }}
      match={match} tournament={tournament} sport={match?.sport} teams={teams.data?.teams ?? []}
      today={today} zone={zone} saving={write.saving} error={write.error} status={status} onSubmit={save}
      confirm={confirm} onRequestDelete={() => { write.reset(); setConfirm(true); }} onConfirm={remove}
      onCancel={() => { setConfirm(false); write.reset(); }} onDirty={setDirty} onSignIn={signInAgain} />
    <ConfirmDialog {...guard} />
  </>;
}
