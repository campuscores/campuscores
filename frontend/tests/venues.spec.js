import { test, expect } from '@playwright/test';
import { VENUES, toEventProp } from '../src/features/tournaments/venues.js';
import { sampleTournaments } from '../src/features/tournaments/sampleTournaments.js';

// Pure mapping checks; no browser page is opened.
test('public tournament maps to the TournamentCard event prop with its Venue_Library photo', () => {
  const event = toEventProp({ id: 3, slug: 'spring-cup', name: 'Spring Cup', startsOn: '2026-10-01', endsOn: '2026-10-12', imageKey: 'court', phase: 'live' });
  expect(event).toEqual({
    id: 'spring-cup',
    name: 'Spring Cup',
    image: 'tournament-court.webp',
    alt: 'Empty indoor basketball court with a wooden floor',
    position: 'center',
    start: '2026-10-01',
    end: '2026-10-12',
    startLabel: '1 Oct',
    endLabel: '12 Oct 2026',
  });
});

test('calendar dates keep their day at the year boundary', () => {
  expect(toEventProp({ slug: 'a', name: 'A', startsOn: '2026-12-31', endsOn: '2027-01-01', imageKey: 'track' })).toMatchObject({ startLabel: '31 Dec', endLabel: '1 Jan 2027' });
});

test('display fixtures use the five Venue_Library photos once each', () => {
  expect(Object.keys(VENUES)).toEqual(['field', 'stadium', 'court', 'tennis', 'track']);
  expect(sampleTournaments.map(event => event.image)).toEqual(Object.values(VENUES).map(venue => venue.image));
});
