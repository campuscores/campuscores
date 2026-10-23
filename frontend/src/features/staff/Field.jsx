/**
 * One labelled form field: label above, optional help, the control, then the error (Req 19.5, 20.1).
 * `as` is 'input' (default), 'select' or 'textarea'; other props go to the control. The help and error are linked
 * with `aria-describedby`, and an error sets `aria-invalid`. Forms use `noValidate`, so ErrorSummary reports errors.
 */
export default function Field({ id, label, help, error, optional = false, as: Control = 'input', children, ...props }) {
  const describedBy = [help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}{optional && <span className="field-optional"> (optional)</span>}</label>
      {help && <p className="field-help" id={`${id}-help`}>{help}</p>}
      <Control id={id} aria-describedby={describedBy} aria-invalid={error ? 'true' : undefined} {...props}>{children}</Control>
      {error && <p className="field-error" id={`${id}-error`}><span className="sr-only">Error: </span>{error}</p>}
    </div>
  );
}
