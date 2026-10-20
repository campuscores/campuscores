# Sport Rules and Scoring Model

**Purpose:** Record authoritative references and define how event-specific playing conditions feed scoring software.  
**Status:** Operator scoring scope confirmed 20 October 2026. Official presets and explicit per-match overrides drive calculations. Remaining event policies are listed below.

**Homepage boundary (8 October 2026):** the implemented match cards use temporary display fixtures, including score breakdowns and clocks. Those values/columns are not approved playing conditions or a scoring engine. Operators choose confirmed presets/custom formats before real scoring; UI card shape/color does not decide domain rules.

**Sport page boundary (9 October 2026):** the six sport pages show official-baseline display fixtures (BWF, ITF, ITTF, FIVB, IFAB, FIBA). They do not confirm event formats.

## 1. Rule governance

- Use the governing sport body's current rules as the baseline, then apply only explicitly configured competition rules for the relevant tournament and enabled sport.
- Coaches/admins own tournament defaults. An assigned operator may select an official scoring preset or a validated custom format before starting an eligible match. The accepted start action freezes the match format; later actions cannot change it. Current-day scoring uses Asia/Kolkata and database time, plus the assignment window.
- Store the governing source URL, edition/version/date checked, and any local overrides with each tournament/sport configuration and match snapshot.
- Do not silently change a live match's ruleset. A rule configuration change must be recorded and must not reinterpret already accepted actions without a deliberate migration/correction.
- A Tournament Manager's or Super Admin's decision on a tie, abandonment, forfeit, or unusual circumstance is an official result input; record actor, time, and explanation.
- This document specifies scorekeeping concepts, not a substitute for referees/umpires or an official event rulebook.

## 2. Authoritative references checked (20 October 2026)

