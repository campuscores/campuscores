import { useState } from 'react';
import { useNavigate } from 'react-router';
import ConfirmDialog from '../staff/ConfirmDialog.jsx';
import useMutation from '../staff/useMutation.js';
import useUnsavedGuard from '../staff/useUnsavedGuard.js';
import SetupDetailsView from './SetupDetailsView.jsx';
import { TOURNAMENT_TOKENS, renameFields, stepPath } from './setup.js';

/**
 * Guided_Setup step 1 at `/manage/tournaments/new` (Req 9.1, 9.2, 9.4, 9.5).
 * `POST /api/manage/tournaments` with `{ name, startsOn, endsOn, venue, description }` (the View sends exactly these;
 * an empty venue or description is stored as null). 201 `{ tournament: { slug, … }, isOwner }`: the Draft is stored,
 * then step 2 of the returned slug opens. A 400 names `startDate`/`endDate` for the date fields, so the error is
 * renamed to the form's `startsOn`/`endsOn` before it reaches the View.
 */
export default function CreateTournamentPage({ role, getToken, signInAgain }) {
  const navigate = useNavigate();
  const { run, saving, error } = useMutation(getToken);
  const [dirty, setDirty] = useState(false);
  const guard = useUnsavedGuard(dirty);
  async function create(body) {
    const result = await run('/manage/tournaments', { body });
    if (!result.ok) return;
    // The held navigation goes through once `dirty` is false (useUnsavedGuard).
    setDirty(false);
    navigate(stepPath(result.data.tournament.slug, 2));
  }
  return <>
    <SetupDetailsView role={role} saving={saving} error={renameFields(error, TOURNAMENT_TOKENS)} onSubmit={create}
      onDirty={setDirty} onSignIn={signInAgain} />
    <ConfirmDialog {...guard} />
  </>;
}
