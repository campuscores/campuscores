# Design Direction: Thaparlympics Score Website

**Status:** Direction established; detailed visual assets and final screens await approval.  
**Experience:** Responsive website, not a native app.  
**Tone:** Official collegiate event + live sports scoreboard.  
**Scale presentation:** Actual-use estimate is 50–100 viewers; 3,000 is a synthetic capacity-test target, not a live-user count.

## 1. Design principles

- Put live match state and scores first; keep event administration easy to find but separate from public navigation.
- Use clear sport-specific hierarchy while retaining a shared event identity.
- Make numbers readable at a glance on a laptop from a distance and on a phone outdoors.
- Give immediate, unambiguous feedback for score input, connectivity, queued updates, and corrections.
- Use familiar sports cues and avoid copying CricHeroes or Playinga branding, layouts, or assets.
- Follow accessible contrast, text sizing, focus states, and keyboard interaction.

## 2. Visual direction

- Blend the credibility of an official university competition with the density and immediacy of a scoreboard.
- Treat Thaparlympics as the working event label. The product/site name remains undecided.
- Use the official Thapar logo site-wide (header/navigation, tournament, sport, match, and admin surfaces). Use an institute-controlled, approved asset; preserve aspect ratio and clear space. The exact file/source is still to be added to the repository.
- Do not claim any colors are official without a brand source. Start with a configurable dark/navy scoreboard base and a restrained bright accent, then reconcile with supplied brand guidance.
- Use sport-specific icons/colors as secondary accents; scores and status labels must remain understandable without color alone.
- Use a clean sans-serif type system, tabular numerals for scores/time, and strong heading contrast.

## 3. Public page layouts

### Tournament index

- Header with Thapar logo, product/event label, and tournament navigation.
- Tournament cards/list with status and dates; highlight live matches with tournament and sport context.
- Tournament is the first selection in the public hierarchy. Do not expose a global sport-first navigation that bypasses tournament selection.
- On mobile, use a single-column match-card list with concise status/score; on wide screens use a denser multi-column layout.

### Tournament page

- Show tournament name/status, dates/venues when configured, live matches, recent/upcoming fixtures, bracket summary, and only the sports enabled for this tournament.
- Sport tiles navigate to that tournament's sport page. Do not show disabled sports as empty sections.

### Sport page

- Sport title within its tournament, sport-specific format summary, and configured division/category filter.
- Match tabs or filters for live, upcoming, completed.
- Match rows/cards showing branch-year sides, score, date/time, venue, and status.
- Sport standings and configured leaders/statistics. Avoid empty or fabricated statistical modules.
- Show exactly two semifinal matches feeding one final per tournament sport, with team assignments and approved-winner progression clearly represented. Custom matches are visually distinguished and excluded from bracket display/progression.
- Clear navigation from a match back to its sport.

### Match detail

- Prominent score header with teams, status, event/sport, period/innings/game, and last updated.
- Sport-specific scorecard and event timeline.
- Player contributions for this match only (no cross-sport personal profile).
- Public correction marker when relevant.
- Realtime connection indicator that distinguishes live-updating from stale/offline public data.

## 4. Admin experience

### Admin overview and tournament builder

- Tournaments, assigned tournament sports, and active matches.
- Tournament creation selects enabled sports and their individual format/point configuration; bracket creation and semifinal assignments occur within a tournament sport. Any admin can operate across sports.
- Provide a result-review queue and clear provisional → submitted → approved/final or rejected states. Keep approve/reject actions and reasons auditable.
- Quick access to team/roster management, match setup, scoring, and corrections.
- Warnings for unconfigured rules, unscheduled matches, or failed sync actions.

### Team and roster management

- Branch + year team tiles scoped to one sport.
- Add-player form with display name, branch/year, captain marker, and optional jersey number.
- Roster shown as selectable player tiles.
- Move tiles between available roster, match-active players, and substitutes; clearly label where a player currently belongs.
- Keep drag-and-drop optional; also provide buttons/keyboard interaction so mobile and assistive input work.
- Confirm potentially consequential actions such as removing a roster member who appears in a match record.

### Scoring console

- Laptop-first layout: large current score/state, primary scoring controls, event timeline/recent actions, and team/player selection.
- Sport-specific controls with the most common actions reachable in one or two interactions.
- Clear undo/correction affordance; never silently remove a prior accepted event.
- Persistent connection state: online, offline, pending count, syncing, synced, failed.
- Mobile layout rearranges controls vertically and keeps the score/status visible while scoring.
- When offline, make it visually explicit that new actions are queued locally and not yet visible to spectators.
- When reconnecting, show sync progress and actionable conflicts/errors.

## 5. Responsive behavior

- Spectator viewing must work from a phone without horizontal scrolling for standard content.
- Admin workflows must remain usable on mobile, although detailed scoring is optimized for laptop.
- Keep touch targets generously sized; prevent accidental duplicate scoring taps with clear acknowledgement and idempotent action handling.
- Tables may collapse to cards on narrow viewports; preserve key information and explain hidden columns.
- Do not require hover to reveal scoring or status controls.

## 6. Interface states to design

- Loading and no matches yet.
- No schedule/results configured.
- Match scheduled, live, paused, completed, tied, abandoned, forfeited.
- Online and realtime connected.
- Public page stale/reconnecting.
- Scorer offline with queued actions.
- Syncing, action synced, action rejected, conflict requiring admin attention.
- Corrected score with public correction marker.
- Unauthorized admin access and expired session.
- Empty standings/player stats with honest setup guidance.

## 7. Capacity demo and truthful status display

- Do not add a fake “3,000 watching now” counter to the public event experience.
- If the project presentation includes a live load-test view, label it “simulated viewers” and show the load-generator's current connected-client count only while the harness is actually running.
- For a static presentation, use a benchmark report with test date/build/topology and measured results; distinguish target, tested capacity, and actual audience.
- A staging-only operator panel may show active simulated clients, socket node count, score-update latency, and error count. Keep infrastructure/diagnostic detail out of the spectator UI.
- Demo UI should show score delivery/reconnect behavior, but must not imply the load test proves sports-rule correctness or production availability.

## 8. Reference product takeaways

- CricHeroes demonstrates the value of a dedicated tournament hub, live score detail, schedule, standings, and sport-specific match data. Its cricket-first detail is inspiration for the clarity and immediacy of match pages.
- Playinga demonstrates multi-sport setup, role delegation, permissioned scoring, and standings driven by finalized results.
- The Thaparlympics site adapts these product patterns for branch-year teams and a public laptop/mobile web experience. Do not reproduce proprietary visual identity or exact layouts.

## 9. Design inputs still needed

- Exact official Thapar logo asset path/source and any institute usage/clear-space guidance.
- Product/site name if different from the event label.
- Sport-by-sport match formats and whether gender/division categories need filters.
- Any official event poster, schedule, or existing visual assets.
- Final decisions on public roster visibility and match-day substitutes.
