# Sport Rules and Scoring Model

**Purpose:** Record authoritative references and define how event-specific playing conditions feed scoring software.  
**Status:** The bracket is fixed. Match formats and playing conditions remain open. Governing sources were researched; re-check them before scoring work.

**Homepage boundary (8 October 2026):** the implemented match cards use temporary display fixtures, including score breakdowns and clocks. Those values/columns are not approved playing conditions or a scoring engine. Sport teams must confirm this document's open conditions before implementing production score calculations; UI card shape/color does not decide domain rules.

## 1. Rule governance

- Use the governing sport body's current rules as the baseline, then apply only explicitly configured competition rules for the relevant tournament and enabled sport.
- A Tournament Manager or Super Admin must choose the applicable tournament/sport format and local playing conditions before matches are scored. Managers are global across tournaments and sports (not sport-scoped). Match Operators cannot change sport rules; their access is scoped to the matches they are assigned to.
- Store the governing source URL, edition/version/date checked, and any local overrides with each tournament/sport configuration and match snapshot.
- Do not silently change a live match's ruleset. A rule configuration change must be recorded and must not reinterpret already accepted actions without a deliberate migration/correction.
- A Tournament Manager's or Super Admin's decision on a tie, abandonment, forfeit, or unusual circumstance is an official result input; record actor, time, and explanation.
- This document specifies scorekeeping concepts, not a substitute for referees/umpires or an official event rulebook.

## 2. Authoritative references checked (5 October 2026)

