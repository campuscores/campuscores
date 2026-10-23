import { Link } from 'react-router';
import StaffShell from '../staff/StaffShell.jsx';
import ScreenState, { NoAccess } from '../staff/ScreenState.jsx';
import { messageFor } from '../staff/labels.js';
import DataList from './DataList.jsx';
import { matchColumns, stageNames } from './matchColumns.jsx';
import { tournamentNav } from './manage.js';
import { stepBack, stepTitle } from './setup.js';
import './manage.css';

/**
 * Guided_Setup step 5, optional (Req 9.1, 13.6): the tournament's matches with no scorer, each with "Assign scorer"
 * when the row's `canAssign` allows it. `state` 'empty' means every match has a scorer. `onFinish()` ends setup.
 */
export default function SetupScorersView({ role, state, onRetry, tournament, matches = [], saving, error, onFinish }) {
  if (state === 'forbidden') return <NoAccess role={role} />;
  return (
    <StaffShell role={role} title={stepTitle(5)} current={tournamentNav(role)} back={stepBack(role, tournament?.slug, 5)} alert={messageFor(error)}>
      <p>This step is optional. A scorer can be assigned to each match later from Matches.</p>
      <section className="staff-section-tight" aria-labelledby="setup-no-scorer">
        <h2 id="setup-no-scorer">Matches without a scorer</h2>
        <ScreenState state={state} what="matches" empty="Every match has a scorer." onRetry={onRetry}>
          <DataList label="Matches without a scorer" rows={matches} columns={matchColumns(stageNames(matches), { status: false, scorer: false })}
            actions={match => match.canAssign && <Link className="button-text" to={`/manage/matches/${match.id}/scorer`}>Assign scorer</Link>} />
        </ScreenState>
        <p>If a scorer has no account yet, <Link className="button-text" to="/manage/invite">invite the scorer</Link> first.</p>
      </section>
      <div className="page-actions">
        <button type="button" className="button-primary" aria-disabled={saving || undefined} onClick={() => { if (!saving) onFinish(); }}>
          {saving ? 'Saving…' : 'Finish setup'}
        </button>
      </div>
    </StaffShell>
  );
}
