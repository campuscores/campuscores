import ErrorSummary from '../staff/ErrorSummary.jsx';
import Field from '../staff/Field.jsx';
import { sportLabel } from '../staff/labels.js';
import DataList from './DataList.jsx';
import { emailRule, useForm } from './forms.js';

/**
 * Sport managers of a tournament, for Tournament overview and Sport setup (Req 3.4, 3.7, 3.10). Render it only for
 * the Tournament_Owner and Super_Admins. Managers are added by exact email; there is no list or search of
 * Tournament_Managers. `managers` is `[{ sport, accountId, name, email }]`; `sports` lists the sport keys that can
 * take a manager (a sport choice appears only for more than one). `onAdd({ sport, email })`; `onRemove(manager)`
 * asks the screen to open its confirmation dialog.
 */
export default function SportManagers({ headingId, managers, sports, saving, error, onAdd, onRemove }) {
  const form = useForm({ sport: sports[0] ?? '', email: '' }, { email: emailRule }, error);
  const several = sports.length > 1;
  const columns = [
    ...(several ? [{ label: 'Sport', cell: manager => sportLabel(manager.sport) }] : []),
    { label: 'Name', cell: manager => manager.name || manager.email },
    { label: 'Email', cell: manager => manager.email },
  ];
  return (
    <section className="staff-section" aria-labelledby={headingId}>
      <h2 id={headingId}>Sport managers</h2>
      <p>Sport managers can change the teams, matches and scorers of their sport. They cannot change the tournament.</p>
      {managers.length
        ? <DataList label="Sport managers" rows={managers} rowKey={manager => `${manager.sport}-${manager.accountId}`} columns={columns}
            actions={manager => <button type="button" className="button-text" onClick={() => onRemove(manager)}>Remove<span className="sr-only"> {manager.name || manager.email}</span></button>} />
        : <p>No sport managers yet.</p>}
      <h3>Add a sport manager</h3>
      <form className="staff-form" noValidate onSubmit={form.submit(values => { if (!saving) onAdd({ sport: values.sport, email: values.email.trim().toLowerCase() }); })}>
        <ErrorSummary errors={form.summary} />
        {several && (
          <Field as="select" label="Sport" {...form.field('sport')}>
            {sports.map(sport => <option key={sport} value={sport}>{sportLabel(sport)}</option>)}
          </Field>
        )}
        <Field type="email" label="Email" help="The email of an active Tournament Manager account." autoComplete="off" maxLength={254} {...form.field('email')} />
        <div className="form-actions">
          <button type="submit" className="button-secondary" aria-disabled={saving || undefined}>Add sport manager</button>
        </div>
      </form>
    </section>
  );
}
