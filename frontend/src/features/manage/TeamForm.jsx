import { useEffect, useState } from 'react';
import ErrorSummary from '../staff/ErrorSummary.jsx';
import Field from '../staff/Field.jsx';
import { playerRules, teamRules, useForm, YEARS } from './forms.js';
import { TEAM_SPORTS } from './manage.js';

const MAX_PLAYERS = 30;
const fromTeam = team => ({ name: team?.name ?? '', branch: team?.branch ?? '', year: team?.year == null ? '' : String(team.year), players: team?.players ?? [] });
const playerText = (player, teamSport) => [player.name, teamSport && player.number != null && `number ${player.number}`, player.captain && 'captain'].filter(Boolean).join(', ');

/**
 * Side_Record form for Setup step 3 and Teams (Req 11.1 to 11.6, 19.7, 19.9): the name first, then branch, year and
 * players behind one "Add details" disclosure. Six fields at most: name, branch, year, player name, jersey number,
 * captain. `team` prefills an edit; `onCancel` adds a Cancel button. `onSubmit({ name, branch, year, players })`.
 * Player_Entries here use `number` for the jersey; the API uses `jersey`, so the container maps both ways.
 * Optional `onDirtyChange(dirty)` reports values that differ from `team` (or an empty form), for the unsaved guard;
 * optional `id` names the form for a "Try again" button outside it.
 */
export default function TeamForm({ id, sport, team, saving, error, submitLabel, onSubmit, onCancel, onDirtyChange }) {
  const form = useForm(fromTeam(team), teamRules, error);
  const player = useForm({ playerName: '', number: '', captain: false }, playerRules);
  const dirty = JSON.stringify(form.values) !== JSON.stringify(fromTeam(team))
    || player.values.playerName.trim() !== '' || player.values.number !== '';
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const [open, setOpen] = useState(Boolean(team?.branch || team?.year || team?.players?.length));
  const teamSport = TEAM_SPORTS.includes(sport);
  const players = form.values.players;
  const captain = players.find(entry => entry.captain);
  const full = players.length >= MAX_PLAYERS;
  const detailsId = form.id('details');

  const addPlayer = player.submit(({ playerName, number, captain: isCaptain }) => {
    const entry = { name: playerName.trim() };
    if (teamSport && number !== '') entry.number = Number(number);
    if (teamSport && isCaptain) entry.captain = true;
    // One captain per Side_Record (Req 11.3): a new captain replaces the current one.
    form.set('players', [...(entry.captain ? players.map(other => ({ ...other, captain: undefined })) : players), entry]);
    player.reset();
  });
  const save = form.submit(values => onSubmit({
    name: values.name.trim(),
    branch: values.branch.trim(),
    year: values.year === '' ? null : Number(values.year),
    players: values.players,
  }));

  return (
    <form id={id} className="staff-form" noValidate onSubmit={event => {
      if (saving) return event.preventDefault();
      if (form.values.branch || form.values.year) setOpen(true);
      save(event);
    }}>
      <ErrorSummary errors={form.summary} />
      <Field label={teamSport ? 'Team name' : 'Name'} help={teamSport ? undefined : 'One player, or a pair of players for doubles.'}
        autoComplete="off" maxLength={120} autoFocus={Boolean(team)} {...form.field('name')} />
      <div>
        <button type="button" className="button-text" aria-expanded={open} aria-controls={detailsId} onClick={() => setOpen(!open)}>Add details</button>
      </div>
      <div id={detailsId} className="staff-form" hidden={!open}>
        <Field label="Branch" optional autoComplete="off" maxLength={120} {...form.field('branch')} />
        <Field label="Year" optional as="select" {...form.field('year')}>
          <option value="">Not set</option>
          {YEARS.map((label, index) => <option key={label} value={String(index + 1)}>{label}</option>)}
        </Field>
        <fieldset>
          <legend>{teamSport ? 'Players' : 'Player names'} <span className="field-optional">(optional, up to {MAX_PLAYERS})</span></legend>
          {players.length > 0 && (
            <ul className="player-list">
              {players.map((entry, index) => (
                <li key={`${index}-${entry.name}`}>
                  <span>{playerText(entry, teamSport)}</span>
                  <button type="button" className="button-text" onClick={() => form.set('players', players.filter((_, i) => i !== index))}>
                    Remove<span className="sr-only"> {entry.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {full ? <p>This team has {MAX_PLAYERS} players, the most it can have.</p> : (
            <div className="staff-form" onKeyDown={event => { if (event.key === 'Enter' && event.target.tagName === 'INPUT') addPlayer(event); }}>
              {/* Players are optional, so an empty name is an error only when "Add player" is pressed. */}
              <Field label="Player name" autoComplete="off" maxLength={120} {...player.field('playerName')} onBlur={undefined} />
              {teamSport && <>
                <Field label="Jersey number" optional type="number" inputMode="numeric" min={0} max={99} {...player.field('number')} />
                <label className="choice">
                  <input type="checkbox" checked={player.values.captain} onChange={event => player.set('captain', event.target.checked)} />
                  Captain
                </label>
                {captain && <p className="field-help">{captain.name} is captain. Marking another player replaces them.</p>}
              </>}
              <div><button type="button" className="button-secondary" onClick={addPlayer}>Add player</button></div>
            </div>
          )}
        </fieldset>
      </div>
      <div className="form-actions">
        <button type="submit" className="button-primary" aria-disabled={saving || undefined}>{saving ? 'Saving…' : submitLabel}</button>
        {onCancel && <button type="button" className="button-secondary" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
