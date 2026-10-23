import { useEffect, useId, useRef, useState } from 'react';
import Field from './Field.jsx';

/** The form inside the open dialog. It mounts on each open, so the reason starts empty every time. */
function ConfirmForm({ titleId, title, effects, confirmLabel, danger, reason, saving, error, actions, onConfirm, cancel, cancelRef, children }) {
  const reasonId = useId();
  const [text, setText] = useState('');
  const [reasonError, setReasonError] = useState('');
  const missing = value => reason === 'required' && !value.trim();
  function submit(event) {
    event.preventDefault();
    if (saving) return;
    if (missing(text)) {
      setReasonError('Enter a reason.');
      document.getElementById(reasonId).focus();
      return;
    }
    onConfirm(text.trim());
  }
  return (
    <form className="staff-form" noValidate onSubmit={submit}>
      <h2 id={titleId}>{title}</h2>
      {effects.length > 0 && <ul>{effects.map(effect => <li key={effect}>{effect}</li>)}</ul>}
      {children}
      {reason && (
        <Field id={reasonId} label="Reason" optional={reason !== 'required'} as="textarea" rows={3} maxLength={500}
          value={text} error={reasonError}
          onChange={event => { setText(event.target.value); if (!missing(event.target.value)) setReasonError(''); }}
          onBlur={() => { if (missing(text)) setReasonError('Enter a reason.'); }} />
      )}
      {error && <p className="field-error" role="alert"><span className="sr-only">Error: </span>{error}</p>}
      {actions}
      <div className="form-actions">
        <button type="button" ref={cancelRef} className="button-secondary" aria-disabled={saving || undefined} onClick={cancel}>Cancel</button>
        <button type="submit" className={danger ? 'button-danger' : 'button-primary'} aria-disabled={saving || undefined}>{saving ? 'Saving…' : confirmLabel}</button>
      </div>
    </form>
  );
}

/**
 * Confirmation for a delete, revoke, disable, role change, invitation cancel or ownership transfer (Req 20.4, 21.6).
 * Native modal `<dialog>` with `showModal()`: the page behind is inert, so Tab stays inside. It opens with focus on
 * Cancel, Escape cancels, and focus returns to the control that opened it. `title` names the item, `effects` lists
 * each effect, `reason` is 'required', 'optional' or omitted, `children` adds fields such as an email. `actions`
 * shows below the error, for recovery controls such as "Try again" (a submit button resends through the form).
 * `onConfirm(reason)` sends the request; the parent closes the dialog by setting `open` to false. Keep one dialog per
 * screen rather than one per row, so it stays mounted after the row it acted on is gone.
 */
export default function ConfirmDialog({ open, title, effects = [], confirmLabel, danger = false, reason, saving = false, error, actions, onConfirm, onCancel, children }) {
  const dialog = useRef(null);
  const cancelButton = useRef(null);
  const opener = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const box = dialog.current;
    if (open && !box.open) {
      opener.current = document.activeElement;
      // Without `autofocus`, showModal() focuses the Reason field first, and moving to Cancel blurs it, which showed
      // "Enter a reason." before the user had typed anything.
      cancelButton.current.setAttribute('autofocus', '');
      box.showModal();
      cancelButton.current.focus();
    } else if (!open && box.open) {
      box.close();
      if (opener.current?.isConnected) opener.current.focus();
      // The opener is gone (its row was removed). Safari focuses the dialog itself on a button click, and focus would
      // stay on the closed dialog; release it so StaffShell moves focus to the h1.
      else if (box.contains(document.activeElement)) document.activeElement.blur();
    }
  }, [open]);
  // Nothing is cancelled while a request is in flight; its result decides what happens next.
  const cancel = () => { if (!saving) onCancel(); };
  return (
    <dialog ref={dialog} className="staff-dialog" aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); cancel(); }}
      // `close` is a queued event: the close of an earlier opening can arrive after the dialog opened again, so only a
      // dialog that is closed now cancels (a stale event closed a reopened dialog on loaded CI runners).
      onClose={() => { if (open && !dialog.current.open) onCancel(); }}>
      {open && (
        <ConfirmForm titleId={titleId} title={title} effects={effects} confirmLabel={confirmLabel} danger={danger} reason={reason}
          saving={saving} error={error} actions={actions} onConfirm={onConfirm} cancel={cancel} cancelRef={cancelButton}>{children}</ConfirmForm>
      )}
    </dialog>
  );
}
