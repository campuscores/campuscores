import ErrorSummary from '../staff/ErrorSummary.jsx';
import Field from '../staff/Field.jsx';
import { stageLabel } from '../staff/labels.js';
import { matchRules, useForm } from './forms.js';
import { dateText } from './manage.js';

const STAGES = ['', 'SF1', 'SF2', 'FINAL'];

/**
 * The six match fields for Setup step 4 and the Match editor (Req 12.1 to 12.5): date, time, stage, two sides and
 * venue. A new match starts on the tournament start date at the tournament venue. `match.date` and `match.time` are
 * the event date and time (YYYY-MM-DD, HH:MM); `zone` is the event time zone label shown with the time.
 * `onSubmit({ date, time, stage, sideA, sideB, venue })`, with null for no stage or an empty FINAL side. Optional `id`
 * names the form for a "Try again" button outside it.
 */
export default function MatchForm({ id, tournament, teams, match, today, zone, saving, error, submitLabel, onSubmit }) {
  const form = useForm(match
    ? { date: match.date, time: match.time, stage: match.stage ?? '', sideA: match.sides?.[0]?.id ?? '', sideB: match.sides?.[1]?.id ?? '', venue: match.venue ?? '' }
    : { date: tournament.startsOn, time: '', stage: '', sideA: '', sideB: '', venue: tournament.venue ?? '' },
  matchRules(tournament, today), error);
  const final = form.values.stage === 'FINAL';
  const save = form.submit(values => onSubmit({
    date: values.date,
    time: values.time,
    stage: values.stage || null,
    sideA: values.sideA || null,
    sideB: values.sideB || null,
    venue: values.venue.trim(),
  }));
  const side = (name, label) => (
    <Field as="select" label={label} optional={final} {...form.field(name)}>
      <option value="">{final ? 'To be decided' : 'Choose a side'}</option>
      {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
    </Field>
  );
  return (
    <form id={id} className="staff-form" noValidate onSubmit={event => (saving ? event.preventDefault() : save(event))}>
      <ErrorSummary errors={form.summary} />
      <Field type="date" label="Date" min={tournament.startsOn} max={tournament.endsOn}
        help={`From ${dateText(tournament.startsOn)} to ${dateText(tournament.endsOn)}.`} {...form.field('date')} />
      <Field type="time" label={`Time (${zone})`} help="Enter the time in India time, whatever the time zone of this device." {...form.field('time')} />
      <Field as="select" label="Stage" help="Choose Match for a match outside the semi-finals and final." {...form.field('stage')}>
        {STAGES.map(stage => <option key={stage} value={stage}>{stageLabel(stage || null)}</option>)}
      </Field>
      {side('sideA', 'Side A')}
      {side('sideB', 'Side B')}
      <Field label="Venue" optional autoComplete="off" maxLength={200} {...form.field('venue')} />
      <div className="form-actions">
        <button type="submit" className="button-primary" aria-disabled={saving || undefined}>{saving ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  );
}
