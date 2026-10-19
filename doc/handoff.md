# Homepage handoff

Updated 9 October 2026. A handoff is the current implementation map for the next team. It says what exists, which files to extend, and which contracts to preserve. Git transfers the files; this document explains how to continue safely.

Publication: the homepage is published on `main`. See [tasks.md](tasks.md) for its confirmed revision, checks and any unpublished updates. Confirm the shared branch before extending it.

Use [local-development.md](local-development.md) to install and start the site. Use [tasks.md](tasks.md) for ownership and dated test evidence. This handoff records stable integration points, not a second task log. Update it when an implemented interface or boundary changes. Read the six shared project documents and [AGENTS.md](../AGENTS.md) before extending the app.

## Implemented scope

- Full-width rectangular header at the top. Heavy Helvetica/Arial Thaparlympics wordmark, desktop navigation and icon-only phone menu. Menus support keyboard, Escape, outside click and closing after navigation.
- Responsive title and six-athlete diagonal gallery with local images and textured sport backgrounds. Both portrait layers use the same responsive source; phones share smaller textures with match cards. Originals remain available. The original blue dot matrix is confined to the hero. Title reveal and matrix respect reduced motion; canvas work stops offscreen, on a hidden tab and on route unmount.
- Seven sport filter buttons, including All Sports. They affect live matches in place, update selection/accessibility status and reset the match rail without changing the URL or tournament row.
- Live Matches heading with red dot and six sport cards. Native horizontal scrolling and a smaller, faded partial-card preview on phones, tablets and large screens.
- Five tournament cards: venue photo above a white name/date area, native horizontal scrolling and the same spotlight treatment. Photos contain sports venues, not athletes.
- Six sport pages (football, basketball, tennis, table tennis, badminton, volleyball) with Live, Upcoming and Past sections, date chips and a match detail dialog. They use frontend display fixtures only.
- Registered tournament destinations. Their detail UI is intentionally unbuilt.

There is no autoplay/sliding hero carousel: the approved hero is the diagonal athlete gallery with animated background. Do not reintroduce abandoned animation variants or controls.

## Data boundaries

`frontend/src/features/matches/sampleMatches.js` contains temporary competitors, competition labels, scores, clocks, columns and breakdowns. `frontend/src/features/tournaments/sampleTournaments.js` contains temporary event identities, titles and date ranges; photos illustrate venues and do not claim to show the actual event location.

The six sport IDs in `frontend/src/data/sports.js` are shared keys: `football`, `basketball`, `lawn-tennis`, `table-tennis`, `badminton`, `volleyball`. Header navigation, filters, hero assets and card backgrounds use these IDs.

These fixtures are not a rules engine, live feed or confirmed competition format. Each sport team will decide its actual detail content and mapping. Preserve the approved card shell: textured sport color above a white detail area for matches; venue image above white details for tournaments; rounded rectangles, spacing and native horizontal use. No visible dummy-data explanations are required in the public UI.

## Integration points

