import { useEffect, useId, useRef } from 'react';

/**
 * Error summary above a form: the count and one link per invalid field (Req 20.2). `errors` is `[{ id, message }]`
 * where `id` is the field's id. Keep it in state set on submit: focus moves here each time a new list arrives.
 */
export default function ErrorSummary({ errors }) {
  const box = useRef(null);
  const headingId = useId();
  useEffect(() => { if (errors.length) box.current.focus(); }, [errors]);
  if (!errors.length) return null;
  return (
    <section className="error-summary" ref={box} tabIndex={-1} aria-labelledby={headingId}>
      <h2 id={headingId}>{errors.length === 1 ? 'There is 1 problem' : `There are ${errors.length} problems`}</h2>
      <ul>
        {errors.map(error => (
          <li key={error.id}>
            {/* Focus the field directly: a hash change would add a history entry and scroll the router. */}
            <a className="button-text" href={`#${error.id}`} onClick={event => { event.preventDefault(); document.getElementById(error.id)?.focus(); }}>{error.message}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
