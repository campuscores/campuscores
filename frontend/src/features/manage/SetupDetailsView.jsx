import StaffShell from '../staff/StaffShell.jsx';
import { NoAccess } from '../staff/ScreenState.jsx';
import ErrorSummary from '../staff/ErrorSummary.jsx';
import Field from '../staff/Field.jsx';
import { tournamentRules, useForm } from './forms.js';
import { tournamentNav } from './manage.js';
import { stepBack, stepTitle } from './setup.js';
import './manage.css';

/**
 * Guided_Setup step 1 (Req 9.1, 9.4, 9.5): five fields; the end date defaults to the start date.
 * `onSubmit({ name, startsOn, endsOn, venue, description })` creates the Draft tournament.
 */
export default function SetupDetailsView({ role, state = 'ready', saving, error, onSubmit }) {
  const form = useForm({ name: '', startsOn: '', endsOn: '', venue: '', description: '' }, tournamentRules(), error);
  if (state === 'forbidden') return <NoAccess role={role} />;
  const save = form.submit(values => onSubmit({
    name: values.name.trim(),
    startsOn: values.startsOn,
    endsOn: values.endsOn || values.startsOn,
    venue: values.venue.trim(),
    description: values.description.trim(),
  }));
  return (
    <StaffShell role={role} title={stepTitle(1)} current={tournamentNav(role)} back={stepBack(role, null, 1)} alert={form.alert}>
      <p>Start with the name and dates. You can add sports, teams and matches in the next steps.</p>
      <form className="staff-form" noValidate onSubmit={event => (saving ? event.preventDefault() : save(event))}>
        <ErrorSummary errors={form.summary} />
        <Field label="Tournament name" autoComplete="off" maxLength={120} {...form.field('name')} />
        <Field type="date" label="Start date" {...form.field('startsOn')} />
        <Field type="date" label="End date" optional help="Leave empty for a one-day tournament." min={form.values.startsOn || undefined} {...form.field('endsOn')} />
        <Field label="Venue" optional autoComplete="off" maxLength={200} {...form.field('venue')} />
        <Field as="textarea" label="Description" optional rows={4} maxLength={1000} {...form.field('description')} />
        <div className="form-actions">
          <button type="submit" className="button-primary" aria-disabled={saving || undefined}>{saving ? 'Saving…' : 'Save and continue'}</button>
        </div>
      </form>
    </StaffShell>
  );
}