| Responsibility | File or folder | Contract |
| --- | --- | --- |
| Routes and app entry | `frontend/src/app/App.jsx`, `frontend/src/main.jsx` | Central React Router routes. Each navigation entry restores section/top scrolling, including a repeat click to the same destination. |
| Homepage composition | `frontend/src/features/home/HomePage.jsx` | Owns selected sport and composes sections; no backend calls. |
| Header | `frontend/src/components/SiteHeader.jsx` | Homepage links and six sport destinations; filter buttons are separate. One `Sign in` link to `/sign-in` (desktop nav end, phone menu last item) renders only when the build sets `VITE_CLERK_PUBLISHABLE_KEY`. It reuses the existing nav link styles and 44px targets. |
| Sign-in area | `frontend/src/features/auth/` (lazy chunk) | `/sign-in/*`, `/sign-up/*` and `/account/delete`. `ClerkProvider` exists only inside this chunk, so public pages load no Clerk code. After sign-in or sign-up it calls `POST /api/invites/accept` once (404 `INVITE_NOT_FOUND` is ignored). `/account/delete` calls `DELETE /api/me`, then signs out. API base: `VITE_API_BASE`. Without a Clerk key the routes show a "sign-in unavailable" message. |
| Privacy page | `frontend/src/features/legal/PrivacyPage.jsx` | `/privacy`, plain page, no Clerk. Contact stays "to be confirmed" until the Open item in [memory.md](memory.md#backend-open-items) closes. |
| Native card rail | `frontend/src/components/HorizontalRail.jsx` | Receives card children, label, class, optional ID/reset key. Observes stable outer slots; scales inner surfaces only. |
| Match card | `frontend/src/features/matches/LiveMatchCard.jsx` | Receives `match`: ID, sport, display metadata, two sides and detail columns. Presentational; calculates no scores. Replace the white detail rendering when integrating sport-specific cards. |
| Tournament card | `frontend/src/features/tournaments/TournamentCard.jsx` | Receives `event`: ID, title, local image/alt/crop, date values and labels. Links to the event route. |
| Sport page | [`frontend/src/features/sports/SportPage.jsx`](../frontend/src/features/sports/SportPage.jsx) | `sport` (from `sports.js`), `fixtures`. Owns Upcoming/Past date state, the open match and focus return. Sets `--match-background`, `--match-background-phone` and `--sport-color` on `main.sport-page`. `App.jsx` renders it for all six sport ids with `key={sport.id}`. |
| Sport sections and cards | [`SportSection.jsx`](../frontend/src/features/sports/SportSection.jsx), [`SportMatchCard.jsx`](../frontend/src/features/sports/SportMatchCard.jsx) | Section: `sport, id, title, live, matches, dates, selectedDate, onSelectDate, onOpen`; renders chips, status text, the rail or an empty message. Card: `sport, match, onOpen(match, button)`; header-only, shows `match.score` or `VS`. |
| Sport match dialog | [`SportMatchDialog.jsx`](../frontend/src/features/sports/SportMatchDialog.jsx) | `sport, scoring, match` (null = closed), `onClose`. Native `<dialog>` with `showModal()`; score table, legend, scorers and lineups (team sports), players or schedule, and match info. |
| Match Operator dashboard and score console | `frontend/src/features/operator/MyMatchesPage.jsx`, `OperatorMatchCard.jsx`, `operatorMatches.js`, `ScoreConsole.jsx`, `queue.js`, `queueStore.js`, `MyMatches.css`; gate in `features/auth/AuthArea.jsx` | Both routes render inside the lazy Clerk area; a signed-out user sees a sign-in link, a keyless build shows Sign-in unavailable. My Matches lists `GET /api/operator/matches` and groups rows with `sectionOf` (map in [memory.md](memory.md), My Matches sections). `ScoreConsole` reads its row from the same list, acquires `POST /api/matches/:id/lease` (Take over scoring on `LEASE_HELD` or a `LEASE_REQUIRED` pause), saves each action to IndexedDB before showing it queued, then sends `POST /api/matches/:id/actions` one at a time. It shows a text status line, accepted score (with seq) beside the pending score, Test_Engine controls (Point to <side>, Undo last) or the `SPORT_RULES_OPEN` message. Initial accepted score comes from the cached public `GET /api/matches/:id` or the last stored synced response. |
| Sport fixtures | `frontend/src/features/sports/<sport>/<camelId>Matches.js`, for example [`badmintonMatches.js`](../frontend/src/features/sports/badminton/badmintonMatches.js) | Each module exports `scoring` (`model` `set` or `period`, `unit`, `short`, `total`, `totalName`, optional `team`, `scorers`), `liveMatches`, `upcomingMatches`, `pastMatches`. Match: `id, status` (`live`/`ended`/`scheduled`/`completed`), `category, tournament, round, date, dateLabel, timeLabel, venue, clock, sides[{name, team, serving?, players[{name, serving?}]}], periods[]` (`{points, winner?, current?, tiebreak?, label?, name?}` or null), `score, winner`, optional `gamePoints` (live tennis) and `scorers[{side, player, detail}]`. Values are precomputed display data, not a scoring engine. |
| Fixture registry and calendar | [`sportFixtures.js`](../frontend/src/features/sports/sportFixtures.js), [`sportCalendar.js`](../frontend/src/features/sports/sportCalendar.js) | `sportFixtures` maps each `sports.js` id to its fixture module. `upcomingDates` and `pastDates` supply the shared date chips for every sport. |
| Shared styling | `frontend/src/styles/global.css` | Approved colors, font stack, content widths, section headings and accessibility helpers. Component styles sit with their components. |
| Assets | `frontend/public/assets/`, `frontend/public/favicon.ico` | Local root-relative URLs. Phones use responsive portrait candidates and shared 640px textures. Sources/license stay in `doc/asset-sources.md`. |

## Live snapshot-to-card contract

State: **Confirmed by the user, 18 October 2026.** The defaults below are confirmed: an empty clock line, one "T" total column, `'TBD'` for a missing side name, and the existing status text with an empty rail when no match is live. The mapping is `toMatchProp` in [`liveCards.js`](../frontend/src/features/matches/liveCards.js). The shapes below are what the backend emits now; the source is [`rooms.js`](../backend/src/rooms.js), the `toPublic` allow-lists in [`http.js`](../backend/src/http.js) and the card build in [`routes/actions.js`](../backend/src/routes/actions.js).

### Room_Message

A viewer opens `/live/home` or `/live/match:<id>`. The socket is receive-only. Each message is a full snapshot, not a delta. The first message after connect is the stored snapshot. A room with no stored snapshot sends nothing until its first publish.

```js
{ type: 'snapshot', room: 'home' | 'match:<id>', seq, data }
```

`seq` is a positive integer. It increases for each message of that room. The client applies a message only when its `seq` is greater than the last applied `seq` of the same socket session; the first message of a new socket replaces the state.

### Home_Room data

`data` is an array of cards for live matches only (match `status` `LIVE`). A match leaves the array when a card with another status arrives. The order is not part of the contract (now it is usually ascending match ID); the client shows cards in the received order. An empty array means no live match.

| Card field | Type and source |
| --- | --- |
| `id` | Match ID as a string (database IDs are strings). |
| `sport` | One of the six ids in `frontend/src/data/sports.js`. |
| `status` | `LIVE` in the array. |
| `competition` | Tournament name (`tournaments.name`). |
| `sides` | `[{ name }, { name }]`; `name` is the team label, or `null` when the match has no team on that side. |
| `score` | `[number, number]`: points per side from the snapshot. |
| `clock` | Always `null` now. No engine produces a clock. |
| `seq` | The match `seq` of this card (not the room `seq`). |

### Match_Room data

`data` is the snapshot Public_DTO. With the Test_Engine:

```js
{ matchId, sport, status, sides: [{ name, points }, { name, points }], corrected }
```

`GET /api/matches/:id` returns the same shape as `match.snapshot` ([contract](architecture.md#public-read-api)). Production engines for the six sports are Blocked on [rules.md](rules.md); they can add fields only through the `snapshot` allow-list.

### Card to `LiveMatchCard` `match` prop

`features/matches` maps each card to the existing prop. The shell, the sport filter and the rail stay unchanged. The filter compares `match.sport` as now.

| `match` prop field | From the card | Default when absent |
| --- | --- | --- |
| `id` | `id` | — |
| `sport` | `sport` | — |
| `sportLabel` | `label` of the `sports.js` entry for `sport` | — (the backend checks `sport`) |
| `competition` | `competition` | `''` |
| `sides[i].name` | `sides[i].name` | `'TBD'` |
| `score` | `` `${score[0]}–${score[1]}` `` (en dash, as in the fixtures) | `'VS'` if `score` is not two numbers |
| `clock` | `clock` | `''` (empty line) |
| `columns` | One total column: `{ key: 'total', label: 'T', className: 'match-total', description: 'Total' }` | — |
| `sides[i].values` | `[String(score[i])]` | `['—']` |

Not in the card, so not shown from live data: per-period columns, serving marks, the period or set label and the clock text. The sport pages and the sport match dialog keep their display fixtures in this pass. Without `VITE_API_BASE` the homepage keeps `sampleMatches.js`.

Known limit (accepted, no task yet): a card is published only after an accepted score action. A match that becomes `LIVE` appears after its first point, and a match that leaves `LIVE` disappears only when a later card carries its new status. No status-change route publishes a card yet.

## Routes

| URL | Current behavior | Future owner |
| --- | --- | --- |
| `/` | Complete homepage with temporary card content | Homepage/shared UI team |
| `/#tournaments` | Scrolls to the homepage tournament section | Homepage/shared UI team |
| `/sports/<sport>/` | Shared sport page for all six sports: Live, Upcoming and Past matches from display fixtures, date chips and a match detail dialog | Respective sport teams |
| `/operator/matches` | My Matches from `GET /api/operator/matches`, Live / Scheduled / Completed; inside the lazy Clerk area | Scorer / operator team |
| `/operator/matches/:matchId/score` | Score console with lease, Offline_Queue and Test_Engine controls; inside the lazy Clerk area | Scorer / operator team |
| `/sign-in/*`, `/sign-up/*` | Lazy Clerk sign-in and sign-up (email with verification, or Google) | Backend/auth team |
| `/account/delete` | Lazy Clerk area: explains deletion; a signed-in user can delete the account | Backend/auth team |
| `/privacy` | Privacy policy, no Clerk | Backend/auth team; policy owner (Open) |
| `/tournaments/:tournament` | Deliberately blank tournament destination | Tournament team |
| `/index.html` | Redirects to `/`; old preview query values are discarded | Compatibility only |
| `/tournament.html?event=<id>` | Redirects to `/tournaments/<id>` | Compatibility only |
| Other URLs | Page not found with a home link | App routing |

Tournament-scoped sport routes, match routes and staff routes in the PRD remain planned. When integrating a page, replace its reserved route element, add the actual feature under the appropriate folder, and test entry from the homepage, direct loading, refresh, back and return-home navigation. Deployments need SPA history fallback.

## Team workflow

1. Pull the agreed branch and follow `local-development.md`. Read current docs and source before choosing work.
2. Record a scoped task, owner/team, files, dependencies and branch in `tasks.md`. Coordinate edits to shared routing, visual tokens and components.
3. Resolve open requirements before dependent work. Build features in their folders. Create sport folders only when implementation exists. Preserve the agreed homepage and shared contracts.
4. Run the relevant checks and integration flow. Keep the public mobile experience comfortable: 44px-or-larger interactive targets, readable text, native touch scrolling, no body overflow and no hover-only controls.
5. Replace the task entry with a concise final result and verification evidence. Update only changed contracts and durable decisions in existing docs. Follow the documentation policy in AGENTS. Keep discarded attempts and local explainers out of shared docs.
6. Prepare verified code, required local assets, tests and final doc updates together. Keep the task labelled unpublished until an authorized push is confirmed. Record the remote commit/PR and target branch; a pushed branch is not a merged release. Pull/reconcile concurrent work before integration.

## Verification record

See [tasks.md](tasks.md) for current verification and publication state. Automated checks are in `frontend/tests/homepage.spec.js`, `frontend/tests/sport-pages.spec.js`, `frontend/tests/sport-edge-cases.spec.js` (desktop edge cases) and `frontend/tests/mobile.spec.js` (emulated phones and tablet). Screenshots/traces stay outside the shared source or in ignored test output. The local test preview refuses an occupied 4175 port.

Backend, database, authentication, scoring correctness, live/offline services and production hosting have not been implemented or verified. They are separate future tasks. The planned backend integration points are in [architecture.md](architecture.md#technology); the frontend contracts above do not change until the [live snapshot-to-card contract](#live-snapshot-to-card-contract) is confirmed.