- **Badminton:** BWF Section 4.1, 26 April 2025: best of three to 21, win by two from 20-all, next point wins at 29-all. The 15-point replacement takes effect 4 January 2027 and is not the current preset. [BWF rules and effective dates](https://corporate.bwfbadminton.com/statutes/)
- **Basketball:** FIBA Official Basketball Rules 2026, valid 1 October 2026: four periods and 1/2/3-point scores. The product uses manual period endings and no running clock. [FIBA 2026 rules](https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2026-v1-1.pdf)
- **Football:** IFAB Laws 2026/27: higher team goal total wins; competition rules decide tie procedures. Draw/shoot-out finalization remains Open. [IFAB outcome rules](https://www.theifab.com/laws/latest/determining-the-outcome-of-a-match/)
- **Volleyball:** FIVB 2025–2028: best of five, sets to 25, deciding fifth to 15, always win by two. [FIVB rules](https://www.fivb.com/wp-content/uploads/2025/01/FIVB-Volleyball_Rules2025_2028-EN-v05.pdf)
- **Table tennis:** ITTF 2026: games to 11, win by two, best of any odd number of games. Five is an offered preset, not the only official match length. [ITTF 2026 statutes](https://db.ittf.com/sites/default/files/public/2026-02/2026_Statutes_v1_consolidated_clean.pdf)
- **Lawn tennis:** ITF 2026: advantage games; six-game sets with two-game margin and seven-point tie-breaks at 6–6. Best of three is the offered preset. [ITF 2026 rules](https://www.itftennis.com/media/7221/2026-rules-of-tennis-english.pdf)

These sources are baselines, not a commitment to use professional-length match formats. Tournament conditions are still required. Re-check current versions during implementation; do not copy legal text into the product when a compact rules summary/configuration is sufficient.

## 3. Shared match/rules configuration

Each tournament/sport should configure, as applicable:

- exactly two semifinal matches and one final per tournament sport; only approved semifinal winners advance;
- match/round duration and start/end conditions;
- team size, roster size, active squad and substitutes;
- draw/tie rules, extra time, tiebreaks, walkovers, forfeits, abandonment, and result-awarding authority;
- standings columns, win/draw/loss points, bonuses/penalties, and tie-break order;
- configurable score/point values and operator final confirmation, which locks editing;
- any local rule variation, its authority, and effective dates.

The bracket is decided. Do not add league/group stages or extra rounds without an approved scope change. Coaches choose event defaults; operators can select the confirmed per-match controls below. Standings columns/points and exceptional outcome policies remain open. Custom matches stay outside the bracket and never advance a team. Their public visibility and effect on statistics or standings must be decided before implementation. Combined cross-sport standings remain deferred.

## 4. Sport score models

### Badminton

Record singles or doubles sides, game, rally sequence, rally winner, point totals, serving side/player when required, and match completion. Derive game win and match win from the selected BWF or event scoring format. Configure best-of format, points-to-win, win-by margin/cap, intervals/change ends if tracked, and match/tie behavior.

### Basketball

Record period, scoring team, scoring value, team fouls, substitutions and reversal references. Derive team totals and match outcome. Configure 5-on-5 or 3-on-3 (or another approved format), period duration/count, scoring and foul rules, clock treatment, overtime, and tie procedure. The current scope has manual period changes and no match clock. Attribute scores to teams, not individual players.

### Football

Record the period, scoring team, cards, substitutions and correction reference. The current scope has no running clock or individual goal attribution. Derive team totals, the event feed and result. Configure player count, half duration, stoppage-time display, substitute limits/return substitutions if used, extra time and shootout format for knockout matches, and tie handling for custom matches. Confirm each local condition before implementation.

### Volleyball

Record set, rally sequence, point-winning side, serving side/player if tracked, rotation/lineup events where enabled, substitutions/timeouts/faults if included, and correction reference. Derive set scores, match winner, and player contributions only for captured event types. Configure best-of/sets-to-win, points target and win-by/cap rules, deciding set, rotation and libero/lineup tracking scope, substitutions, and whether individual statistics beyond roster participation are required.

### Table tennis

Record match/game number, rally sequence, rally winner, server/receiver when tracked, points, service changes, ends, and correction reference. Derive game and match winner from tournament configuration. Configure singles/doubles, best-of games, points target and win-by-two behavior, service/end changes, and optional multi-match team-tie structure. Avoid hard-coding team-tie formats into the individual game engine.

### Lawn tennis

Record set, game, point, server, point winner, tiebreak state, and match correction reference; optionally track player-level serve/ace/double-fault data only if the scorer workflow supports it. Derive games, sets, and winner. Configure singles/doubles, advantage or no-ad, best-of sets, set/tiebreak format, final-set procedure, and match tiebreak options.

## 5. Cross-sport event standings

Combined branch standings are explicitly deferred. Before implementation of such a table, organizers must define:

- placements that earn event points;
- per-sport weighting and any gender/division treatment;
- team participation, forfeits, and disqualification treatment;
- cross-sport tie-break order and co-championship behavior;
- how finalized results contribute to the future standings feature; finalized scores remain immutable.

## 6. Score corrections and final results

Confirmed 20 October 2026; replaces the earlier review/approval proposal.

- Store each accepted score, reversal, format choice, early set end and final confirmation with actor and server time.
- Before final confirmation, the assigned operator can undo live actions without a reason. Replay the active actions to recalculate sets and totals; do not erase accepted actions.
- A set can end automatically under the selected format or early through an explicit winner choice. Keep its actual points and mark the early end; do not fabricate a threshold score.
- A computed match winner is provisional until the operator confirms. The operator can still correct the deciding point.
- Final confirmation atomically stores the final snapshot, sets match status to `APPROVED`, audits the action and queues live delivery. No manager review is required. No later score, reversal or format change is allowed, including after reload or from another device.
- Repeating the exact final action after a lost response returns its accepted result, after current account, assignment and lease checks. It must not finalize twice.
- Existing `PENDING_APPROVAL` and `REJECTED` records are legacy states, not new result-workflow targets. This feature adds no approval, rejection, reopening or post-final editing endpoint.

## 7. Scoring event integrity requirements

These implementation rules apply to all six sports; they do not decide sport-specific playing conditions:

- Represent each accepted score input as an ordered, identified action. Store the action ID, match-local server sequence, sport/ruleset version, actor, and server acceptance timestamp.
- Enforce idempotency so retrying a command after a timeout cannot add the same run, rally point, basket, or goal twice.
- Validate event order and legal state transitions against the selected sport configuration before accepting a score action.
- Persist the score action and the corresponding match snapshot/projection and outbox record in a single database transaction.
- Publish only committed actions. A public client that sees a sequence gap must reload the match snapshot before continuing.
- Treat a socket broadcast as notification/delivery, not the official scoring record. On reconnect, clients reconcile with the authoritative action sequence and match state.
- Validate every synced offline action against the operator's match assignment using server receipt time; the device clock is untrusted. If the assignment window has ended or the assignment was revoked, pause sync until a Tournament Manager extends the window or resolves the conflict.
- If an offline action cannot be accepted because the match/ruleset/scorer sequence conflicts, pause and request manager resolution; never silently apply “last write wins.”
- Live undo uses linked compensating actions with actor, timestamp and referenced event, without a reason. Replay scores from active history. No edits follow final confirmation.

The 3,000-client capacity demonstration is a delivery/load target only. It does not modify sport laws, result rules, or final score authority.

## 8. Remaining event decisions

Record each confirmed condition here and record its decision date in `memory.md`. Add its boundary, invalid-input, undo and correction cases to `tasks.md` before coding. Block work that depends on an unknown rule. A sample homepage scorecard is not evidence of an approved rule. After implementation, record actual test results and untested limits; do not mark an untested engine verified.

1. **Resolved 20 October 2026:** operator confirmation publishes the final result and locks editing; no separate approval. The bracket shape remains two semifinals and one final. Automatic advancement is separate implementation scope.
2. Badminton singles/doubles and match format; basketball 5v5/3x3, periods/clock/overtime; football team size/duration/substitutions/tie resolution.
3. Volleyball set/point/rotation/lineup settings; table tennis singles/doubles, game format and optional team-tie structure; lawn tennis singles/doubles, advantage/no-ad, set and tiebreak formats.
4. Custom match visibility and whether its result contributes to standings, player match statistics, or neither. Custom matches never advance the bracket.
5. Team/roster limits, player eligibility, match squads, and substitute movement rules.
6. Sport standings columns, win/draw/loss points, tie-breaks, and whether knockout-only tournaments need a table.
7. Team-specific format exceptions, if any, and which point/scoring values managers can configure per tournament sport.

## 9. Thapar context

TIET's official sports information describes Thaparlympics as inter-branch. The selected initial product scope is football, volleyball, basketball, table tennis, lawn tennis, and badminton, configurable by tournament. [TIET sports overview](https://www.thapar.edu/students/pages/introduction-sports)

## 10. Accepted scoring feature and limits

Official presets cover BWF rally games, ITTF games (best of any odd number; five is an offered preset), FIVB sets, ITF games/sets/tiebreaks, IFAB team goals and FIBA team point values. Per-match controls cover odd best-of counts, point targets, win-by margins, optional golden points, deciding-set targets, tennis set/tiebreak settings and period counts/scoring values as applicable. These scorekeeping presets do not claim to implement every officiating, roster or disciplinary rule. Cards/substitution names are entered as display text until validated rosters exist. No clock, player goal/basket totals, standings, bracket advancement or manager-review workflow is part of this integration.

Football draw/shoot-out policy and other exceptional whole-match awards remain Open with Arnav/coaches. Do not invent a winner for a tied/undecided match. Coaches’ remaining team/roster/eligibility rules do not prevent the confirmed scoring controls from being implemented.
