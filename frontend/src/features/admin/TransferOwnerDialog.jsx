import { useId, useState } from 'react';
import ConfirmDialog from '../staff/ConfirmDialog.jsx';
import Field from '../staff/Field.jsx';
import { messageFor } from '../staff/labels.js';
import { emailError, personName } from './adminText.js';

/**
 * Ownership transfer confirmation (Req 3.11, 20.4): the new owner's email and an optional reason.
 * Open while `tournament` is set; `owner` is the current owner. `onConfirm(email, reason)` sends the request.
 */
export default function TransferOwnerDialog({ tournament, owner, saving, error, onConfirm, onCancel }) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [invalid, setInvalid] = useState('');
  const [openFor, setOpenFor] = useState(null);
  // Each open starts with an empty email.
  if ((tournament?.slug ?? null) !== openFor) {
    setOpenFor(tournament?.slug ?? null);
    setEmail('');
    setInvalid('');
  }
  const fieldError = invalid || messageFor(error, 'email');
  function confirm(reason) {
    const problem = emailError(email);
    if (problem) {
      setInvalid(problem);
      document.getElementById(id).focus();
      return;
    }
    onConfirm(email.trim().toLowerCase(), reason);
  }
  const effects = [
    'The new owner must be an active Tournament Manager.',
    owner && `${personName(owner)} is no longer its owner.`,
    'Sport managers and scorers stay as they are.',
  ].filter(Boolean);
  return (
    <ConfirmDialog open={Boolean(tournament)} title={`Transfer ownership of ${tournament?.name ?? ''}`} effects={effects}
      confirmLabel="Transfer ownership" reason="optional" saving={saving}
      error={messageFor(error, 'email') ? null : messageFor(error)} onConfirm={confirm} onCancel={onCancel}>
      <Field id={id} label="New owner's email" type="email" inputMode="email" autoComplete="off" autoCapitalize="none"
        spellCheck={false} maxLength={254} value={email} error={fieldError}
        onChange={event => { setEmail(event.target.value); if (!emailError(event.target.value)) setInvalid(''); }}
        onBlur={() => setInvalid(emailError(email))} />
    </ConfirmDialog>
  );
}