- **Badminton:** BWF Statutes, Section 4.1, *Laws of Badminton*. The baseline scoring law describes best of three games, games to 21, win by two after 20-all, cap at 30. BWF also publishes alternative scoring laws; organizers must choose the intended match/game format. [BWF Laws of Badminton](https://system.bwfbadminton.com/documents/folder_1_81/Statutes/CHAPTER-4---RULES-OF-THE-GAME/SECTION%204.1-%20Laws%20of%20Badminton.pdf) · [BWF alternative laws](https://system.bwfbadminton.com/documents/folder_1_81/Statutes/CHAPTER-4---RULES-OF-THE-GAME/Section%204.1.4%20-%20Alternative%20Laws%20of%20Badminton.pdf)
- **Basketball:** FIBA, *Official Basketball Rules 2024*, valid from 1 October 2024 per the official rules page. The standard FIBA game uses four 10-minute quarters and 5-minute overtime when tied; college event formats may differ and must be configured. [FIBA rules page](https://refereeing.fiba.basketball/en/rules) · [FIBA rules PDF](https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2024-v10a.pdf)
- **Football:** IFAB, *Laws of the Game 2026/27* (effective from 1 July 2026; verify which edition the tournament adopts). Competition rules determine reduced match duration where allowed, and knockout tie resolution. [IFAB document editions](https://www.theifab.com/laws-of-the-game-documents/?language=en&year=2025%2F26) · [IFAB notes on applying the Laws](https://www.theifab.com/laws/latest/notes-on-the-laws/)
- **Volleyball:** FIVB, *Official Volleyball Rules 2025–2028*. Configure set count, points target, win-by-two/cap behavior, deciding set, rotation/serve tracking level, and team roster/lineup behavior. [FIVB rules PDF](https://www.fivb.com/wp-content/uploads/2025/01/FIVB-Volleyball_Rules2025_2028-EN.pdf)
- **Table tennis:** ITTF, current applicable Statutes/Laws of Table Tennis; verify the effective rules version when implementing. Configure singles/doubles, games per match, points per game, win-by-two, serve rotation, end changes, and any team-tie format. [ITTF current Statutes and documents](https://www.ittf.com/statutes/) · [ITTF Umpires & Referees documents](https://www.ittf.com/committees/umpires-referees/documents/)
- **Lawn tennis:** ITF/World Tennis, *Rules of Tennis* (2026 rules are available). Configure singles/doubles, best-of format, advantage/no-ad scoring, set format, tiebreak rules, and match-tiebreak use. [World Tennis rules and regulations](https://www.itftennis.com/en/about-us/governance/rules-and-regulations/)

These sources are baselines, not a commitment to use professional-length match formats. Tournament conditions are still required. Re-check current versions during implementation; do not copy legal text into the product when a compact rules summary/configuration is sufficient.

## 3. Shared match/rules configuration

Each tournament/sport should configure, as applicable:

- exactly two semifinal matches and one final per tournament sport; only approved semifinal winners advance;
- match/round duration and start/end conditions;
- team size, roster size, active squad and substitutes;
- draw/tie rules, extra time, tiebreaks, walkovers, forfeits, abandonment, and result-awarding authority;
- standings columns, win/draw/loss points, bonuses/penalties, and tie-break order;
- configurable score/point values, correction permissions, and required manager approval before result finalization;
- any local rule variation, its authority, and effective dates.

The bracket is decided. Do not add league/group stages or extra rounds without an approved scope change. Sport match formats, standings columns/points and tie-break rules remain open. Custom matches stay outside the bracket and never advance a team. Their public visibility and effect on statistics or standings must be decided before implementation. Combined cross-sport standings remain deferred.

## 4. Sport score models

### Badminton

Record singles or doubles sides, game, rally sequence, rally winner, point totals, serving side/player when required, and match completion. Derive game win and match win from the selected BWF or event scoring format. Configure best-of format, points-to-win, win-by margin/cap, intervals/change ends if tracked, and match/tie behavior.

### Basketball

Record period, game clock/time if kept, scoring side, scoring player, scoring value (1/2/3), foul type/player/team, timeout and substitution events when included, and correction reference. Derive period and final totals, player scoring, foul totals if configured, and match outcome. Configure 5-on-5 or 3-on-3 (or another approved format), period duration/count, scoring and foul rules, clock treatment, overtime, and tie procedure. It remains open whether the initial scorekeeper will enter clock changes or only period/event updates.

### Football

Record period and match time where available, goal and scorer/assist if known, cards, substitutions, penalty kicks, and correction reference. Derive the score, event feed, player contributions, and result. Configure player count, half duration, stoppage-time display, substitute limits/return substitutions if used, extra time and shootout format for knockout matches, and tie handling for custom matches. Confirm each local condition before implementation.

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
- how to correct an approved result and recompute tournament/sport standings.

## 6. Score corrections and audit

- An accepted scoring action is never silently erased.
- **Live undo:** while a match is `LIVE`, the assigned Match Operator can undo or correct any number of actions without extra permission or a reason. Each undo is stored as a linked reversal action with actor, server timestamp, and affected action. Live undos show no public correction marker.
- **Corrections after submission or approval:** create a linked reversal/replacement or correction record with actor, server timestamp, **reason**, and affected action. Public match pages show that a correction occurred; detailed change history is visible to Tournament Managers and Super Admins only.
- Derived scorecards, results, and standings are recalculated from the corrected action set.
- **Result approval:** the operator submits the result (`LIVE → PENDING_APPROVAL`); a Tournament Manager or Super Admin approves (`APPROVED/FINAL`) or rejects (`REJECTED/CORRECTION`). The reviewer must differ from the submitter, whatever their role. A Super Admin may override this only with a recorded reason; the override is audited.
- **Rejection:** requires a reason and a correction route. `OPERATOR` reopens access for the current scorer only if the assignment remains active and within its window. `MANAGER` locks out Match Operators. A Tournament Manager or Super Admin must revoke the old assignment and assign themselves in one audited transaction before correction.
- Both correction routes require the common token, active-account, assignment, server-time-window, `SCORE` and device-lease checks. A `REJECTED/MANAGER` match accepts scores only from the self-assigned manager or Super Admin. See the exact acceptance rule in `architecture.md`.
- Approved results are locked. Post-approval corrections create a new audited result version and require another approval.

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
- Corrections are linked compensating actions with actor, timestamp, reason, and referenced event. Recalculate dependent stats and sport standings from the corrected history.

The 3,000-client capacity demonstration is a delivery/load target only. It does not modify sport laws, result rules, or final score authority.

## 8. Rules decisions required before scoring implementation

Record each confirmed condition here and record its decision date in `memory.md`. Add its boundary, invalid-input, undo and correction cases to `tasks.md` before coding. Block work that depends on an unknown rule. A sample homepage scorecard is not evidence of an approved rule. After implementation, record actual test results and untested limits; do not mark an untested engine verified.

1. ~~Result approval detail~~ — **Resolved 6 October 2026:** the approver must differ from the submitter, with an audited Super Admin override that requires a reason (see section 6). Bracket structure is fixed to two semifinals and one final; a manager assigns semifinal teams and only approved winners advance.
2. Badminton singles/doubles and match format; basketball 5v5/3x3, periods/clock/overtime; football team size/duration/substitutions/tie resolution.
3. Volleyball set/point/rotation/lineup settings; table tennis singles/doubles, game format and optional team-tie structure; lawn tennis singles/doubles, advantage/no-ad, set and tiebreak formats.
4. Custom match visibility and whether its result contributes to standings, player match statistics, or neither. Custom matches never advance the bracket.
5. Team/roster limits, player eligibility, match squads, and substitute movement rules.
6. Sport standings columns, win/draw/loss points, tie-breaks, and whether knockout-only tournaments need a table.
7. Team-specific format exceptions, if any, and which point/scoring values managers can configure per tournament sport.

## 9. Thapar context

TIET's official sports information describes Thaparlympics as inter-branch. The selected initial product scope is football, volleyball, basketball, table tennis, lawn tennis, and badminton, configurable by tournament. [TIET sports overview](https://www.thapar.edu/students/pages/introduction-sports)
