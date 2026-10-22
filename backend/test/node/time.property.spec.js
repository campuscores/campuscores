// Feature: staff-roles-manager-console, Property 2: Match_Phase follows the India_Time day
// Validates: Requirements 8.2, 15.4, 15.12, 17.4, 17.6
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  EVENT_TIME_ZONE,
  istDate,
  istToUtc,
  matchDayEnd,
  matchPhase,
  needsScorer,
  timeText,
  tournamentPhase,
  utcToIst,
} from '../../../shared/time.mjs';

// 00:00 IST is 18:30 UTC the previous day, so every IST midnight is at an
// 18:30:00 UTC wall clock. Generators below include instants within 1 second
// of such a boundary so the day-boundary flip is exercised directly.
const DAY = 86400000;
const IST_MIDNIGHT_UTC = DAY / 2 - 330 * 60000; // 18:30:00 UTC = 66_600_000 ms into the UTC day.

// Instants spread across a wide range of event days (2000..2099 and beyond),
// as plain millisecond timestamps.
const anyInstant = fc.integer({ min: 0, max: 4_000_000_000_000 });

// An instant pinned to within +/- 1 second of some IST midnight. Pick a whole
// day, land on that day's 18:30 UTC boundary, then add a small offset.
const nearMidnight = fc
  .tuple(fc.integer({ min: 0, max: 46_000 }), fc.integer({ min: -1000, max: 1000 }))
  .map(([dayIndex, offset]) => dayIndex * DAY + IST_MIDNIGHT_UTC + offset);

// Either a wide instant or one hugging a midnight boundary.
const instant = fc.oneof(anyInstant, nearMidnight);

const SCHEDULED = 'SCHEDULED';
const LIVE_STATUSES = ['LIVE', 'REJECTED'];
const PAST_STATUSES = ['APPROVED', 'PENDING_APPROVAL'];
const status = fc.constantFrom(SCHEDULED, ...LIVE_STATUSES, ...PAST_STATUSES);

