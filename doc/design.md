# Thaparlympics Design Language

Updated 23 October 2026. This guide records the approved, implemented homepage, the shared visual language for future pages and the final Staff_Style of the staff screens (section 12). Values below come from the current React components, CSS and local artwork. Product scope and future workflows belong in [prd.md](prd.md), implementation contracts in [handoff.md](handoff.md), and sport rules in [rules.md](rules.md).

## 1. Visual character

A light, mobile-first sports interface: pale blue page, white surfaces, dark ink text, strong blue selection, bold headings and scores, colorful sport artwork, and generous space between sections. Texture belongs in sport imagery; navigation and information surfaces stay clean. Keep decoration behind content and make touch, keyboard and horizontal scrolling comfortable.

The homepage establishes the palette, typography, component shapes and interactions. Future features should reuse these choices; this document does not prescribe the layout or functionality of unbuilt pages. The current wordmark is heavy text reading Thaparlympics. These are the site's approved colors, not a claim of official institute branding.

## 2. Color roles

Use the existing CSS variables for shared brand colors. Primary means the interaction/accent color; secondary means the supporting dark ink color. Muted text and sport colors have separate roles.

| Role | Exact value | Homepage use |
| --- | --- | --- |
| Primary blue | `#0755ff`, `var(--blue)` | Selected filters, active navigation, hero's second line, totals, link chevrons, focus and text selection. |
| Secondary ink | `#11182e`, `var(--ink)` | Wordmark, headings, unselected labels and table text. |
| Page tint | `rgb(225 237 255 / 30%)`, `var(--page-tint)` | A uniform translucent layer over white; the visible result is approximately `#f6faff`. |
| Main surface | `#fff` | Header, card shell, score detail panel and dropdowns. |
| Unselected filter surface | `rgb(255 255 255 / 92%)` | Slightly translucent white sport tiles. |
| Secondary text | `#50688c` | Tournament dates. |
| Muted table labels | `#607697` | Period/set/game column headings. |
| Live indicator | `#ff334b` | The red dot beside Live Matches. |
| Current period accent | `#d5203e` | Active period/set/game label and its scores. |
| Tournament accent | `#dd7f00` | Trophy heading icon. |
| Table divider | `#e9eef6` | Fine horizontal rules within score details. |
| Menu border | `#e7edf7` | Dropdown outlines and nested menu divider. |
| Header border | `rgb(222 231 246 / 70%)` | Subtle 1px header outline. |
| Active navigation underline | `#b7ceff` | The 2px underline under Home. |
| Filter hover surface | `#eaf2ff` | Hover on an unselected sport filter. |
| Selected filter hover | `#064ae0` | Darker blue on an already selected filter. |
| Menu hover surface | `#f1f6ff` | Hover/focus background for dropdown items. |
| Texture darkening layer | `rgb(7 18 39 / 56%)` | Uniform overlay above sport textures on live-match cards. |

The page background in [global.css](../frontend/src/styles/global.css) is:

```css
background: linear-gradient(var(--page-tint), var(--page-tint)), #fff;
```

Both gradient stops are equal: this produces an even pale surface, not a directional color change. Keep blue for selection/actions and red for live/current emphasis. Pair color with labels or structure; color alone must not carry meaning. Choose text contrast for its actual surface, especially when placing white text above imagery.

## 3. Typography

Use `font-family: Helvetica, Arial, sans-serif` throughout. Helvetica is used when available, otherwise Arial/the system sans-serif fallback. No font file is bundled or downloaded. Buttons explicitly inherit the family; new controls must also inherit it.

All sizes below are CSS pixels; `vw` values use viewport width. Weights are the requested CSS weights, which the available font may map to its closest face.

