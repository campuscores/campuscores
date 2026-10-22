// Form state and on-blur checks for the manager Views. The limits repeat the API field limits (design "Field limits").
import { useId, useState } from 'react';
import { messageFor } from '../staff/labels.js';
import { dateText } from './manage.js';

/**
 * Local values of one form (Req 20.1, 20.2). `rules[name](value, values)` returns '' or a sentence that names the
 * field and the fix. `apiError` (an `apiFetch` error) shows below the field it names, else in `alert`.
 * Values stay after a failed request because the View stays mounted; remount it with a new `key` to clear it.
 * `submit(onValid, names)` returns a submit handler that checks the `names` fields (default all) and sends nothing
 * while one is invalid.
 */
export function useForm(initial, rules, apiError) {
  const prefix = useId();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [summary, setSummary] = useState([]);
  const id = name => `${prefix}-${name}`;
  const check = (name, all) => rules[name]?.(all[name], all) || '';
  function set(name, value) {
    const next = { ...values, [name]: value };
    setValues(next);
    if (errors[name]) setErrors(current => ({ ...current, [name]: check(name, next) }));
  }
  const field = name => ({
    id: id(name),
    value: values[name],
    error: errors[name] || messageFor(apiError, name) || '',
    onChange: event => set(name, event.target.value),
    onBlur: event => {
      // A press on this form's submit button checks every field itself. An error shown now would push the button down
      // before the press ends, so the click would miss it and the submit would be lost (Req 20.2).
      if (event.target.form?.querySelector('[type="submit"]:active')) return;
      setErrors(current => ({ ...current, [name]: check(name, values) }));
    },
  });
  const submit = (onValid, names = Object.keys(rules)) => event => {
    event.preventDefault();
    const found = Object.fromEntries(names.map(name => [name, check(name, values)]));
    const list = Object.keys(found).filter(name => found[name]).map(name => ({ id: id(name), message: found[name] }));
    setErrors(found);
    setSummary(list);
    if (!list.length) onValid(values);
  };
  const reset = () => { setValues(initial); setErrors({}); setSummary([]); };
  return { values, set, field, submit, reset, summary, id, alert: alertFor(apiError, Object.keys(initial)) };
}

/** The screen alert for an API error: empty when the error belongs to one of the form's `fields`. */
export const alertFor = (error, fields = []) => (fields.some(name => messageFor(error, name)) ? '' : messageFor(error) ?? '');
export const TEAM_FIELDS = ['name', 'branch', 'year'];
export const MATCH_FIELDS = ['date', 'time', 'stage', 'sideA', 'sideB', 'venue'];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const required = what => value => (String(value ?? '').trim() ? '' : `Enter ${what}.`);
const maxLength = (max, what) => value => (String(value ?? '').trim().length > max ? `Use ${max} characters or fewer for ${what}.` : '');
const all = (...checks) => (value, values) => checks.map(check => check(value, values)).find(Boolean) ?? '';

export const reasonRule = all(required('a reason'), maxLength(500, 'the reason'));
export const emailRule = value => {
  const email = value.trim();
  return !email ? 'Enter an email address.' : email.length > 254 || !EMAIL.test(email) ? 'Enter an email address like name@example.com.' : '';
};

/** Tournament details (Req 9.5). The date inputs give '' for a missing or invalid date. */
export const tournamentRules = ({ endRequired = false } = {}) => ({
  name: all(required('the tournament name'), maxLength(120, 'the name')),
  startsOn: required('the start date'),
  endsOn: (value, { startsOn }) => (!value ? (endRequired ? 'Enter the end date.' : '')
    : startsOn && value < startsOn ? 'Choose an end date on or after the start date.' : ''),
  venue: maxLength(200, 'the venue'),
  description: maxLength(1000, 'the description'),
});

/** Side_Record fields (Req 11.2, 11.4). */
export const teamRules = {
  name: all(required('the team name'), maxLength(120, 'the team name')),
  branch: maxLength(120, 'the branch'),
  year: value => (value === '' || (Number.isInteger(Number(value)) && value >= 2000 && value <= 2099) ? '' : 'Enter a year from 2000 to 2099.'),
};
export const playerRules = {
  playerName: all(required('the player name'), maxLength(120, 'the player name')),
  number: value => (value === '' || (Number.isInteger(Number(value)) && value >= 0 && value <= 99) ? '' : 'Enter a jersey number from 0 to 99.'),
};

/** Match fields (Req 12.3). `today` is the current event date (YYYY-MM-DD) when the container knows it. */
export const matchRules = (tournament, today) => ({
  date: value => (!value ? 'Enter the match date.'
    : value < tournament.startsOn || value > tournament.endsOn ? `Choose a date from ${dateText(tournament.startsOn)} to ${dateText(tournament.endsOn)}.`
    : today && value < today ? 'Choose today or a later date.' : ''),
  time: value => (value ? '' : 'Enter the match time.'),
  sideA: (value, { stage }) => (!value && stage !== 'FINAL' ? 'Choose side A.' : ''),
  sideB: (value, { stage, sideA }) => (!value && stage !== 'FINAL' ? 'Choose side B.' : value && value === sideA ? 'Choose two different sides.' : ''),
  venue: maxLength(200, 'the venue'),
});
