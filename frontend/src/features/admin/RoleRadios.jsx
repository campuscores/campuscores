import { useId } from 'react';
import { roleLabel } from '../staff/labels.js';
import { ROLE_HELP } from './adminText.js';

/**
 * Native radio group for a staff role, each choice with one line of help (Req 19.5, 19.8). `id` goes on the first
 * radio, so an ErrorSummary link can focus the group.
 */
export default function RoleRadios({ id, legend, roles, value, error, onChange }) {
  const name = useId();
  return (
    <fieldset className="field" aria-describedby={error ? `${id}-error` : undefined}>
      <legend>{legend}</legend>
      {roles.map((role, i) => (
        <div className="admin-choice" key={role}>
          <label className="choice">
            <input type="radio" id={i === 0 ? id : undefined} name={name} value={role} checked={value === role}
              aria-describedby={`${name}-${role}`} onChange={() => onChange(role)} />
            {roleLabel(role)}
          </label>
          <p className="field-help" id={`${name}-${role}`}>{ROLE_HELP[role]}</p>
        </div>
      ))}
      {error && <p className="field-error" id={`${id}-error`}><span className="sr-only">Error: </span>{error}</p>}
    </fieldset>
  );
}
