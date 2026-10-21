import StaffShell from '../staff/StaffShell.jsx';
import ScreenState, { NoAccess } from '../staff/ScreenState.jsx';
import ErrorSummary from '../staff/ErrorSummary.jsx';
import Field from '../staff/Field.jsx';
import { tournamentStatusLabel } from '../staff/labels.js';
import { VENUES } from '../tournaments/venues.js';
import { alertFor, tournamentRules, useForm } from './forms.js';
import { isLocked, tournamentNav, tournamentPath } from './manage.js';
import './manage.css';

const TOURNAMENT_FIELDS = ['name', 'startsOn', 'endsOn', 'venue', 'description', 'imageKey'];

// Short visible names of the Venue_Library photographs; the label names each choice, so the thumbnails are decorative.
const PHOTO_NAMES = { field: 'Football field', stadium: 'Stadium', court: 'Indoor court', tennis: 'Tennis courts', track: 'Athletics track' };

/**
 * Tournament details for the Tournament_Owner and Super_Admins (Req 9.5, 9.7, 9.8, 9.14): name, dates, venue,
 * description and the Venue_Library photograph ("Automatic" picks one by tournament ID).
 * `onSubmit({ name, startsOn, endsOn, venue, description, imageKey })`, with `imageKey` null for Automatic.
 * A `DATES_EXCLUDE_MATCHES` error shows its match count in the screen alert.
 */
export default function TournamentDetailsView({ role, state, onRetry, tournament, saving, error, status, onSubmit }) {
  if (state === 'forbidden') return <NoAccess role={role} />;
  return (
    <StaffShell role={role} title="Tournament details" current={tournamentNav(role)} status={status} alert={alertFor(error, TOURNAMENT_FIELDS)}
      back={tournament && { to: tournamentPath(tournament.slug), label: tournament.name }}>
      <ScreenState state={state} what="the tournament" onRetry={onRetry}>
        {tournament && (isLocked(tournament.status)
          ? <p>This tournament is {tournamentStatusLabel(tournament.status).toLowerCase()}, so its details cannot change.</p>
          : <DetailsForm key={tournament.slug} tournament={tournament} saving={saving} error={error} onSubmit={onSubmit} />)}
      </ScreenState>
    </StaffShell>
  );
}

function DetailsForm({ tournament, saving, error, onSubmit }) {
  const form = useForm({
    name: tournament.name, startsOn: tournament.startsOn, endsOn: tournament.endsOn,
    venue: tournament.venue ?? '', description: tournament.description ?? '', imageKey: tournament.imageKey ?? '',
  }, tournamentRules({ endRequired: true }), error);
  const save = form.submit(values => onSubmit({
    name: values.name.trim(), startsOn: values.startsOn, endsOn: values.endsOn,
    venue: values.venue.trim(), description: values.description.trim(), imageKey: values.imageKey || null,
  }));
  const photo = (key, label, image) => (
    <label className="choice photo-choice" key={key || 'automatic'}>
      <input type="radio" name={form.id('imageKey')} value={key} checked={form.values.imageKey === key} onChange={() => form.set('imageKey', key)} />
      {image ? <img src={`/assets/${image}`} alt="" width="96" height="48" loading="lazy" /> : <span className="photo-auto" aria-hidden="true" />}
      {label}
    </label>
  );
  return (
    <form className="staff-form" noValidate onSubmit={event => (saving ? event.preventDefault() : save(event))}>
      <ErrorSummary errors={form.summary} />
      <Field label="Tournament name" autoComplete="off" maxLength={120} {...form.field('name')} />
      <Field type="date" label="Start date" {...form.field('startsOn')} />
      <Field type="date" label="End date" min={form.values.startsOn || undefined} {...form.field('endsOn')} />
      <Field label="Venue" optional autoComplete="off" maxLength={200} {...form.field('venue')} />
      <Field as="textarea" label="Description" optional rows={4} maxLength={1000} {...form.field('description')} />
      <fieldset>
        <legend>Photo</legend>
        <p className="field-help">Shown on the tournament card. Automatic keeps the same photo for this tournament.</p>
        <div className="choice-list">
          {photo('', 'Automatic')}
          {Object.entries(VENUES).map(([key, venue]) => photo(key, PHOTO_NAMES[key] ?? key, venue.image))}
        </div>
      </fieldset>
      <div className="form-actions">
        <button type="submit" className="button-primary" aria-disabled={saving || undefined}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
    </form>
  );
}
