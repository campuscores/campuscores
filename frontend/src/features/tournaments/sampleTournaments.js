import { VENUES } from './venues.js';

// Display fixtures only. Event identities, dates and venue associations are temporary.
export const sampleTournaments = [
  {
    "id": "thaparlympics-2026",
    "name": "Thaparlympics 2026",
    ...VENUES.field,
    "start": "2026-10-01",
    "end": "2026-10-12",
    "startLabel": "1 Oct",
    "endLabel": "12 Oct 2026"
  },
  {
    "id": "inter-hostel-cup",
    "name": "Inter-Hostel Cup",
    ...VENUES.stadium,
    "start": "2026-10-15",
    "end": "2026-10-24",
    "startLabel": "15 Oct",
    "endLabel": "24 Oct 2026"
  },
  {
    "id": "court-championship",
    "name": "Court Championship",
    ...VENUES.court,
    "start": "2026-10-20",
    "end": "2026-10-30",
    "startLabel": "20 Oct",
    "endLabel": "30 Oct 2026"
  },
  {
    "id": "racquet-open",
    "name": "Racquet Open",
    ...VENUES.tennis,
    "start": "2026-11-02",
    "end": "2026-11-08",
    "startLabel": "2 Nov",
    "endLabel": "8 Nov 2026"
  },
  {
    "id": "athletics-meet",
    "name": "Athletics Meet",
    ...VENUES.track,
    "start": "2026-11-12",
    "end": "2026-11-15",
    "startLabel": "12 Nov",
    "endLabel": "15 Nov 2026"
  }
];
