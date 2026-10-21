import { useId, useState } from 'react';
import StaffShell from '../staff/StaffShell.jsx';
import ScreenState, { NoAccess } from '../staff/ScreenState.jsx';
import ErrorSummary from '../staff/ErrorSummary.jsx';
import { messageFor } from '../staff/labels.js';
import { formatSummary } from '../staff/formatSummary.js';
import { sports as SPORTS } from '../../data/sports.js';
import { tournamentNav } from './manage.js';
import { stepBack, stepTitle } from './setup.js';
import './manage.css';

/**
 * Guided_Setup step 2 (Req 9.1, 10.1, 10.8): six on/off choices, each with its Default_Format summary. A sport that
 * has matches stays on (Req 10.9). `sports` is the tournament's `[{ sport, matchCount }]`; `onSubmit(sportKeys)`.
 */
export default function SetupSportsView({ role, state, onRetry, tournament, sports = [], saving, error, onSubmit }) {
  if (state === 'forbidden') return <NoAccess role={role} />;
  return (
    <StaffShell role={role} title={stepTitle(2)} current={tournamentNav(role)} back={stepBack(role, tournament?.slug, 2)} alert={messageFor(error)}>
      <ScreenState state={state} what="the tournament" onRetry={onRetry}>
        <SportsForm key={tournament?.slug} sports={sports} saving={saving} onSubmit={onSubmit} />
      </ScreenState>
    </StaffShell>
  );
}

function SportsForm({ sports, saving, onSubmit }) {
  const prefix = useId();
  const [chosen, setChosen] = useState(() => new Set(sports.map(entry => entry.sport)));
  const [summary, setSummary] = useState([]);
  const kept = new Set(sports.filter(entry => entry.matchCount > 0).map(entry => entry.sport));
  const toggle = (sport, on) => {
    const next = new Set(chosen);
    if (on) next.add(sport); else next.delete(sport);
    setChosen(next);
    if (next.size) setSummary([]);
  };
  function save(event) {
    event.preventDefault();
    if (saving) return;
    if (!chosen.size) return setSummary([{ id: `${prefix}-${SPORTS[0].id}`, message: 'Choose at least one sport.' }]);
    onSubmit(SPORTS.map(sport => sport.id).filter(id => chosen.has(id)));
  }
  return (
    <form className="staff-form" noValidate onSubmit={save}>
      <ErrorSummary errors={summary} />
      <fieldset>
        <legend>Sports in this tournament</legend>
        <p className="field-help">Each sport starts with its official scoring format. You can change it later in Sport setup.</p>
        <div className="choice-list">
          {SPORTS.map(({ id, label }) => (
            <div key={id}>
              <label className="choice">
                <input id={`${prefix}-${id}`} type="checkbox" checked={chosen.has(id)} disabled={kept.has(id)}
                  aria-describedby={`${prefix}-${id}-help`} onChange={event => toggle(id, event.target.checked)} />
                {label}
              </label>
              <p className="field-help choice-help" id={`${prefix}-${id}-help`}>
                {formatSummary(id, sports.find(entry => entry.sport === id)?.defaultFormat)}.{kept.has(id) && ' It has matches, so it stays in the tournament.'}
              </p>
            </div>
          ))}
        </div>
      </fieldset>
      <div className="form-actions">
        <button type="submit" className="button-primary" aria-disabled={saving || undefined}>{saving ? 'Saving…' : 'Save and continue'}</button>
      </div>
    </form>
  );
}