describe('Property 2: Match_Phase follows the India_Time day', () => {
  it('maps LIVE/REJECTED to live and APPROVED/PENDING_APPROVAL to past regardless of time', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...LIVE_STATUSES, ...PAST_STATUSES),
        fc.option(instant, { nil: null }),
        instant,
        (s, scheduledAt, now) => {
          const expected = LIVE_STATUSES.includes(s) ? 'live' : 'past';
          expect(matchPhase({ status: s, scheduledAt }, now)).toBe(expected);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('SCHEDULED is past exactly at/after matchDayEnd and upcoming strictly before', () => {
    fc.assert(
      fc.property(instant, instant, (scheduledAt, now) => {
        const end = matchDayEnd(scheduledAt);
        const expected = now >= end ? 'past' : 'upcoming';
        expect(matchPhase({ status: SCHEDULED, scheduledAt }, now)).toBe(expected);
      }),
      { numRuns: 1000 },
    );
  });

  it('SCHEDULED flips exactly at matchDayEnd and nowhere else around it', () => {
    fc.assert(
      fc.property(instant, (scheduledAt) => {
        const end = matchDayEnd(scheduledAt);
        const phaseAt = (now) => matchPhase({ status: SCHEDULED, scheduledAt }, now);
        // One ms before the boundary is still upcoming; at and after it is past.
        expect(phaseAt(end - 1)).toBe('upcoming');
        expect(phaseAt(end)).toBe('past');
        expect(phaseAt(end + 1)).toBe('past');
        // The scheduled instant itself is always within its own day, so upcoming.
        expect(phaseAt(scheduledAt)).toBe('upcoming');
      }),
      { numRuns: 1000 },
    );
  });

  it('SCHEDULED with no scheduledAt stays upcoming for any now', () => {
    fc.assert(
      fc.property(instant, (now) => {
        expect(matchPhase({ status: SCHEDULED, scheduledAt: null }, now)).toBe('upcoming');
        expect(matchPhase({ status: SCHEDULED, scheduledAt: undefined }, now)).toBe('upcoming');
      }),
      { numRuns: 200 },
    );
  });

  it('matchDayEnd is the first IST midnight strictly after t', () => {
    fc.assert(
      fc.property(instant, (t) => {
        const end = matchDayEnd(t);
        expect(end).toBeGreaterThan(t);
        // The instant just before the boundary shares t's IST date; the boundary
        // itself is a new, later IST date.
        expect(istDate(end - 1)).toBe(istDate(t));
        expect(istDate(end) > istDate(t)).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });

  it('depends only on now, so Worker_Time and database time agree', () => {
    fc.assert(
      fc.property(status, fc.option(instant, { nil: null }), instant, (s, scheduledAt, now) => {
        const match = { status: s, scheduledAt };
        // The same now always yields the same phase; no hidden clock is read.
        expect(matchPhase(match, now)).toBe(matchPhase(match, now));
      }),
      { numRuns: 500 },
    );
  });
});

// Feature: staff-roles-manager-console, Property 3: Needs-a-scorer window
// Validates: Requirements 8.3
// An independent IST-date reference built from Intl, so the test does not copy
// the module's constant-offset arithmetic. en-CA formats as YYYY-MM-DD.
const istFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: EVENT_TIME_ZONE.name,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const refIstDate = (ms) => istFmt.format(new Date(ms));

// Whole number of IST days between two instants' IST dates, derived from the
// Intl reference so the window check is independent of the module.
const refDayDiff = (fromMs, toMs) =>
  Math.round((Date.parse(`${refIstDate(toMs)}T00:00:00Z`) - Date.parse(`${refIstDate(fromMs)}T00:00:00Z`)) / DAY);

// Upcoming statuses only (SCHEDULED is the one upcoming phase); the rest are
// never upcoming and so can never need a scorer.
const UPCOMING_STATUS = 'SCHEDULED';

describe('Property 3: Needs-a-scorer window', () => {
  it('holds exactly when upcoming, unassigned, scheduled and in the 7-day IST window', () => {
    fc.assert(
      fc.property(
        status,
        fc.option(instant, { nil: null }),
        fc.boolean(),
        instant,
        (s, scheduledAt, hasActiveAssignment, now) => {
          const match = { status: s, scheduledAt, hasActiveAssignment };
          const upcoming = matchPhase({ status: s, scheduledAt }, now) === 'upcoming';
          const inWindow =
            scheduledAt != null && refDayDiff(now, scheduledAt) >= 0 && refDayDiff(now, scheduledAt) <= 6;
          const expected = upcoming && !hasActiveAssignment && scheduledAt != null && inWindow;
          expect(needsScorer(match, now)).toBe(expected);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('is true at day 0 and day 6 and false at day 7 and day -1', () => {
    fc.assert(
      fc.property(nearMidnight, (now) => {
        // Anchor a scheduled instant a whole number of IST days from `now`.
        // Build the scheduled instant from `now`'s IST date plus N days, at
        // midday IST so it sits safely inside its own day and stays upcoming.
        const base = Date.parse(`${refIstDate(now)}T12:00:00Z`) - EVENT_TIME_ZONE.offsetMinutes * 60000;
        const at = (days) => base + days * DAY;
        const match = (scheduledAt) => ({ status: UPCOMING_STATUS, scheduledAt, hasActiveAssignment: false });

        // now sits before each of these scheduled days, so all stay upcoming.
        expect(refDayDiff(now, at(0))).toBe(0);
        expect(needsScorer(match(at(0)), now)).toBe(true); // day 0: inclusive start
        expect(needsScorer(match(at(6)), now)).toBe(true); // day 6: inclusive end
        expect(needsScorer(match(at(7)), now)).toBe(false); // day 7: past the window
        expect(needsScorer(match(at(-1)), now)).toBe(false); // day -1: before today
      }),
      { numRuns: 500 },
    );
  });

  it('each disqualifier flips an in-window match to false', () => {
    fc.assert(
      fc.property(nearMidnight, fc.constantFrom(1, 2, 3, 4, 5), (now, days) => {
        const base = Date.parse(`${refIstDate(now)}T12:00:00Z`) - EVENT_TIME_ZONE.offsetMinutes * 60000;
        const scheduledAt = base + days * DAY;
        // Baseline: upcoming, unassigned, scheduled, inside the window -> true.
        expect(
          needsScorer({ status: UPCOMING_STATUS, scheduledAt, hasActiveAssignment: false }, now),
        ).toBe(true);
        // An ACTIVE Assignment removes it.
        expect(
          needsScorer({ status: UPCOMING_STATUS, scheduledAt, hasActiveAssignment: true }, now),
        ).toBe(false);
        // A non-upcoming status (Live or Final) removes it.
        expect(needsScorer({ status: 'LIVE', scheduledAt, hasActiveAssignment: false }, now)).toBe(false);
        expect(needsScorer({ status: 'APPROVED', scheduledAt, hasActiveAssignment: false }, now)).toBe(
          false,
        );
        // A null scheduledAt removes it (no day to place in the window).
        expect(
          needsScorer({ status: UPCOMING_STATUS, scheduledAt: null, hasActiveAssignment: false }, now),
        ).toBe(false);
      }),
      { numRuns: 500 },
    );
  });
});

// Feature: staff-roles-manager-console, Property 4: Tournament_Phase and public visibility
// Validates: Requirements 17.2, 17.5, 17.6
// Public reads pass istDate(Worker_Time) as `today`; tournamentPhase takes the
// instant and derives the IST date itself. The reference below uses the same
// Intl formatter (refIstDate) as Property 3, independent of the module's
// constant-offset arithmetic.

// Every tournament status the schema allows, plus an unexpected value, so the
// "not public" branch is exercised for anything outside ONGOING/COMPLETED.
const TOURNAMENT_STATUS = fc.constantFrom('DRAFT', 'ONGOING', 'COMPLETED', 'ARCHIVED', 'WEIRD');

// A YYYY-MM-DD IST date drawn from a whole IST day, via the Intl reference.
const istDateArb = fc.integer({ min: 0, max: 46_000 }).map((dayIndex) => refIstDate(dayIndex * DAY + IST_MIDNIGHT_UTC));

// An ordered date range: startsOn <= endsOn, both YYYY-MM-DD IST dates.
const dateRange = fc.tuple(istDateArb, istDateArb).map(([a, b]) => (a <= b ? { startsOn: a, endsOn: b } : { startsOn: b, endsOn: a }));

// The first UTC instant of a given IST date (its 00:00 IST), from the Intl
// reference, so instants can be pinned exactly to a calendar date's boundary.
const istDayStartUtc = (dateStr) => Date.parse(`${dateStr}T00:00:00Z`) - EVENT_TIME_ZONE.offsetMinutes * 60000;

describe('Property 4: Tournament_Phase and public visibility', () => {
  it('returns null for DRAFT/ARCHIVED and past for COMPLETED, for any instant', () => {
    fc.assert(
      fc.property(fc.constantFrom('DRAFT', 'ARCHIVED', 'WEIRD'), dateRange, instant, (status, { startsOn, endsOn }, today) => {
        // Not public, regardless of dates or clock.
        expect(tournamentPhase({ status, startsOn, endsOn }, today)).toBeNull();
      }),
      { numRuns: 300 },
    );
    fc.assert(
      fc.property(dateRange, instant, ({ startsOn, endsOn }, today) => {
        // Completed is always past (public), regardless of dates or clock.
        expect(tournamentPhase({ status: 'COMPLETED', startsOn, endsOn }, today)).toBe('past');
      }),
      { numRuns: 300 },
    );
  });

  it('for ONGOING, maps today vs the inclusive IST date range to upcoming/live/past', () => {
    fc.assert(
      fc.property(dateRange, instant, ({ startsOn, endsOn }, today) => {
        const day = refIstDate(today); // independent IST date of the clock
        let expected;
        if (day < startsOn) expected = 'upcoming';
        else if (day > endsOn) expected = 'past';
        else expected = 'live';
        expect(tournamentPhase({ status: 'ONGOING', startsOn, endsOn }, today)).toBe(expected);
      }),
      { numRuns: 1000 },
    );
  });

  it('for ONGOING, is live exactly on the start and end dates and flips one IST day outside them', () => {
    fc.assert(
      fc.property(dateRange, (range) => {
        const { startsOn, endsOn } = range;
        const t = { status: 'ONGOING', startsOn, endsOn };
        const startUtc = istDayStartUtc(startsOn);
        const endUtc = istDayStartUtc(endsOn);

        // Midday within the start and end IST dates is live (inclusive bounds).
        expect(tournamentPhase(t, startUtc + DAY / 2)).toBe('live');
        expect(tournamentPhase(t, endUtc + DAY / 2)).toBe('live');
        // The day before the start IST date is upcoming; the day after the end
        // IST date is past.
        expect(tournamentPhase(t, startUtc - DAY / 2)).toBe('upcoming');
        expect(tournamentPhase(t, endUtc + DAY + DAY / 2)).toBe('past');
      }),
      { numRuns: 500 },
    );
  });

  it('flips exactly at the 18:30 UTC IST midnight boundary around the start date', () => {
    fc.assert(
      fc.property(dateRange, (range) => {
        const { startsOn, endsOn } = range;
        const t = { status: 'ONGOING', startsOn, endsOn };
        const startUtc = istDayStartUtc(startsOn); // this instant is 00:00 IST of startsOn

        // One second before 00:00 IST of the start date is still the previous
        // IST day: upcoming. At the boundary the IST date is startsOn: live.
        expect(tournamentPhase(t, startUtc - 1000)).toBe('upcoming');
        expect(tournamentPhase(t, startUtc)).toBe('live');
        expect(tournamentPhase(t, startUtc + 1000)).toBe('live');
      }),
      { numRuns: 500 },
    );
  });

  it('flips exactly at the 18:30 UTC IST midnight boundary after the end date', () => {
    fc.assert(
      fc.property(dateRange, (range) => {
        const { startsOn, endsOn } = range;
        const t = { status: 'ONGOING', startsOn, endsOn };
        const endUtc = istDayStartUtc(endsOn);
        const nextDayStart = endUtc + DAY; // 00:00 IST of the day after endsOn

        // One second before the next IST midnight is still the end date: live.
        // At and after it the IST date is past endsOn: past.
        expect(tournamentPhase(t, nextDayStart - 1000)).toBe('live');
        expect(tournamentPhase(t, nextDayStart)).toBe('past');
        expect(tournamentPhase(t, nextDayStart + 1000)).toBe('past');
      }),
      { numRuns: 500 },
    );
  });

  it('is publicly visible exactly when the phase is not null', () => {
    fc.assert(
      fc.property(TOURNAMENT_STATUS, dateRange, instant, (status, { startsOn, endsOn }, today) => {
        const phase = tournamentPhase({ status, startsOn, endsOn }, today);
        const isPublic = phase !== null;
        // Only ONGOING and COMPLETED are public; DRAFT, ARCHIVED and any other
        // status are hidden. Visibility and a non-null phase agree exactly.
        expect(isPublic).toBe(status === 'ONGOING' || status === 'COMPLETED');
      }),
      { numRuns: 500 },
    );
  });
});

// Feature: staff-roles-manager-console, Property 6: Event_Time_Zone conversion round trip and midnight boundaries
// Validates: Requirements 12.4, 17.14, 23.13
// Independent references built from Intl (the zone name) and from plain UTC
// parsing, so the test never copies the module's constant-offset arithmetic.
const MINUTE = 60000;

// en-CA formats an instant as YYYY-MM-DD in a given zone; hourCycle h23 gives a
// 00..23 HH:MM. Together they are an Intl-derived {date, time} reference for an
// instant in EVENT_TIME_ZONE, independent of the module.
const istDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: EVENT_TIME_ZONE.name,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const istTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: EVENT_TIME_ZONE.name,
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
});
const refDate = (ms) => istDateFmt.format(new Date(ms));
const refTime = (ms) => istTimeFmt.format(new Date(ms));

// The Intl-derived offset in minutes of EVENT_TIME_ZONE at instant `ms`:
// (wall-clock read as UTC) minus (the true UTC instant). For a fixed-offset
// zone this is constant; the check below asserts it equals offsetMinutes for
// every representative instant from 2000 to 2099.
const intlOffsetMinutes = (ms) => {
  const asUtc = Date.parse(`${refDate(ms)}T${refTime(ms)}:00Z`);
  return Math.round((asUtc - ms) / MINUTE);
};

// A valid IST date 'YYYY-MM-DD' in 2000..2099, taken from a whole IST day via
// the Intl reference so impossible dates never appear.
const YEAR_2000_UTC = Date.UTC(2000, 0, 1); // 2000-01-01T00:00:00Z
const DAYS_2000_2099 = Math.floor((Date.UTC(2100, 0, 1) - YEAR_2000_UTC) / DAY); // 36525
const validIstDate = fc
  .integer({ min: 0, max: DAYS_2000_2099 - 1 })
  .map((dayIndex) => refDate(YEAR_2000_UTC + dayIndex * DAY + DAY / 2)); // midday keeps us inside the IST day

// A valid HH:MM wall-clock string.
const validIstTime = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);

// A whole-minute UTC instant across 2000..2099 (and a little beyond).
const wholeMinuteInstant = fc
  .integer({ min: 0, max: 4_000_000_000 })
  .map((minutes) => YEAR_2000_UTC + minutes * MINUTE);

describe('Property 6: Event_Time_Zone conversion round trip and midnight boundaries', () => {
  it('utcToIst(istToUtc(date, time)) returns the same date and time, offset minutes earlier', () => {
    fc.assert(
      fc.property(validIstDate, validIstTime, (date, time) => {
        const ms = istToUtc(date, time);
        // Valid input must convert (never NaN).
        expect(Number.isNaN(ms)).toBe(false);
        // Round trip is exact.
        expect(utcToIst(ms)).toEqual({ date, time });
        // The instant is the IST wall clock read as UTC, offsetMinutes earlier.
        const asUtc = Date.parse(`${date}T${time}:00Z`);
        expect(ms).toBe(asUtc - EVENT_TIME_ZONE.offsetMinutes * MINUTE);
        // timeText shows that same IST wall-clock time with the label.
        expect(timeText(ms)).toBe(`${time} ${EVENT_TIME_ZONE.label}`);
      }),
      { numRuns: 500 },
    );
  });

  it('matches Requirement 12.4: 23:30 IST on 2026-10-25 is 18:00 UTC', () => {
    const ms = istToUtc('2026-10-25', '23:30');
    expect(new Date(ms).toISOString()).toBe('2026-10-25T18:00:00.000Z');
    expect(utcToIst(ms)).toEqual({ date: '2026-10-25', time: '23:30' });
  });

  it('istToUtc(...utcToIst(t)) recovers any whole-minute instant t', () => {
    fc.assert(
      fc.property(wholeMinuteInstant, (t) => {
        const { date, time } = utcToIst(t);
        expect(istToUtc(date, time)).toBe(t);
        // The Intl reference agrees with the module's split for that instant.
        expect(date).toBe(refDate(t));
        expect(time).toBe(refTime(t));
      }),
      { numRuns: 500 },
    );
  });

  it('returns NaN for impossible or malformed date and time text', () => {
    const invalids = [
      ['2026-02-30', '12:00'], // 30 February never exists
      ['2025-02-29', '12:00'], // not a leap year
      ['2026-13-01', '12:00'], // month 13
      ['2026-00-10', '12:00'], // month 0
      ['2026-04-31', '12:00'], // April has 30 days
      ['2026-10-25', '24:00'], // hour 24 overflows to next day
      ['2026-10-25', '23:60'], // minute 60
      ['2026-10-25', '25:00'], // hour 25
      ['2026-1-01', '12:00'], // non-zero-padded month
      ['2026-10-25', '9:30'], // non-zero-padded hour
      ['2026/10/25', '12:00'], // wrong separators
      ['2026-10-25T12:00', '12:00'], // extra shape
      ['', '12:00'],
      ['2026-10-25', ''],
      ['not-a-date', 'nope'],
    ];
    for (const [date, time] of invalids) {
      expect(Number.isNaN(istToUtc(date, time)), `${date} ${time}`).toBe(true);
    }
    // A generated day/month that overflows its month always returns NaN, while
    // the same shape on a real date converts. 2 is February: days 30 and 31 are
    // always impossible.
    fc.assert(
      fc.property(fc.integer({ min: 2000, max: 2099 }), fc.constantFrom(30, 31), (year, day) => {
        const date = `${year}-02-${day}`;
        expect(Number.isNaN(istToUtc(date, '12:00'))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('crosses the IST midnight boundary: 00:00 IST is 18:30 UTC the previous day', () => {
    fc.assert(
      fc.property(validIstDate, (date) => {
        const ms = istToUtc(date, '00:00');
        // 00:00 IST sits at 18:30 UTC on the previous calendar day.
        const iso = new Date(ms).toISOString();
        expect(iso.slice(11, 19)).toBe('18:30:00');
        const prevDayUtc = new Date(ms).getUTCDate();
        const istDayUtc = new Date(Date.parse(`${date}T00:00:00Z`)).getUTCDate();
        // The UTC day is one earlier than the IST calendar day (wrapping months).
        expect(prevDayUtc === istDayUtc ? 0 : 1).toBe(1);
        // Round trip still lands on IST midnight of the same IST date.
        expect(utcToIst(ms)).toEqual({ date, time: '00:00' });
        // One minute earlier is the last minute (23:59) of the previous IST day.
        expect(utcToIst(ms - MINUTE).time).toBe('23:59');
        expect(utcToIst(ms - MINUTE).date < date).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('istDate equals the Intl en-CA date at, just before and just after each IST midnight', () => {
    fc.assert(
      fc.property(validIstDate, (date) => {
        const midnight = istToUtc(date, '00:00'); // exact 18:30 UTC boundary
        for (const t of [midnight - 1000, midnight, midnight + 1000]) {
          // The module's constant-offset date equals the Intl-derived date.
          expect(istDate(t)).toBe(refDate(t));
        }
        // At the boundary the IST date is `date`; one second before it is the
        // previous IST day.
        expect(istDate(midnight)).toBe(date);
        expect(istDate(midnight - 1000) < date).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('istDate equals the Intl en-CA date for any whole-minute instant', () => {
    fc.assert(
      fc.property(wholeMinuteInstant, (t) => {
        expect(istDate(t)).toBe(refDate(t));
      }),
      { numRuns: 500 },
    );
  });

  // Asia/Kolkata has had a constant +05:30 offset with no daylight saving. This
  // asserts the Intl-derived offset equals the module's constant for every year
  // from 2000 to 2099, at two representative instants per year (Jan 1 and Jul 1
  // UTC), so the zone name and the constant offset can never drift.
  it('EVENT_TIME_ZONE.name has a constant +330 minute offset for every year 2000..2099', () => {
    for (let year = 2000; year <= 2099; year++) {
      for (const month of [0, 6]) {
        const ms = Date.UTC(year, month, 1, 12, 0, 0); // midday UTC on Jan 1 / Jul 1
        expect(intlOffsetMinutes(ms), `offset at ${year}-${month + 1}`).toBe(
          EVENT_TIME_ZONE.offsetMinutes,
        );
      }
    }
    // The constant the module exports is the standard India_Time offset.
    expect(EVENT_TIME_ZONE.offsetMinutes).toBe(330);
    expect(EVENT_TIME_ZONE.name).toBe('Asia/Kolkata');
  });
});

// Feature: staff-roles-manager-console, Property 5: START eligibility
// Validates: Requirements 15.2, 15.3, 15.4, 15.5
// startDecision and evaluateChain are pure logic in backend/src/scoring.js; it imports
// only matchDayEnd from shared/time.mjs, so it is safe to import in the node project.
import { evaluateChain, startDecision } from '../../src/scoring.js';

// Every tournament status the schema allows plus an unexpected value, so the
// "not ONGOING" branch is exercised for anything outside ONGOING.
const TOURNAMENT_STATUS_ANY = fc.constantFrom('DRAFT', 'ONGOING', 'COMPLETED', 'ARCHIVED', 'WEIRD');

// The reference decision, expressed directly from Requirements 15.2–15.4 and
// the design precedence, independent of the module's expression:
// not ONGOING wins first, then too early (or no scheduled time), then day over.
const refDecision = (now, scheduledAt, tournamentStatus) => {
  if (tournamentStatus !== 'ONGOING') return [409, 'TOURNAMENT_NOT_ONGOING'];
  if (scheduledAt == null || now < scheduledAt) return [403, 'START_TOO_EARLY'];
  if (now >= matchDayEnd(scheduledAt)) return [409, 'MATCH_DAY_OVER'];
  return null;
};

// A { scheduledAt, now } pair where `now` hugs a boundary of that scheduled
// instant: its scheduled time, its Match_Day_End (both +/- 1 s), or anywhere.
// Scheduled instants include ones within 1 s of an 18:30 UTC IST midnight.
const scheduledAndNow = fc.oneof(instant, nearMidnight).chain((scheduledAt) => {
  const end = matchDayEnd(scheduledAt);
  const offset = fc.integer({ min: -1000, max: 1000 });
  const now = fc.oneof(
    offset.map((o) => scheduledAt + o),
    offset.map((o) => end + o),
    instant,
  );
  return now.map((n) => ({ scheduledAt, now: n }));
});

describe('Property 5: START eligibility', () => {
  it('startDecision is null exactly when ONGOING and scheduledAt <= now < matchDayEnd', () => {
    fc.assert(
      fc.property(
        TOURNAMENT_STATUS_ANY,
        fc.option(instant, { nil: null }),
        instant,
        (tournamentStatus, scheduledAt, now) => {
          expect(startDecision({ now, scheduledAt, tournamentStatus })).toEqual(
            refDecision(now, scheduledAt, tournamentStatus),
          );
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('follows the precedence not-ONGOING, then too-early, then day-over', () => {
    fc.assert(
      fc.property(instant, (scheduledAt) => {
        const end = matchDayEnd(scheduledAt);
        // Not ONGOING always loses first, even when the time would be fine or past the day.
        for (const s of ['DRAFT', 'COMPLETED', 'ARCHIVED', 'WEIRD']) {
          expect(startDecision({ now: scheduledAt, scheduledAt, tournamentStatus: s })).toEqual([
            409,
            'TOURNAMENT_NOT_ONGOING',
          ]);
          expect(startDecision({ now: end + 1000, scheduledAt, tournamentStatus: s })).toEqual([
            409,
            'TOURNAMENT_NOT_ONGOING',
          ]);
        }
        // ONGOING: too-early is reported before day-over. A null scheduledAt is too early.
        expect(startDecision({ now: scheduledAt - 1, scheduledAt, tournamentStatus: 'ONGOING' })).toEqual([
          403,
          'START_TOO_EARLY',
        ]);
        expect(startDecision({ now: end + 1000, scheduledAt: null, tournamentStatus: 'ONGOING' })).toEqual([
          403,
          'START_TOO_EARLY',
        ]);
      }),
      { numRuns: 1000 },
    );
  });

  it('flips exactly at the scheduled time and at Match_Day_End for an ONGOING tournament', () => {
    fc.assert(
      fc.property(instant, (scheduledAt) => {
        const end = matchDayEnd(scheduledAt);
        const decide = (now) => startDecision({ now, scheduledAt, tournamentStatus: 'ONGOING' });
        // One ms before the scheduled time is too early; at it START is allowed.
        expect(decide(scheduledAt - 1)).toEqual([403, 'START_TOO_EARLY']);
        expect(decide(scheduledAt)).toBeNull();
        // One ms before Match_Day_End is still allowed; at and after it the day is over.
        expect(decide(end - 1)).toBeNull();
        expect(decide(end)).toEqual([409, 'MATCH_DAY_OVER']);
        expect(decide(end + 1)).toEqual([409, 'MATCH_DAY_OVER']);
      }),
      { numRuns: 1000 },
    );
  });

  it('matches the generated boundaries around the scheduled time and Match_Day_End', () => {
    fc.assert(
      fc.property(scheduledAndNow, TOURNAMENT_STATUS_ANY, ({ scheduledAt, now }, tournamentStatus) => {
        expect(startDecision({ now, scheduledAt, tournamentStatus })).toEqual(
          refDecision(now, scheduledAt, tournamentStatus),
        );
      }),
      { numRuns: 1000 },
    );
  });

  it('whenever START is allowed the match phase is upcoming (Property 2)', () => {
    fc.assert(
      fc.property(fc.oneof(instant, nearMidnight), instant, (scheduledAt, now) => {
        if (startDecision({ now, scheduledAt, tournamentStatus: 'ONGOING' }) === null) {
          // scheduledAt <= now < matchDayEnd, so a SCHEDULED match is still upcoming.
          expect(matchPhase({ status: SCHEDULED, scheduledAt }, now)).toBe('upcoming');
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('evaluateChain of a non-START command of a Live match ignores scheduledAt and Match_Day_End', () => {
    fc.assert(
      fc.property(fc.oneof(instant, nearMidnight), (scheduledAt) => {
        const end = matchDayEnd(scheduledAt);
        // A minimal passing context: an ACTIVE account, an open SCORE assignment window,
        // a matching lease and a Live match. The date rule gates only START.
        const baseCtx = (now) => ({
          userId: 'user-1',
          deviceId: 'device-1',
          now,
          account: { id: 7, status: 'ACTIVE', role: 'MATCH_SCORER' },
          assignment: { validFrom: null, validUntil: null, permission: 'SCORE' },
          lease: { accountId: 7, deviceId: 'device-1', lastClientSeq: 0 },
          match: { status: 'LIVE', correction_route: 'OPERATOR', scheduledAt, tournamentStatus: 'ONGOING' },
        });
        // Before, at and after Match_Day_End, a non-START command (starting:false) is allowed.
        for (const now of [scheduledAt - 1, scheduledAt, end - 1, end, end + 1, end - 1000, end + 1000]) {
          expect(evaluateChain(baseCtx(now), { starting: false })).toBeNull();
        }
      }),
      { numRuns: 500 },
    );
  });
});
