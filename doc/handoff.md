# Homepage handoff

Updated 9 October 2026. A handoff is the current implementation map for the next team. It says what exists, which files to extend, and which contracts to preserve. Git transfers the files; this document explains how to continue safely.

Publication: the current frontend changes are local and unpublished. No pushed commit/PR is recorded for them. See `tasks.md` for checks and publication state; confirm the shared branch before treating this as an integrated feature.

Use [local-development.md](local-development.md) to install and start the site. Use [tasks.md](tasks.md) for ownership and dated test evidence. This handoff records stable integration points, not a second task log. Update it when an implemented interface or boundary changes. Read the six shared project documents and [AGENTS.md](../AGENTS.md) before extending the app.

## Implemented scope

- Full-width rectangular header at the top. Heavy Helvetica/Arial Thaparlympics wordmark, desktop navigation and icon-only phone menu. Menus support keyboard, Escape, outside click and closing after navigation.
- Responsive title and six-athlete diagonal gallery with local images and textured sport backgrounds. Both portrait layers use the same responsive source; phones share smaller textures with match cards. Originals remain available. The original blue dot matrix is confined to the hero. Title reveal and matrix respect reduced motion; canvas work stops offscreen, on a hidden tab and on route unmount.
- Seven sport filter buttons, including All Sports. They affect live matches in place, update selection/accessibility status and reset the match rail without changing the URL or tournament row.
- Live Matches heading with red dot and six sport cards. Native horizontal scrolling and a smaller, faded partial-card preview on phones, tablets and large screens.
- Five tournament cards: venue photo above a white name/date area, native horizontal scrolling and the same spotlight treatment. Photos contain sports venues, not athletes.
- Registered future sport/tournament destinations. Their detail UI is intentionally unbuilt.

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
| Header | `frontend/src/components/SiteHeader.jsx` | Homepage links and six sport destinations; filter buttons are separate. |
| Native card rail | `frontend/src/components/HorizontalRail.jsx` | Receives card children, label, class, optional ID/reset key. Observes stable outer slots; scales inner surfaces only. |
| Match card | `frontend/src/features/matches/LiveMatchCard.jsx` | Receives `match`: ID, sport, display metadata, two sides and detail columns. Presentational; calculates no scores. Replace the white detail rendering when integrating sport-specific cards. |
| Tournament card | `frontend/src/features/tournaments/TournamentCard.jsx` | Receives `event`: ID, title, local image/alt/crop, date values and labels. Links to the event route. |
| Shared styling | `frontend/src/styles/global.css` | Approved colors, font stack, content widths, section headings and accessibility helpers. Component styles sit with their components. |
| Assets | `frontend/public/assets/`, `frontend/public/favicon.ico` | Local root-relative URLs. Phones use responsive portrait candidates and shared 640px textures. Sources/license stay in `doc/asset-sources.md`. |

## Routes

| URL | Current behavior | Future owner |
| --- | --- | --- |
| `/` | Complete homepage with temporary card content | Homepage/shared UI team |
| `/#tournaments` | Scrolls to the homepage tournament section | Homepage/shared UI team |
| `/sports/<sport>/` | Six known sport routes, deliberately blank | Respective sport teams |
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

See [tasks.md](tasks.md) for current verification and publication state. Automated checks are in `frontend/tests/homepage.spec.js`. Screenshots/traces stay outside the shared source or in ignored test output. The local test preview refuses an occupied 4175 port.

Backend, Supabase, authentication, scoring correctness, realtime/offline services and production hosting have not been implemented or verified. They are separate future tasks.
