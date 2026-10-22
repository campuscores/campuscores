// One pure Event_Time_Zone and phase model for the API and the Frontend.
// India_Time is a fixed UTC+05:30 zone with no daylight saving, so plain
// arithmetic with a constant offset is exact. Callers pass the clock (`now`
// or `today`); this module never reads Date.now(), so one function serves both
// Worker_Time (public reads) and database time (staff reads).

// The one Event_Time_Zone setting. name: IANA zone for Intl and Postgres;
// offsetMinutes: for arithmetic; label: display text. This is the only place
// the zone name, offset and label appear (Requirement 23.13).
export const EVENT_TIME_ZONE = Object.freeze({ name: 'Asia/Kolkata', label: 'IST', offsetMinutes: 330 });

const OFFSET = EVENT_TIME_ZONE.offsetMinutes * 60000, DAY = 86400000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^\d{2}:\d{2}$/;

// IST calendar date 'YYYY-MM-DD' of a UTC instant. Shifting by the fixed offset
// turns the event-zone wall clock into UTC, so the date part of the ISO string
// is the event-zone date.
export const istDate = (ms) => new Date(ms + OFFSET).toISOString().slice(0, 10);

// First event-zone midnight strictly after `ms` (Match_Day_End). Floor to the
// start of the IST day, add one day, then shift back to UTC.
export const matchDayEnd = (ms) => (Math.floor((ms + OFFSET) / DAY) + 1) * DAY - OFFSET;

// Split a UTC instant into its IST date and HH:MM wall-clock parts.
export const utcToIst = (ms) => {
  const s = new Date(ms + OFFSET).toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
};

// Combine an IST date and HH:MM time into a UTC instant (ms). Returns NaN for
// any malformed or impossible value. The round-trip check rejects values that
// parse but overflow, such as 2026-02-30 or 24:00, because utcToIst of the
// result would not give back the same date and time.
export function istToUtc(date, time) {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return NaN;
  // Parse as if the wall clock were UTC, then subtract the offset to get the
  // true UTC instant of that IST wall-clock moment.
  const asUtc = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(asUtc)) return NaN;
  const ms = asUtc - OFFSET;
  const back = utcToIst(ms);
  return back.date === date && back.time === time ? ms : NaN;
}

// '14:30 IST' display string for a UTC instant.
export const timeText = (ms) => `${utcToIst(ms).time} ${EVENT_TIME_ZONE.label}`;

// Public and staff grouping of a match. `now` is the caller's clock.
// LIVE (and legacy REJECTED) are live; APPROVED (and legacy PENDING_APPROVAL)
// are past ("Final"); a SCHEDULED match is past ("Not scored") once its
// Match_Day_End has passed, otherwise upcoming.
export function matchPhase({ status, scheduledAt }, now) {
  if (status === 'LIVE' || status === 'REJECTED') return 'live';
  if (status === 'APPROVED' || status === 'PENDING_APPROVAL') return 'past';
  // SCHEDULED: upcoming until Match_Day_End, then Not_Scored (past).
  // A SCHEDULED match with no scheduledAt stays upcoming (no day to end).
  if (scheduledAt != null && now >= matchDayEnd(scheduledAt)) return 'past';
  return 'upcoming';
}

// Public grouping of a tournament. `today` is the caller's clock. Only ONGOING
// and COMPLETED tournaments are public; DRAFT and ARCHIVED return null.
// ONGOING is upcoming before the start date, live within the dates inclusive,
// and past after the end date, all by IST calendar date.
export function tournamentPhase({ status, startsOn, endsOn }, today) {
  if (status === 'COMPLETED') return 'past';
  if (status !== 'ONGOING') return null; // DRAFT, ARCHIVED: not public
  const day = istDate(today);
  if (day < startsOn) return 'upcoming';
  if (day > endsOn) return 'past';
  return 'live';
}

// "Needs a scorer" predicate for Manager home (Requirement 8.3). True when the
// match is upcoming, has no ACTIVE Assignment, and its IST date falls in the
// 7-day window from today to today + 6 IST dates, inclusive.
export function needsScorer({ status, scheduledAt, hasActiveAssignment }, now) {
  if (hasActiveAssignment) return false;
  if (matchPhase({ status, scheduledAt }, now) !== 'upcoming') return false;
  if (scheduledAt == null) return false;
  const matchDay = istDate(scheduledAt);
  const from = istDate(now);
  const to = istDate(now + 6 * DAY);
  return matchDay >= from && matchDay <= to;
}
