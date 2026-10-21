// Venue_Library: the approved local venue photographs (sources and licenses in doc/asset-sources.md).
// Keys are the stored `tournaments.image_key` values; `position` keeps each photo's approved crop.
export const VENUES = {
  field: { image: 'tournament-field.webp', alt: 'Empty football pitch and stadium seating', position: 'center 85%' },
  stadium: { image: 'tournament-stadium.webp', alt: 'Green football pitch beneath blue stadium seating', position: 'center 60%' },
  court: { image: 'tournament-court.webp', alt: 'Empty indoor basketball court with a wooden floor', position: 'center' },
  tennis: { image: 'tournament-tennis.webp', alt: 'Empty blue tennis courts with nets and stadium seating', position: 'center 65%' },
  track: { image: 'tournament-track.webp', alt: 'Red athletics track with white lane markings', position: 'center' },
};

// A calendar date (YYYY-MM-DD) is the event's own date, so it is formatted as-is with no zone shift.
const dayLabel = (date, year) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: year ? 'numeric' : undefined, timeZone: 'UTC' });

/**
 * Public tournament (`{ slug, name, startsOn, endsOn, imageKey }`, imageKey already effective from the API)
 * to the `event` prop of the existing TournamentCard.
 */
export function toEventProp(tournament) {
  return {
    id: tournament.slug,
    name: tournament.name,
    ...VENUES[tournament.imageKey],
    start: tournament.startsOn,
    end: tournament.endsOn,
    startLabel: dayLabel(tournament.startsOn),
    endLabel: dayLabel(tournament.endsOn, true),
  };
}
