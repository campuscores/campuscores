import { useId } from 'react';

/**
 * A radio choice of sport (or of tournament and sport) as its own form section, so the fields after it stay at six
 * or fewer (Req 19.7, 19.8).
 * `choices` is `[{ key, label }]`; it renders nothing when there is only one choice.
 */
export default function SportChoice({ legend, choices, value, onChange }) {
  const name = useId();
  if (choices.length < 2) return null;
  return (
    <fieldset className="staff-section-tight">
      <legend>{legend}</legend>
      <div className="choice-list">
        {choices.map(choice => (
          <label className="choice" key={choice.key}>
            <input type="radio" name={name} value={choice.key} checked={value === choice.key} onChange={() => onChange(choice.key)} />
            {choice.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
