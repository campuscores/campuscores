# Asset sources

Retrieved and inspected on 8 October 2026. These photographs illustrate the demonstration tournament cards; they do not identify the campus or event venues. Event names and dates are display content for the current frontend.

All five selected photos are free under the [Unsplash License](https://unsplash.com/license). Attribution is appreciated but not required. Files are locally hosted WebP images supplied by Unsplash's image CDN at 1000px width and quality 85. Only the displayed crop changes through CSS `object-fit` and `object-position`. These five photos are the Venue_Library: [venues.js](../frontend/src/features/tournaments/venues.js) maps the keys `field`, `stadium`, `court`, `tennis` and `track` to the files below, with alt text and crop.

| Local asset | Original photo and creator | Delivery URL |
|---|---|---|
| [tournament-field.webp](../frontend/public/assets/tournament-field.webp) | [Eliézer Fernandes (@lii_raw)](https://unsplash.com/photos/empty-stadium-with-green-field-and-blue-sky-FcI9d7Yw4CU) | [1000px WebP](https://images.unsplash.com/photo-1771344166393-52fe1c1721ce?auto=format&fit=crop&fm=webp&q=85&w=1000) |
| [tournament-stadium.webp](../frontend/public/assets/tournament-stadium.webp) | [Eddie Pipocas](https://unsplash.com/photos/empty-football-stadium-with-green-field-and-blue-seats-a5xOeMXAYX8) | [1000px WebP](https://images.unsplash.com/photo-1755408218980-e52e151a92f8?auto=format&fit=crop&fm=webp&q=85&w=1000) |
| [tournament-court.webp](../frontend/public/assets/tournament-court.webp) | [Griest Projects / Mitchell Griest](https://unsplash.com/photos/indoor-photography-of-basketball-court-EKXCGy4Zsbg) | [1000px WebP](https://images.unsplash.com/photo-1530232288631-63b79b9126b0?auto=format&fit=crop&fm=webp&q=85&w=1000) |
| [tournament-tennis.webp](../frontend/public/assets/tournament-tennis.webp) | [Marius Kriz (@marius241001)](https://unsplash.com/photos/empty-tennis-courts-with-blue-seating-and-nets-sEEHYiMuHtc) | [1000px WebP](https://images.unsplash.com/photo-1758544919719-8aa318a82b36?auto=format&fit=crop&fm=webp&q=85&w=1000) |
| [tournament-track.webp](../frontend/public/assets/tournament-track.webp) | [Nino Steffen](https://unsplash.com/photos/a-red-running-track-with-white-lines-on-it-Ai0yZfnQJII) | [1000px WebP](https://images.unsplash.com/photo-1717071817841-97c0b2c6723c?auto=format&fit=crop&fm=webp&q=85&w=1000) |

The trophy icon uses [Hugeicons TrophyIcon](https://cdn.jsdelivr.net/npm/@hugeicons/core-free-icons@4.3.5/dist/esm/TrophyIcon.js) from the same MIT-licensed package as the existing sport icons. Its license notice is preserved in [Hugeicons-LICENSE.txt](../frontend/public/assets/Hugeicons-LICENSE.txt). The small card chevron follows the incumbent navigation's outline style.

## Hero artwork and favicon

The six approved athlete cutouts and six textured sport backgrounds are supplied/generated artwork prepared for this homepage. They are not official Thapar branding. Their original preparation metadata is retained in the local pre-migration archive, outside the application repository.

| Sport | Portrait | Background |
| --- | --- | --- |
| Football | `football-cr7.webp` | `football-background.webp` |
| Basketball | `basketball.webp` | `basketball-background.webp` |
| Lawn tennis | `lawn-tennis.webp` | `lawn-tennis-background.webp` |
| Badminton | `badminton-sindhu.webp` | `badminton-background.webp` |
| Table tennis | `table-tennis.webp` | `table-tennis-background.webp` |
| Volleyball | `volleyball.webp` | `volleyball-background.webp` |

The 17 original images and their 18 responsive versions are in `frontend/public/assets/`. The app makes no remote image request. `frontend/public/favicon.ico` is the local blue/white T favicon. `SportIcon.jsx` contains the Hugeicons outlines. Keep their MIT notice with the assets. Do not use an institute logo without approval.

## Responsive artwork — 9 October 2026

These files are smaller copies of the approved local artwork. They contain no new image content. The source files, crop, aspect ratio, colors and portrait transparency are retained. The copies use Lanczos resize and WebP quality 88. They inherit the source records above.

| Source portrait | Smaller files | Dimensions |
| --- | --- | --- |
| `football-cr7.webp` | `football-cr7-320.webp`, `football-cr7-640.webp` | 320 × 480; 640 × 960 |
| `basketball.webp` | `basketball-320.webp`, `basketball-640.webp` | 320 × 320; 640 × 640 |
| `lawn-tennis.webp` | `lawn-tennis-320.webp`, `lawn-tennis-640.webp` | 320 × 320; 640 × 640 |
| `badminton-sindhu.webp` | `badminton-sindhu-320.webp`, `badminton-sindhu-640.webp` | 320 × 320; 640 × 640 |
| `table-tennis.webp` | `table-tennis-320.webp`, `table-tennis-640.webp` | 320 × 320; 640 × 640 |
| `volleyball.webp` | `volleyball-320.webp`, `volleyball-640.webp` | 320 × 320; 640 × 640 |

Both portrait layers use the same `srcSet` and `sizes`. The browser selects a source for the rendered size and pixel density. The original file is the fallback. The size calculation includes the panel width, the `20cqh` extension and the gallery's width limits.

| Source texture | Phone file | Dimensions |
| --- | --- | --- |
| `football-background.webp` | `football-background-640.webp` | 640 × 960 |
| `basketball-background.webp` | `basketball-background-640.webp` | 640 × 480 |
| `lawn-tennis-background.webp` | `lawn-tennis-background-640.webp` | 640 × 480 |
| `badminton-background.webp` | `badminton-background-640.webp` | 640 × 640 |
| `table-tennis-background.webp` | `table-tennis-background-640.webp` | 640 × 480 |
| `volleyball-background.webp` | `volleyball-background-640.webp` | 640 × 480 |

At widths up to 767px, hero panels and live-match cards use the same phone texture URLs. This avoids downloading both sizes for the two sections. At larger widths they use the originals. The live-match overlay remains at 56%. Keep the hero portraits eager because they are visible at page entry.