| Role | Size | Weight | Line height / spacing |
| --- | --- | --- | --- |
| General body copy | Inherited browser base, normally 16px | Normal, normally 400 | Normal unless specified by the component. Use 16px for new paragraph copy rather than the small metadata scale. |
| Wordmark, >=1024px | 24px | 900 | `1.2`; letter spacing `-.9px`; `.2px` text stroke. |
| Wordmark, 768-1023px | `clamp(15px, 1.4vw + 11px, 22px)` | 900 | Same desktop spacing/stroke. |
| Wordmark, 430-767px | 21px | 900 | `1.2`; letter spacing `-.7px`; same stroke. |
| Wordmark, <=429px | `clamp(15px, 6vw, 21px)` | 900 | Same phone spacing/stroke. |

Header layout (Arnav, 23 October 2026): the logo ([asset](asset-sources.md#header-logo), 34px high from 768px, 26px on phones) is the one home link at the left, alt "Campuscores home". The nav or menu sits at the same inline padding on the right. The "Campuscores" wordmark is decorative (`aria-hidden`), on one line and never overlaps. It is centered on the header at 430-767px and >=1024px. At <=429px and 768-1023px it is centered in the free space between the logo and the nav or menu. The desktop nav gap is `clamp(24px, 5vw - 27px, 34px)` (24px at 768-1023px).
| Hero heading, >=1024px | `clamp(36px, 4.1vw, 62px)` | 800 | `1.06`; letter spacing `-.04em`. |
| Hero heading, 768-1023px | `clamp(34px, 5.4vw, 52px)` | 800 | `1.06`; letter spacing `-.04em`. |
| Hero heading, <=767px | `clamp(34px, 9.3vw, 48px)` | 800 | `1.06`; letter spacing `-.04em`. |
| Section heading | 28px; 24px on phones | 800 | `1.2`; letter spacing `-.03em`. |
| Desktop main navigation | 13px | 600 | Normal; vertically centered in its link target. |
| Phone menu items | 14px | 600 | Normal. |
| Sport dropdown items | 13px | Inherited normal | Normal. |
| Sport filters | 14px; 12px on phones | 700 | Normal; letter spacing `-.01em`. Phone All Sports remains 14px. |
| Match sport/competition metadata | 11px | 600 | `1.3`. |
| Match competitor names | 14px; phone `clamp(12px, 3.4vw, 14px)` | 800 | `1.2`; uppercase in the colored header only. |
| Main match score | 32px; phone `clamp(28px, 8vw, 32px)` | 800 | Inherits `1.2`; letter spacing `-.04em`; tabular numerals. |
| Match clock/state line | 12px | 600 | Normal; centered. |
| Score table column headings | 11px | 600 | Normal. |
| Score table names/values | 13px | 700 | Normal; tabular numerals. Names retain their regular casing. |
| Tournament title | 16px | 700 | `1.25`; letter spacing `-.01em`. |
| Tournament date | 12px | Inherited normal | `1.4`. |

For future features, reuse the section-heading, body, card-title, label and numeric hierarchy above. The large display scale belongs to prominent hero content; do not enlarge every heading to the hero size. Keep detailed data readable and prioritize the main score. Use `font-variant-numeric: tabular-nums` for scores, clocks and aligned numeric tables.

## 4. Sport colors and local backgrounds

### Icon accents

[sports.js](../frontend/src/data/sports.js) defines the stable sport keys and icon accents:

| Sport | Key | Icon color |
| --- | --- | --- |
| Football | `football` | `#263653` |
| Basketball | `basketball` | `#eb6b20` |
| Tennis | `lawn-tennis` | `#598d2a` |
| Table Tennis | `table-tennis` | `#df354b` |
| Badminton | `badminton` | `#526780` |
| Volleyball | `volleyball` | `#665080` |

Selected filter icons become white through `currentColor`. Icon accents are not the card-background palette: Tennis has a green icon but blue/cyan artwork, for example.

### Sport texture assets

The gradients, diagonal streaks, highlights and texture are baked into these approved WebP files. Reuse the image rather than attempting to reproduce it with invented CSS gradient stops. All files are in `frontend/public/assets/`, served at `/assets/<filename>`.

| Sport | Background asset | Appearance | Hero portrait |
| --- | --- | --- | --- |
| Football | [football-background.webp](../frontend/public/assets/football-background.webp) | Deep crimson to bright red; diagonal light streaks, subtle dots and a ground texture. | `football-cr7.webp` |
| Basketball | [basketball-background.webp](../frontend/public/assets/basketball-background.webp) | Dark red/orange to gold/yellow; warm diagonal bands and grain. | `basketball.webp` |
| Tennis | [lawn-tennis-background.webp](../frontend/public/assets/lawn-tennis-background.webp) | Cyan highlights through bright blue to deep navy; diagonal bands and grain. | `lawn-tennis.webp` |
| Table Tennis | [table-tennis-background.webp](../frontend/public/assets/table-tennis-background.webp) | Royal/cobalt blue to navy; smoother diagonal bands. | `table-tennis.webp` |
| Badminton | [badminton-background.webp](../frontend/public/assets/badminton-background.webp) | Bright aqua/turquoise through teal to dark blue; textured diagonal bands. | `badminton-sindhu.webp` |
| Volleyball | [volleyball-background.webp](../frontend/public/assets/volleyball-background.webp) | Deep red to scarlet/orange with warm gold highlights; diagonal streaks and grain. | `volleyball.webp` |

Hero panels display the texture at `center / cover` with no darkening overlay. The same sport image is used on its live-match card, with the following overlay so white metadata, names and scores stay readable:

At widths up to 767px, hero panels and match cards use the same local `<sport>-background-640.webp` variant. Larger layouts use the original texture. Both variants preserve the approved color and shape; the 56% match overlay stays the same. Portraits have local 320px/640px candidates plus the original. Both portrait layers share `srcSet` and `sizes`, so they select the same image. Keep the measured image-slot sizes in `Hero.jsx` aligned with gallery CSS when geometry changes. See `asset-sources.md` for exact dimensions and derivation.

```css
/* --match-background is supplied by LiveMatchCard for its sport. */
background:
  linear-gradient(rgb(7 18 39 / 56%), rgb(7 18 39 / 56%)),
  var(--match-background) center / cover;
```

`LiveMatchCard.jsx` sets `--match-background` to `url('/assets/${match.sport}-background.webp')`. Keep the 56% darkening on the image layer; do not apply that opacity to the whole card or its white details. Keep sports mapped to their existing keys/assets. See [asset-sources.md](asset-sources.md) for provenance and licenses.

### Tournament photography

Tournament cards use the Venue_Library: five local, high-quality Unsplash photos of sports venues, with no athletes: `tournament-field.webp`, `tournament-stadium.webp`, `tournament-court.webp`, `tournament-tennis.webp`, and `tournament-track.webp`. A manager picks one in Tournament details, or "Automatic" (a fixed photo per tournament ID). These are photos, not sport gradient backgrounds. Show a `2 / 1` image above white details using `width: 100%`, `height: auto`, `object-fit: cover`; preserve each image's crop from the Venue_Library in `venues.js` (`position`). No image overlay is applied. Keep source/license records when adding or replacing photography.

## 5. Shapes, borders and elevation

| Element | Radius / border | Shadow |
| --- | --- | --- |
| Full-width header | 0 radius; 1px translucent border | `0 8px 30px rgb(35 65 110 / 6%)`; desktop also `0 2px 5px rgb(35 65 110 / 3%)`. |
| Sport filter | 14px; no border | `0 4px 16px rgb(35 65 110 / 4%)`. |
| Selected filter | Same shape | `0 6px 18px rgb(7 85 255 / 18%)`. |
| Match/tournament outer surface | 22px; no decorative outline | `0 6px 18px rgb(35 65 110 / 7%)`. |
| White match detail panel | 16px | No separate shadow. |
| Dropdown/phone menu panel | 16px; 1px `#e7edf7` | `0 12px 30px rgb(35 65 110 / 10%)`. |
| Dropdown item | 9px | No separate shadow. |

Keep rounded rectangular cards and restrained blue-gray shadows. The header stays rectangular and flush to the top/viewport edges. The hero's diagonal shapes use the existing measured clip paths; keep their geometry and transparent athlete cutouts in `Hero.jsx`/`HomePage.css` rather than rebuilding approximate shapes.

## 6. Layout and spacing

### Shared containers

| Viewport | Hero, filters and section container | Header padding |
| --- | --- | --- |
| >=1024px | `width: min(1280px, calc(100% - 64px))`, centered, plus 34px internal padding per side. Maximum usable inner width is 1212px. | 34px per side. |
| 768-1023px | `width: min(760px, calc(100% - 40px))`, centered, no internal padding. | 26px per side. |
| <=767px | `width: calc(100% - 32px)`, centered, no internal padding: 16px page gutters. | 16px per side. |

The header spans the full viewport; content stays centered at larger widths. Standard page content must not overflow horizontally. Horizontal overflow is deliberate inside the card rails only. Reuse these container rules for related future sections so heading/content edges align.

### Existing spacing values

- Hero: 40px top / 32px bottom margin on desktop; 36px / 28px below 1024px. Desktop column gap 24px; stacked title has 28px space below it.
- Filters: 12px gaps; 8px on phones. Bottom margin 44px, or 36px on phones.
- Match/tournament sections: 72px bottom margin, or 48px on phones. Heading-to-rail space 20px. Heading icon-to-text gap 10px; heading row gap 12px.
- Card rail: 18px gaps, or 16px on phones; 4px top and 18px bottom padding. Preserve 56px end padding so the last card can clear the fade.
- Match card: header padding `16px 16px 34px`; metadata/name gaps 8px. White details overlap the header by 18px, with 12px side/bottom margins and 8px internal padding. Table cells use `8px 2px` padding.
- Tournament card: detail padding `16px 40px 18px 16px`; title-to-date gap 8px. The opening chevron is 16px from the right.

Use the existing 8/12/16/18/20/24/28/32/36/40/44/48/72px spacing where it fits the same role. Preserve the established hierarchy instead of introducing unrelated spacing scales per team.

## 7. Responsive component rules

| Component | <=767px | 768-1023px | 1024-1199px | >=1200px |
| --- | --- | --- | --- | --- |
| Header | 64px minimum height; wordmark + icon-only menu. | 76px minimum height; desktop links/dropdown. | Same desktop header. | Same desktop header. |
| Hero | Two centered title lines above gallery. | One centered title line above gallery. | Two left-aligned title lines beside gallery. | Same side-by-side layout. |
| Sport filters | Full-width All Sports, then six tiles in a 3-column/2-row grid; icon above label. | Four tiles then three; icon beside label. | Four tiles then three. | Seven tiles in one row. |
| Match card width | `min(312px, calc(100vw - 76px))` | `clamp(290px, 30vw, 360px)` | Same clamp. | Same clamp, capped at 360px. |
| Tournament card width | `min(280px, calc(100vw - 76px))` | `clamp(248px, 22vw, 270px)` | Same clamp. | Same clamp, capped at 270px. |

Desktop hero columns are `.9fr 1.6fr`. The gallery occupies 90% of its available width, has a `5 / 3` aspect ratio, and scales its six panels as one composition. Keep the two text spans together at their prescribed breakpoints; do not shrink text to force a single line on narrow phones. Large screens retain the maximum content width and card-width caps.

## 8. Component appearance and behavior

### Navigation

Use `SiteHeader` for the shared header. Active Home uses primary blue and a 2px pale-blue underline. Phone menu has only the hamburger icon visually; its accessible label remains Menu. The menu target is at least 44px square. Menu links are at least 44px tall, and the phone's main menu items are 48px tall. Menus close on Escape, outside pointer interaction and navigation. Header Sports items are navigation links; the homepage sport tiles are filters.

### Sport filters

Use `SportIcon` and the palette from `sports.js`. Icons are 24px, unfilled SVG outlines on a 24-unit viewBox with 1.5-unit strokes and rounded caps/joins. Do not replace them with emoji or a different icon family. Preserve the Hugeicons MIT notice.

Unselected tiles use white and ink labels with sport-colored icons. Selected tiles use solid primary blue with white label/icon. Default minimum height is 56px; phone sport tiles are 74px and phone All Sports is 48px. Selection uses `aria-pressed`, has exactly one active filter, and changes only the live-match row in place. Reuse these color/shape states for equivalent selection controls on future pages.

### Live-match cards

Use the existing `LiveMatchCard` shell: sport texture/dark overlay above white details, white metadata, competitor names flanking a large centered score, and a smaller centered clock/state line. The section heading has an 11px round red dot on its left. It is a steady indicator; no blinking animation is implemented.

The detail area uses ink names/numbers, muted column labels, red current-period values and blue totals. The first column is 30% and left-aligned; numeric columns are centered with tabular figures. Keep the layout readable when sport teams replace columns; the sample table does not fix any sport's final scoring format.

### Sport page patterns

Source: [SportPage.css](../frontend/src/features/sports/SportPage.css). All six sport pages share these patterns. Page `h1` is 40px (32px on phones), weight 800, with the 32px sport icon. The icon colour is the sport `color` in `sports.js`, set as `--sport-color`. Sections reuse the section container and `.live-heading`.

- Texture: each page sets `--match-background` to `/assets/<sport>-background.webp` and `--match-background-phone` to `/assets/<sport>-background-640.webp` (section 4). Cards and the dialog header use it.

- Header-only match card: the live-match texture covers the whole card; no white detail area. The whole header is one button (44px+) with an inset focus outline.
- Date chips: a horizontally scrollable row above a rail. Same colours, 14px radius and selected states as sport filters; 44px tall; `aria-pressed`.
- Match detail dialog: native modal. Full viewport on phones; from 768px a centered `min(760px, 100% - 64px)` panel with 22px radius and a 56% dark backdrop. Textured header with a visible Close button, then the white detail panel. Completed-game winner scores are weight 800, others 500; current-game cells use `#d5203e`; the serving player has an 8px blue dot. A text legend explains bold, red and the dot. Winners get a small blue Winner tag.
- Period sports (football, basketball): the higher score of each completed half, quarter or overtime is bold; a tied period has no bold score. The current period is red while live. No serving dot.
- Volleyball puts the serving dot on the team label. Live tennis adds a red `Pts` column before the total. A 7–6 set shows the loser's tiebreak points as a small 9px number after the games.
- Team sports show a `Lineups` block below the score table. Football adds `Goals` (scorer and minute) and basketball adds `Top scorers` (points). Block headings match the info labels (11px, 600, `#607697`).
- Total columns use short labels (`Games`, `Sets`, `Goals` or `T`) with a full accessible name, so six numeric columns fit at 320px.

### Tournament cards

Use the existing `TournamentCard` shell: venue image above white title/date details, with a small blue opening chevron on the right. The section heading uses a 24px trophy icon in `#dd7f00`. The entire card is a link. Hover changes the title to primary blue; keyboard focus fully emphasizes the card. The card chevron means open the tournament and is not a rail-scrolling control.

### Horizontal rails and spotlight

Reuse `HorizontalRail` for both rows. Use native touch/trackpad/wheel scrolling, `scroll-snap-type: x proximity`, start-aligned cards and hidden scrollbars. When the rail itself has focus, unmodified Left/Right arrow keys scroll one visible page through the native scroll API. Keys on child controls keep their normal behavior. No carousel arrows or View All controls. The right edge has a 56px fade:

```css
background: linear-gradient(90deg, transparent, #f6faff);
```

The fade is decorative and ignores pointer input. At less than 90% card visibility, the inner surface scales to `.9` with `.66` opacity, anchored at left center. At 90% or more, the surface has full size/opacity. Outer card slots keep their original dimensions, preserving scroll/snap geometry. Apply this on phones, tablets, desktops and larger screens. Keyboard-focused tournament cards restore full emphasis. Reduced motion keeps the opacity treatment but removes scale and transitions.

## 9. Motion and decorative backgrounds

Motion is restrained and supports the content:

| Treatment | Existing setting |
| --- | --- |
| Hero title reveal | Opacity only, `.45s ease-out`. |
| Navigation color | `.15s ease`. |
| Filter color/background | `.16s ease`. |
| Partial-card transform | `.24s cubic-bezier(.16, 1, .3, 1)`. |
| Partial-card opacity | `.24s ease`. |
| Hero matrix | Original blue 2D canvas dots, capped at 30fps. |

The dot matrix fills the hero only, behind text/artwork, with no pointer interaction or visible pause control. Dot spacing is 10px when the canvas is under 600px wide, otherwise 14px; size and alpha vary gently through the original field. Preserve `HeroMatrix` instead of introducing another animation system.

The soft edge comes from the existing masks:

- Desktop: `radial-gradient(ellipse at 75% 54%, #000 22%, transparent 78%)`.
- Below 1024px: `linear-gradient(transparent 20%, #000 40% 80%, transparent)`.

The field is decorative, not a repeated background for every section. Reduced motion freezes the canvas and removes title/transition animation. Animation work stops when the hero is offscreen, the document is hidden or the route unmounts.

## 10. Accessibility and extension checklist

- Keep visible keyboard focus: 3px primary-blue outline with 5px offset by default. Tournament cards use a -3px inset offset to keep focus visible inside the rail.
- Keep interactive targets at least 44px and support keyboard activation as well as touch. Use semantic links for destinations and buttons for selection/actions.
- Preserve readable ink-on-white details and white-on-darkened-image headers. Labels, table structure and selection semantics accompany color.
- Keep section hierarchy clear: one page `h1`, section `h2`, card `h3`. Decorative icons/canvas stay hidden from assistive technology; meaningful images have useful alt text.
- Respect reduced motion. Do not require hover to reveal essential information or controls.
- Image skeletons ([global.css](../frontend/src/styles/global.css)): hero panels, match textures and tournament images show a neutral `#e4e9f1` block with a subtle shimmer (5 runs, none with reduced motion) until the image paints over it. Images keep their alt text but use `color: transparent`, so no alt text shows while loading. The boxes keep their size, so nothing shifts.
- Keep the approved card colors, rounded shapes, white detail areas and horizontal usage when replacing temporary content. Match names/scores/clocks/columns and tournament names/IDs/dates remain editable display fixtures.
- For a future page, begin with shared colors, font hierarchy, container gutters, card radii, icons and focus states. Reuse the existing header/rail/card components where their contract fits; add only the feature's necessary layout. A new staff form or list uses the Staff_Style in section 12. Another unbuilt page type or a new status is not already designed by this guide.
- When an approved design changes, update this guide and the actual CSS/component together; record the decision in `memory.md`. Keep asset credits current.

## 11. Source map for agents

| Design responsibility | Existing source |
| --- | --- |
| Brand colors, font family, section headings, content widths and focus | [global.css](../frontend/src/styles/global.css) |
| Header, navigation, menus and wordmark | [SiteHeader.css](../frontend/src/components/SiteHeader.css) |
| Hero geometry, title, masks and sport-filter layout/states | [HomePage.css](../frontend/src/features/home/HomePage.css), [Hero.jsx](../frontend/src/features/home/Hero.jsx) |
| Dot field and lifecycle | [HeroMatrix.jsx](../frontend/src/features/home/HeroMatrix.jsx) |
| Shared rail, edge fade and partial-card emphasis | [HorizontalRail.css](../frontend/src/components/HorizontalRail.css), [HorizontalRail.jsx](../frontend/src/components/HorizontalRail.jsx) |
| Match shell, score typography and table styling | [LiveMatchCard.css](../frontend/src/features/matches/LiveMatchCard.css), [LiveMatchCard.jsx](../frontend/src/features/matches/LiveMatchCard.jsx) |
| Venue crop, title/date layout and tournament interactions | [TournamentCard.css](../frontend/src/features/tournaments/TournamentCard.css), [TournamentCard.jsx](../frontend/src/features/tournaments/TournamentCard.jsx) |
| Sport keys/colors and outline icons | [sports.js](../frontend/src/data/sports.js), [SportIcon.jsx](../frontend/src/components/SportIcon.jsx) |
| Artwork and license records | `frontend/public/assets/`, [asset-sources.md](asset-sources.md) |
| Staff_Style and shared staff components | [staff.css](../frontend/src/features/staff/staff.css), `frontend/src/features/staff/` |
| Manager and Super Admin lists, facts and forms | [manage.css](../frontend/src/features/manage/manage.css), [admin.css](../frontend/src/features/admin/admin.css) |

## 12. Staff_Style

Status: **final**. Arnav approved it with the layout on 21 October 2026, commit `27db57d` ([memory.md](memory.md#stage-1-layout-approval--21-october-2026)). The values below are the shipped values in `staff.css`, `manage.css` and `admin.css`. Change them only with a new approval, and change this section and the CSS together.

Staff screens (Manager console, Admin console and Match Scorer pages) are work screens for coaches, often on a phone. They keep `SiteHeader`, the colors of section 2 and the section container of section 6. They use quiet white panels on the page tint, ink text, one blue Primary_Action and color only for status and live data. These values apply only inside `.staff`; the public pages keep sections 1 to 11. Reused public components inside staff screens (My Matches cards, Score console sections) keep their own section 8 styles.

| Token | Value |
| --- | --- |
| Font | `Helvetica, Arial, sans-serif`; tabular numerals for times and scores |
| Body, field values, labels, button labels | 17px, line height 1.5; labels weight 700 |
| Minimum visible text | 14px (help text, table metadata), `#50688c` |
| `h1` | 32px / 800 (28px at <=767px), letter spacing -.03em |
| `h2` | 24px / 800, letter spacing -.03em |
| `h3` | 20px / 800, letter spacing -.02em; list group headings in Admin home 17px / 700 |
| Container | Section 6 widths: `min(1280px, 100% - 64px)` with 34px inline padding; `min(760px, 100% - 40px)` at <=1023px; `100% - 32px` at <=767px. Main area 32px top / 72px bottom (24px / 48px at <=767px) |
| Staff navigation | One row of 44px text links, weight 700, 24px apart, below `SiteHeader` with a 1px `#e7edf7` bottom border; scrolls sideways inside its own row on phones. Current item and hover in `#0755ff` with a 2px `#b7ceff` underline |
| Form control | White, 1px `#50688c` border, 14px radius, minimum height 52px, 12px x 16px padding; checkboxes and radios 24px with `#0755ff` accent in 44px rows |
| Primary_Action | Filled `#0755ff` (hover `#064ae0`), white 17px bold label, 14px radius, minimum height 52px, 24px side padding; full content width at <=767px |
| Secondary button | White (hover `#eaf2ff`), 2px `#0755ff` border, `#0755ff` label, same size |
| Text button and inline link | `#0755ff`, underlined with a 3px offset, target at least 44x44px |
| Destructive button | Filled `#d5203e`, white label; only the confirm button of the confirmation dialog |
| Busy or disabled control | Opacity .66, progress cursor |
| Error text | `#d5203e`, 17px bold, prefixed "Error:" for screen readers; invalid field border 2px `#d5203e`; error summary: white panel with a 2px `#d5203e` border, at most 640px wide |
| Panel | White, 16px radius, 1px `#e7edf7` border, no shadow, 24px padding (16px at <=767px) |
| Lists | Below 768px: stacked white cards (16px radius, 1px `#e7edf7` border, 16px padding) with labelled lines in `#50688c`. From 768px: a white table with a 16px radius, 1px `#e7edf7` row rules, 14px bold `#50688c` column headers, 12px x 16px cells, no zebra stripes |
| Facts | Label in 14px bold `#50688c` above or beside its value |
| Owner marker | 14px bold ink text on a `#eaf2ff` pill beside the tournament name |
| Confirmation dialog | Native modal, at most 560px wide, 24px padding (16px at <=767px), 16px radius, 1px `#e7edf7` border, shadow `0 12px 30px rgb(35 65 110 / 10%)`, backdrop `rgb(7 18 39 / 56%)`; buttons full width at <=767px |
| Spacing | 8 / 16 / 24 / 32 / 48px; 16px between fields, 24px before the Primary_Action, 48px between sections |
| Form column | Maximum width 640px |
| Reading width | Paragraph and help text maximum `80ch` at >=1024px |
| Status | Text label always; Live adds an 11px `#ff334b` dot beside the text; Not scored text `#50688c`; Final ink bold |
| Focus | Section 10 style: 3px `#0755ff` outline, 5px offset (2px inside table cells), never clipped |
| Motion | None: no transition or animation inside `.staff`, also without reduced motion |

Rules: exactly one Primary_Action per screen and per open dialog, after the content it acts on, and at the top of list screens. A dialog with a destructive confirm has no Primary_Action. The sign-in choice page (`SignInChoiceView.css`) has three equal full-width secondary links in a 400px column, 16px apart, under a 40px / 800 `h1` (32px at <=767px), and no Primary_Action. `#607697` is not used for text on the tint, because it measures 4.4:1 on `#f6faff`. Measured contrast: `#50688c` on white 5.7:1 and on `#f6faff` 5.4:1; `#0755ff` on white and white on `#0755ff` 5.6:1; white on `#d5203e` and `#d5203e` on white 5.1:1.

Shared components in `frontend/src/features/staff/`: `StaffShell` (header, staff navigation, Back link, `h1`, live regions), `ScreenState` (loading, error with "Try again", empty) and `NoAccess`, `Field`, `ErrorSummary`, `ConfirmDialog` (native modal), `labels.js` (display names and error sentences) and `formatSummary.js` (Default_Format summary).

## 13. Larger phone match details and public illustrations

Approved by Arnav in the 24 October 2026 handoff. Up to 767px, match details use 18–24px side names, a 40–52px score, 16px status and table values, 15px player lines and 14px table headers, labels and legend. Show sport and round in the hero. Date/Time and Tournament/Round form two columns; Venue spans both. Use safe-area padding. Longer custom tables scroll inside their labelled region. Wider layouts keep their previous sizing.

Public empty results use `components/EmptyState.jsx`: a decorative local illustration, an HTML `h3` (20px desktop, 18px phone) and 16px body copy. Desktop places the 240px image beside the text with a 24px gap. Phones place the 180px image above left-aligned text with a 16px gap. Keep the section heading. A loading or failed read shows its status and recovery control instead of an empty illustration. A selected day with no match retains its date-specific sentence.

Tournament sport links use the supplied square illustrations in three columns from 768px and two columns on phones. Each card keeps the sport name clear of the image and navigates to that tournament sport. From 1201px, the Table Tennis illustration ends 8px above the label box so the table and net cannot cover the name. It is a link, not a filter. Use the source preview's image position and established site typography and spacing. Assets and derivation are in [asset-sources.md](asset-sources.md#public-illustrations--24-october-2026).

## 14. Scoring finish and card stage — 24 October 2026

Preserve the approved card shells, textures and staff typography. Public card metadata has three columns: sport at left, stage centred and tournament at right. Side columns have equal width so the stage stays centred with different label lengths. Wrap long text inside its column. Centre the winner sentence below the score; omit its Final prefix. Early results have a separate completed-scores-only note.

After play ends, focus the result-review heading. Keep Undo and review separate from permanent locking. Final review shows both recorded totals and the selected winner, an immediate-loss-of-Undo warning, an acknowledgement checkbox and a clearly labelled permanent-lock button. Start dialog focus on Cancel. Dialogs scroll inside the viewport and controls wrap on narrow screens. Keep pending-lock and accepted-lock states distinct.
