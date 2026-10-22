import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import StaffShell from '../staff/StaffShell.jsx';
import ScreenState, { NoAccess } from '../staff/ScreenState.jsx';
import ConfirmDialog from '../staff/ConfirmDialog.jsx';
import { messageFor, sportLabel } from '../staff/labels.js';
import { formatSummary } from '../staff/formatSummary.js';
import FormatSettings from '../operator/scoring/FormatSettings.jsx';
import { DEFAULT_FORMATS, validateFormat } from '../../../../shared/scoring.mjs';
import SportManagers from './SportManagers.jsx';
import { alertFor } from './forms.js';
import { isLocked, removeManagerDialog, tournamentNav, tournamentPath } from './manage.js';
import './manage.css';

/**
 * Sport setup (Req 3.10, 10.3 to 10.8, 19.9): the Default_Format of one Tournament_Sport and, for the
 * Tournament_Owner and Super_Admins (`isOwner`), its sport managers. `sport` is `{ sport, defaultFormat, teamCount,
 * managers }`. `onSaveFormat(format)` gets a format that passed `validateFormat`; the container reports
 * "No change to save" in `status` when it equals the stored one. `confirm` is the Sport_Manager being removed.
 * Optional: `onDirtyChange(dirty)` reports unsaved format edits; `onSignInAgain` shows "Sign in again" after a 401.
 */
export default function SportSetupView({ role, state, onRetry, tournament, isOwner, sport, saving, error, status,
  onSaveFormat, confirm, onRequestRemove, onConfirm, onCancel, onAddManager, onDirtyChange, onSignInAgain }) {
  if (state === 'forbidden') return <NoAccess role={role} />;
  const name = sport ? sportLabel(sport.sport) : 'Sport';
  return (
    <StaffShell role={role} title={`${name} setup`} current={tournamentNav(role)} status={status}
      alert={confirm ? '' : alertFor(error, ['email'])}
      back={tournament && { to: tournamentPath(tournament.slug), label: tournament.name }}>
      {error?.status === 401 && onSignInAgain && (
        <div className="page-actions"><button type="button" className="button-primary" onClick={onSignInAgain}>Sign in again</button></div>
      )}
      <ScreenState state={state} what="the sport" onRetry={onRetry}>
        {tournament && sport && <>
          <section aria-labelledby="sport-format">
            <h2 id="sport-format">Scoring format</h2>
            <p>Current format: {formatSummary(sport.sport, sport.defaultFormat)}.</p>
            {isLocked(tournament.status)
              ? <p>This tournament is locked, so its formats cannot change.</p>
              : <FormatEditor key={JSON.stringify(sport.defaultFormat ?? {})} sport={sport} saving={saving} onSave={onSaveFormat} onDirtyChange={onDirtyChange} />}
            <p className="staff-meta">Scorers can still choose another official or custom format for one match before it starts. Live and final matches keep their format.</p>
          </section>

          <section className="staff-section" aria-labelledby="sport-teams">
            <h2 id="sport-teams">Teams</h2>
            <p>{sport.teamCount === 1 ? '1 team or player.' : `${sport.teamCount} teams or players.`}</p>
            <Link className="button-text" to={`${tournamentPath(tournament.slug)}/sports/${sport.sport}/teams`}>Open {name} teams</Link>
          </section>

          {isOwner && !isLocked(tournament.status) && (
            <SportManagers headingId="sport-managers" managers={(sport.managers ?? []).map(manager => ({ ...manager, sport: sport.sport }))}
              sports={[sport.sport]} saving={saving} error={error} onAdd={onAddManager} onRemove={onRequestRemove} />
          )}
        </>}
      </ScreenState>
      <ConfirmDialog open={Boolean(confirm)} {...(confirm && tournament ? removeManagerDialog(confirm, tournament.name) : { title: '' })}
        saving={saving} error={confirm ? messageFor(error) : null} onConfirm={onConfirm} onCancel={onCancel} />
    </StaffShell>
  );
}

function FormatEditor({ sport, saving, onSave, onDirtyChange }) {
  const preset = DEFAULT_FORMATS[sport.sport];
  const stored = { ...preset, ...sport.defaultFormat };
  const storedText = stored.scoreValues?.join(', ') ?? '';
  const [format, setFormat] = useState(stored);
  const [scoreText, setScoreText] = useState(storedText);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const change = (key, value) => { setFormat(current => ({ ...current, [key]: value })); setError(''); };
  const input = sport.sport === 'basketball' ? { ...format, scoreValues: scoreText.split(',').map(value => Number(value.trim())) } : format;
  // Both objects start from `stored`, so their key order matches. NaN (an empty number box) stringifies as null.
  const dirty = JSON.stringify(format) !== JSON.stringify(stored) || scoreText !== storedText;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  let preview = '';
  try { preview = formatSummary(sport.sport, validateFormat(sport.sport, input)); } catch { /* the save shows the reason */ }
  function save(event) {
    event.preventDefault();
    if (saving) return;
    try {
      onSave(validateFormat(sport.sport, input));
    } catch (err) {
      setOpen(true);
      setError(err.message);
    }
  }
  return (
    <form className="staff-form format-editor" noValidate onSubmit={save}>
      <div>
        <button type="button" className="button-text" aria-expanded={open} aria-controls="format-controls" onClick={() => setOpen(!open)}>Customize format</button>
      </div>
      <div id="format-controls" hidden={!open}>
        <p>{preview ? `New format: ${preview}.` : 'Check the values below.'}</p>
        <FormatSettings sport={sport.sport} format={format} scoreText={scoreText} onChange={change}
          onScoreText={text => { setScoreText(text); setError(''); }} />
        <button type="button" className="button-text" onClick={() => { setFormat({ ...preset }); setScoreText(preset.scoreValues?.join(', ') ?? ''); setError(''); }}>
          Use the official format
        </button>
      </div>
      {error && <p className="field-error" role="alert"><span className="sr-only">Error: </span>{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button-primary" aria-disabled={saving || undefined}>{saving ? 'Saving…' : 'Save format'}</button>
      </div>
    </form>
  );
}
