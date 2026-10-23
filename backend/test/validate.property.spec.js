// Feature: staff-roles-manager-console, Property 7: Tournament status transitions
// Validates: Requirements 9.9, 9.10, 9.11, 9.13
//
// Pure validation helpers from ../src/validate.js. No database, no I/O, so this spec runs in the
// default Workers Vitest project (test/*.spec.js), like scope.property.spec.js.
//
// Tasks 6.5-6.9 append more properties to this same file. Keep imports grouped at the top and one
// top-level describe per property so later appends stay a clean copy-paste.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  dateText,
  email,
  formatChanged,
  intRange,
  isLocked,
  matchFlags,
  nameKey,
  nextSlug,
  slugify,
  statusChange,
  teamYear,
  text,
  timeText,
  TRANSITIONS,
  validatePlayers,
} from '../src/validate.js';
import { AppError } from '../src/http.js';
import { DEFAULT_FORMATS, validateFormat } from '../../shared/scoring.mjs';

// --- Property 7: Tournament status transitions ---------------------------

// Every real status plus one value that is never a status, so from->to generation covers the whole
// grid including pairs that are not in TRANSITIONS (Requirement 9.9/9.10: any other change rejects).
const STATUSES = ['DRAFT', 'ONGOING', 'COMPLETED', 'ARCHIVED', 'BOGUS'];

// Counts around the only two boundaries the rule reads: sportCount < 1 and liveCount > 0.
const count = fc.oneof(fc.constantFrom(0, 1, 2), fc.integer({ min: 0, max: 50 }));

// Independent reference written from the requirements, not copied from validate.js.
// 9.9  allowed pairs: Draft->Ongoing, Ongoing->Completed, Completed->Ongoing,
//      Completed->Archived, Archived->Completed.
// 9.10 publish (Draft->Ongoing) with no sport -> NO_SPORTS; complete (Ongoing->Completed) with a
//      live match -> LIVE_MATCHES; any other pair -> STATUS_CHANGE_INVALID.
const ALLOWED = {
  DRAFT: ['ONGOING'],
  ONGOING: ['COMPLETED'],
  COMPLETED: ['ONGOING', 'ARCHIVED'],
  ARCHIVED: ['COMPLETED'],
};
function expected(from, to, { sportCount, liveCount }) {
  if (!(ALLOWED[from] || []).includes(to)) return 'STATUS_CHANGE_INVALID';
  if (from === 'DRAFT' && to === 'ONGOING' && sportCount < 1) return 'NO_SPORTS';
  if (from === 'ONGOING' && to === 'COMPLETED' && liveCount > 0) return 'LIVE_MATCHES';
  return null;
}

describe('Property 7: Tournament status transitions', () => {
  it('decides every from/to pair and boundary like the documented matrix', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...STATUSES),
        fc.constantFrom(...STATUSES),
        count,
        count,
        (from, to, sportCount, liveCount) => {
          const got = statusChange(from, to, { sportCount, liveCount });
          expect(got).toBe(expected(from, to, { sportCount, liveCount }));
        },
      ),
      { numRuns: 300 },
    );
  });

  it('accepts a pair only when it appears in TRANSITIONS', () => {
    fc.assert(
      fc.property(fc.constantFrom(...STATUSES), fc.constantFrom(...STATUSES), (from, to) => {
        // Give both sides enough so NO_SPORTS and LIVE_MATCHES never fire: a null here means the
        // pair itself is accepted, which must be exactly the TRANSITIONS membership.
        const got = statusChange(from, to, { sportCount: 1, liveCount: 0 });
        const candidate = (TRANSITIONS[from] || []).includes(to);
        expect(got === null).toBe(candidate);
      }),
      { numRuns: 100 },
    );
  });

  it('DRAFT->ONGOING needs at least one sport (NO_SPORTS below 1, accepted at or above 1)', () => {
    fc.assert(
      fc.property(count, count, (sportCount, liveCount) => {
        const got = statusChange('DRAFT', 'ONGOING', { sportCount, liveCount });
        expect(got).toBe(sportCount < 1 ? 'NO_SPORTS' : null);
      }),
      { numRuns: 100 },
    );
  });

  it('ONGOING->COMPLETED is refused only while a match is live (LIVE_MATCHES)', () => {
    fc.assert(
      fc.property(count, count, (sportCount, liveCount) => {
        const got = statusChange('ONGOING', 'COMPLETED', { sportCount, liveCount });
        expect(got).toBe(liveCount > 0 ? 'LIVE_MATCHES' : null);
      }),
      { numRuns: 100 },
    );
  });

  it('isLocked is true only for COMPLETED and ARCHIVED (Requirement 9.11)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...STATUSES), (status) => {
        expect(isLocked(status)).toBe(status === 'COMPLETED' || status === 'ARCHIVED');
      }),
      { numRuns: 100 },
    );
  });

  it('a locked tournament still permits exactly its TRANSITIONS status changes (Requirement 9.11)', () => {
    // 9.11: Completed and Archived refuse every change except a status change. So from a locked
    // status the only accepted moves are the status changes listed in TRANSITIONS, and no other.
    fc.assert(
      fc.property(
        fc.constantFrom('COMPLETED', 'ARCHIVED'),
        fc.constantFrom(...STATUSES),
        count,
        count,
        (from, to, sportCount, liveCount) => {
          const got = statusChange(from, to, { sportCount, liveCount });
          const allowedHere = (TRANSITIONS[from] || []).includes(to);
          // No sport or live-match gate applies to Completed/Archived origins, so an allowed pair is
          // always accepted (null) and anything else is STATUS_CHANGE_INVALID.
          expect(got).toBe(allowedHere ? null : 'STATUS_CHANGE_INVALID');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: staff-roles-manager-console, Property 8: Slug charset and uniqueness
// Validates: Requirements 9.6

// --- Property 8: Slug charset and uniqueness -----------------------------

// The DB slug CHECK (db/migrations .../manager_scope.sql): lowercase a-z/0-9 words joined by single
// hyphens, no leading/trailing/doubled hyphen, non-empty. slugify also guarantees a letter so the
// `tournament-` prefix fallback keeps all-digit and empty names valid.
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Arbitrary names across the whole input space: accents, emoji, punctuation, all-digit and empty.
// fast-check 4 `string()` already draws from the full Unicode range (including emoji and accents).
const anyName = fc.oneof(
  fc.string(),
  fc.string({ unit: 'binary' }),
  fc.constantFrom('', '   ', '2026', '42', '!!!', '---', 'Café', 'naïve', '🏓🏆', 'a.b.c', 'FOO bar'),
);

describe('Property 8: Slug charset and uniqueness', () => {
  it('slugify produces a valid DB slug containing a letter for any Unicode name', () => {
    fc.assert(
      fc.property(anyName, (name) => {
        const s = slugify(name);
        expect(typeof s).toBe('string');
        expect(s).toMatch(SLUG); // lowercase a-z/0-9, single hyphens, no edge/doubled hyphen, non-empty
        expect(s).toMatch(/[a-z]/); // the CHECK also requires a letter
      }),
      { numRuns: 200 },
    );
  });

  it('nextSlug returns base when free, else the first base-N (N>=2) not taken, never "new"', () => {
    fc.assert(
      fc.property(
        anyName,
        // A taken set drawn from base and the first few suffixes, so both the free-base and the
        // suffix-search paths are exercised. "new" is always in RESERVED, independent of this set.
        fc.uniqueArray(fc.integer({ min: 1, max: 6 }), { maxLength: 6 }),
        (name, takenSuffixes) => {
          const base = slugify(name);
          const taken = new Set(
            takenSuffixes.map((n) => (n === 1 ? base : `${base}-${n}`)),
          );
          const result = nextSlug(base, (s) => taken.has(s));

          expect(result).not.toBe('new'); // the reserved route path never wins
          expect(taken.has(result)).toBe(false); // never returns a slug in the taken set

          if (!taken.has(base) && base !== 'new') {
            expect(result).toBe(base); // base is free -> base
          } else {
            // first base-N, N>=2, that is neither taken nor reserved
            let expectedN = 2;
            while (taken.has(`${base}-${expectedN}`)) expectedN += 1;
            expect(result).toBe(`${base}-${expectedN}`);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('nextSlug never returns the reserved literal "new" even when "new" is free', () => {
    // base slugifies to "new"; with an empty taken set the base is free, yet "new" is reserved.
    const result = nextSlug(slugify('new'), () => false);
    expect(slugify('new')).toBe('new');
    expect(result).toBe('new-2');
  });
});

// Feature: staff-roles-manager-console, Property 9: Field validation names the first invalid field
// Validates: Requirements 9.5, 11.2, 11.3, 11.4, 11.10, 12.3

// --- Property 9: Field validation names the first invalid field ----------

// A validator rejects by throwing AppError(400, 'BAD_REQUEST', '<field>: <fix>'); valid input
// returns the normalised value and never throws. These helpers assert that shared contract so each
// case below only has to supply the field name and whether the call should throw.

// Assert a rejection: 400 BAD_REQUEST and a message that starts with "<field>: ".
function expectRejects(field, call) {
  let err;
  try {
    call();
  } catch (e) {
    err = e;
  }
  expect(err, 'expected a rejection').toBeInstanceOf(AppError);
  expect(err.status).toBe(400);
  expect(err.code).toBe('BAD_REQUEST');
  expect(err.message.startsWith(`${field}: `)).toBe(true);
}

// Assert acceptance: returns the given normalised value and throws nothing.
function expectAccepts(call, value) {
  expect(call()).toEqual(value);
}

describe('Property 9: Field validation names the first invalid field', () => {
  // text(): trimmed length boundary at max and max+1, and required-empty (field-limits table).
  it('text accepts at the max length and rejects at max+1, naming the field', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[A-Za-z]+$/.test(s)),
        fc.integer({ min: 1, max: 200 }),
        (field, max) => {
          expectAccepts(() => text('a'.repeat(max), field, max), 'a'.repeat(max));
          expectRejects(field, () => text('a'.repeat(max + 1), field, max));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('text with required rejects an empty value naming the field; not required returns ""', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('name', 'branch', 'playerName', 'venue', 'description'),
        fc.constantFrom('', '   ', '\t', null, undefined),
        (field, empty) => {
          expectRejects(field, () => text(empty, field, 120, { required: true }));
          expectAccepts(() => text(empty, field, 120, { required: false }), '');
        },
      ),
      { numRuns: 100 },
    );
  });

  // intRange(): jersey 0-99 boundaries -1/0/99/100 (Team field-limits, Requirement 11.2).
  it('intRange accepts the inclusive bounds and rejects just outside, naming the field', () => {
    expectAccepts(() => intRange(0, 'number', 0, 99), 0);
    expectAccepts(() => intRange(99, 'number', 0, 99), 99);
    expectRejects('number', () => intRange(-1, 'number', 0, 99));
    expectRejects('number', () => intRange(100, 'number', 0, 99));
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99 }), (n) => {
        expectAccepts(() => intRange(n, 'number', 0, 99), n);
      }),
      { numRuns: 100 },
    );
    fc.assert(
      fc.property(fc.oneof(fc.integer({ max: -1 }), fc.integer({ min: 100 })), (n) => {
        expectRejects('number', () => intRange(n, 'number', 0, 99));
      }),
      { numRuns: 100 },
    );
  });

  // teamYear(): college year 1st-4th, boundaries 0/1/4/5; empty means not set (Team field-limits).
  it('teamYear accepts 1 to 4 and empty, and rejects every other value, naming "year"', () => {
    for (const year of [1, 2, 3, 4]) expectAccepts(() => teamYear(year), year);
    for (const empty of [null, undefined, '']) expectAccepts(() => teamYear(empty), null);
    for (const bad of [0, 5, 2026, 2.5, 'x']) expectRejects('year', () => teamYear(bad));
    fc.assert(
      fc.property(fc.oneof(fc.integer({ max: 0 }), fc.integer({ min: 5 })), (year) => {
        expectRejects('year', () => teamYear(year));
      }),
      { numRuns: 100 },
    );
  });

  // validatePlayers(): 30 vs 31 players (field-limits ≤30, Requirement 11.2).
  it('validatePlayers accepts 30 entries and rejects 31, naming "players"', () => {
    const roster = (n) => Array.from({ length: n }, (_, i) => ({ name: `Player ${i + 1}` }));
    expectAccepts(() => validatePlayers('badminton', roster(30)), roster(30));
    expectRejects('players', () => validatePlayers('badminton', roster(31)));
  });

  // dateText(): a shape-valid but non-calendar date (2026-02-30) rejects; a real date accepts.
  it('dateText rejects an impossible calendar date and accepts a real one, naming the field', () => {
    expectAccepts(() => dateText('2026-10-25', 'startsOn'), '2026-10-25');
    expectRejects('startsOn', () => dateText('2026-02-30', 'startsOn'));
  });

  // timeText(): 24:00 is out of range; a real clock time accepts.
  it('timeText rejects 24:00 and accepts a real clock time, naming the field', () => {
    expectAccepts(() => timeText('14:30', 'time'), '14:30');
    expectRejects('time', () => timeText('24:00', 'time'));
  });

  // email(): an invalid address and a >254 address reject; a normal one accepts (lower-cased, trimmed).
  it('email rejects an invalid and an over-254 address, accepts a normal one normalised', () => {
    expectAccepts(() => email('  Name@Example.COM '), 'name@example.com');
    expectRejects('email', () => email('not-an-email'));
    expectRejects('email', () => email(`${'a'.repeat(250)}@example.com`)); // well over 254
    fc.assert(
      fc.property(fc.constantFrom('a@b', 'a b@c.com', '@x.com', 'x@.com', 'x@y.'), (bad) => {
        expectRejects('email', () => email(bad));
      }),
      { numRuns: 100 },
    );
  });

  // First-invalid-field guarantee for a composite: with several invalid entries the error names the
  // first one (validatePlayers checks each entry's name in order, so it is "playerName").
  it('validatePlayers names the FIRST invalid entry when several are invalid', () => {
    fc.assert(
      fc.property(
        // A roster where the first entry is already invalid (empty name) plus more invalid ones after.
        fc.array(fc.constantFrom('', '   ', 'a'.repeat(121)), { minLength: 2, maxLength: 10 }),
        (badNames) => {
          const players = badNames.map((name) => ({ name }));
          expectRejects('playerName', () => validatePlayers('badminton', players));
        },
      ),
      { numRuns: 100 },
    );
  });

  // The thrown message always starts with "<field>: " for the caller-supplied field name, for any
  // generated field name and an invalid (over-max) value.
  it('every rejection message starts with the caller-supplied field name', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 24 }).filter((s) => /^[A-Za-z][A-Za-z0-9]*$/.test(s)),
        fc.integer({ min: 1, max: 50 }),
        (field, max) => {
          let err;
          try {
            text('x'.repeat(max + 1), field, max);
          } catch (e) {
            err = e;
          }
          expect(err).toBeInstanceOf(AppError);
          expect(err.status).toBe(400);
          expect(err.code).toBe('BAD_REQUEST');
          expect(err.message.startsWith(`${field}: `)).toBe(true);
        },
      ),
      { numRuns: 150 },
    );
  });
});

// Feature: staff-roles-manager-console, Property 10: Duplicate names ignore case and outer spaces
// Validates: Requirements 11.5

// --- Property 10: Duplicate names ignore case and outer spaces -----------

// nameKey is the teams_unique_name index key `lower(btrim())`: in JS, String(s).trim().toLowerCase().
// Two Side_Record names collide (Requirement 11.5: duplicate "without case and surrounding spaces")
// exactly when they are equal after trimming outer whitespace and lowercasing. Inner spacing is kept,
// so names that differ only inside stay distinct.

// Whitespace characters that String.prototype.trim removes from the ends. Generated outer padding is
// drawn from these, so a padded variant must share its name's key.
const OUTER_WS = [' ', '\t', '\n', '\r', '\f', '\v', '\u00a0', '\u2003', '\ufeff'];
const outerPad = fc.string({ unit: fc.constantFrom(...OUTER_WS), maxLength: 4 });

// A base name with at least one non-space, non-whitespace core so trimming leaves something to
// compare. The core can contain inner spaces (to prove inner spacing is preserved).
const coreName = fc
  .string({ minLength: 1, maxLength: 24 })
  .map((s) => s.replace(/^\s+|\s+$/g, '')) // strip outer whitespace so padding is the only outer ws
  .filter((s) => s.length > 0);

// Flip the case of each letter so the variant differs in case but shares the key.
const flipCase = (s) =>
  [...s]
    .map((ch) => (ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase()))
    .join('');

describe('Property 10: Duplicate names ignore case and outer spaces', () => {
  it('nameKey equals lower(btrim()) for any name (the teams_unique_name rule)', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.string({ unit: 'binary' })), (name) => {
        expect(nameKey(name)).toBe(String(name).trim().toLowerCase());
      }),
      { numRuns: 200 },
    );
  });

  it('a case-flipped, outer-padded variant always collides with its name', () => {
    fc.assert(
      fc.property(coreName, outerPad, outerPad, (name, left, right) => {
        const variant = `${left}${flipCase(name)}${right}`;
        // Same name ignoring letter case and leading/trailing whitespace -> equal keys.
        expect(nameKey(variant)).toBe(nameKey(name));
      }),
      { numRuns: 200 },
    );
  });

  it('keys match exactly when two names are equal after trim + lowercase, and differ otherwise', () => {
    // Two independently generated names, sometimes padded and case-flipped, so the pair covers both
    // colliding and non-colliding cases. The expected relation is computed from the documented rule.
    const paddedName = fc.tuple(outerPad, coreName, outerPad).map(([l, c, r]) => `${l}${c}${r}`);
    fc.assert(
      fc.property(paddedName, paddedName, fc.boolean(), (a, rawB, flip) => {
        const b = flip ? flipCase(rawB) : rawB;
        const same = a.trim().toLowerCase() === b.trim().toLowerCase();
        expect(nameKey(a) === nameKey(b)).toBe(same);
      }),
      { numRuns: 200 },
    );
  });

  it('nameKey trims only OUTER whitespace: inner spacing differences stay distinct', () => {
    // Insert extra inner whitespace that is NOT at either end, so the trimmed value changes and the
    // two names must not collide. A letter on both sides keeps the inserted space strictly inner.
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /\S/.test(s.trim())),
        fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /\S/.test(s.trim())),
        fc.string({ unit: fc.constantFrom(' ', '\t'), minLength: 1, maxLength: 3 }),
        (left, right, innerGap) => {
          const l = left.trim();
          const r = right.trim();
          fc.pre(l.length > 0 && r.length > 0);
          const joined = `${l}${r}`; // no inner gap
          const spaced = `${l}${innerGap}${r}`; // inner gap between the same two parts
          // The inner gap survives trim, so the keys differ (inner spacing is preserved).
          expect(nameKey(spaced)).not.toBe(nameKey(joined));
        },
      ),
      { numRuns: 150 },
    );
  });
});

// Feature: staff-roles-manager-console, Property 11: Default_Format save is idempotent
// Validates: Requirements 10.5

// --- Property 11: Default_Format save is idempotent ----------------------

// formatChanged(a, b) compares two formats by canonical JSON with sorted keys, so key order never
// counts as a change. Requirement 10.5: a save that differs from the stored format bumps the
// configuration version by one; a save with no difference writes nothing (no bump). So re-saving an
// equal format must be a no-op, which is exactly formatChanged(stored, submitted) === false.

const SPORTS = Object.keys(DEFAULT_FORMATS);

// A valid format for a sport: the Official_Preset plus a few in-range field variations, each still
// accepted by validateFormat so the generated value is always a real Default_Format. Only fields the
// validator allows for that sport's model are varied; the model itself never changes.
function validFormatArb(sport) {
  const base = DEFAULT_FORMATS[sport];
  const fields = {};
  if (base.model === 'periods') {
    fields.periodCount = fc.integer({ min: 1, max: 12 });
    if (sport !== 'football') {
      // One to three distinct scoring values from 1..100 (football is fixed to [1]).
      fields.scoreValues = fc
        .uniqueArray(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 3 });
    }
  } else if (base.model === 'sets') {
    fields.bestOf = fc.integer({ min: 1, max: 7 }).map((n) => n * 2 - 1); // odd 1..13
    fields.target = fc.integer({ min: 1, max: 99 });
    fields.decidingTarget = fc.integer({ min: 1, max: 99 });
    fields.winBy = fc.integer({ min: 1, max: 10 });
    fields.firstServe = fc.constantFrom(0, 1);
  } else {
    // tennis
    fields.bestOf = fc.integer({ min: 1, max: 7 }).map((n) => n * 2 - 1); // odd 1..13
    fields.gamesPerSet = fc.integer({ min: 2, max: 20 });
    fields.gameWinBy = fc.constantFrom(1, 2);
    fields.advantage = fc.boolean();
    fields.tiebreakTo = fc.integer({ min: 1, max: 99 });
    fields.tiebreakWinBy = fc.integer({ min: 1, max: 10 });
    fields.firstServe = fc.constantFrom(0, 1);
  }
  // Pick a random subset of the varied fields so most draws differ from the preset in some way, then
  // run validateFormat to settle derived constraints (e.g. cap >= targets) and reject the rare
  // out-of-relation draw via fc.pre. The result is always a format validateFormat accepts.
  return fc.record(fields, { requiredKeys: [] }).map((overrides) => {
    try {
      return validateFormat(sport, { ...base, ...overrides });
    } catch {
      return null; // some set draws break cap/target relations; filtered out below
    }
  }).filter((f) => f !== null);
}

// A copy with object keys inserted in reverse order, so canonical JSON must ignore key order.
const reorderKeys = (obj) => {
  const out = {};
  for (const k of Object.keys(obj).reverse()) {
    const v = obj[k];
    out[k] = Array.isArray(v) ? [...v] : v;
  }
  return out;
};

// Mutate exactly one scalar field to a different in-type value, so the two formats really differ.
function mutateOne(format, keyOrder) {
  for (const k of keyOrder) {
    const v = format[k];
    if (typeof v === 'number') return { ...format, [k]: v + 1 };
    if (typeof v === 'boolean') return { ...format, [k]: !v };
    if (Array.isArray(v)) return { ...format, [k]: [...v, 101] };
  }
  return null; // only reachable if the format had no mutable field (never, here)
}

describe('Property 11: Default_Format save is idempotent', () => {
  it('formatChanged is false for a format against itself (reflexive) for every sport', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SPORTS).chain((sport) => validFormatArb(sport)),
        (format) => {
          expect(formatChanged(format, format)).toBe(false);
          // A structural clone with the same values is still "no change".
          expect(formatChanged(format, structuredClone(format))).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('formatChanged ignores key order: a key-reordered copy is not a change', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SPORTS).chain((sport) => validFormatArb(sport)),
        (format) => {
          const reordered = reorderKeys(format);
          // Different key insertion order, identical values -> canonical JSON equal -> no change.
          expect(Object.keys(reordered).join(',')).not.toBe(Object.keys(format).join(','));
          expect(formatChanged(format, reordered)).toBe(false);
          expect(formatChanged(reordered, format)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('formatChanged is true when any single field value differs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SPORTS).chain((sport) =>
          validFormatArb(sport).map((format) => ({ sport, format })),
        ),
        ({ format }) => {
          const mutated = mutateOne(format, Object.keys(format));
          expect(mutated).not.toBeNull();
          // One value changed -> canonical JSON differs -> a real change (would bump the version).
          expect(formatChanged(format, mutated)).toBe(true);
          expect(formatChanged(mutated, format)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('re-saving the same format is a no-op: validate then compare yields no change (no version bump)', () => {
    // Requirement 10.5: a save with no difference writes nothing. Model the second identical PUT as
    // validateFormat(sport, stored) compared back to the stored format; it must report no change, so
    // the configuration version would not bump. Reordering the submitted keys and re-validating proves
    // canonical equality holds regardless of key order.
    fc.assert(
      fc.property(
        fc.constantFrom(...SPORTS).chain((sport) =>
          validFormatArb(sport).map((format) => ({ sport, format })),
        ),
        ({ sport, format }) => {
          const revalidated = validateFormat(sport, format);
          expect(formatChanged(format, revalidated)).toBe(false);
          // Submit the same format with its keys reordered: validation normalises, comparison still
          // sees no change, so a second identical save is still a no-op.
          const revalidatedReordered = validateFormat(sport, reorderKeys(format));
          expect(formatChanged(format, revalidatedReordered)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// Feature: staff-roles-manager-console, Property 13: Rendered controls never exceed allowed actions
// Validates: Requirements 12.8, 13.9, 19.10

// --- Property 13: Rendered controls never exceed allowed actions ---------

// matchFlags decides which controls a staff match row may render. Requirement 19.10: the Staff_Area
// renders no control the API would refuse. So each flag must be true only when the matching API rule
// would accept the action, and true whenever it does.
//
// Independent reference, written from the control matrix in the design and the requirements, NOT
// copied from validate.js:
//   canEdit   12.7/12.8: edit only while Upcoming (phase upcoming, status SCHEDULED), in scope, and
//             the tournament not locked (Property 7 isLocked: Completed/Archived refuse non-status
//             changes).
//   canDelete 12.9/12.10: delete a SCHEDULED match only when it has no score action, so canEdit's
//             conditions AND hasActions false.
//   canAssign 13.1/13.9: assign only while the match is not Final/Not_Scored (phase not past), in
//             scope, tournament not locked.
//   canScore  13.7: the Score button shows only while the caller holds the ACTIVE Assignment; a past
//             match (Final or Not_Scored) and a locked tournament accept no score command.
const PHASES = ['live', 'upcoming', 'past'];
const MATCH_STATUSES = ['SCHEDULED', 'LIVE', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'];
const TOURNAMENT_STATUSES = ['DRAFT', 'ONGOING', 'COMPLETED', 'ARCHIVED'];

// isLocked reference (Property 7): Completed and Archived are locked.
const locked = (ts) => ts === 'COMPLETED' || ts === 'ARCHIVED';

function reference({ phase, status, tournamentStatus, inScope, holdsAssignment, hasActions }) {
  const scope = inScope && !locked(tournamentStatus);
  const editable = phase === 'upcoming' && status === 'SCHEDULED';
  const notPast = phase !== 'past'; // Final and Not_Scored both report phase 'past'
  return {
    canEdit: scope && editable,
    canDelete: scope && editable && !hasActions,
    canAssign: scope && notPast,
    canScore: holdsAssignment && !locked(tournamentStatus) && notPast,
  };
}

// Draw every booleaned input across the whole grid of phase/status/tournamentStatus.
const flagInput = fc.record({
  phase: fc.constantFrom(...PHASES),
  status: fc.constantFrom(...MATCH_STATUSES),
  tournamentStatus: fc.constantFrom(...TOURNAMENT_STATUSES),
  inScope: fc.boolean(),
  holdsAssignment: fc.boolean(),
  hasActions: fc.boolean(),
});

describe('Property 13: Rendered controls never exceed allowed actions', () => {
  it('matchFlags equals the documented control matrix for every input', () => {
    fc.assert(
      fc.property(flagInput, (args) => {
        expect(matchFlags(args)).toEqual(reference(args));
      }),
      { numRuns: 300 },
    );
  });

  it('every true flag implies the action is allowed (never a control the API refuses)', () => {
    // The key invariant: a rendered control is always within the allowed actions. Each true flag
    // implies its precondition independently of matchFlags' own code.
    fc.assert(
      fc.property(flagInput, (args) => {
        const f = matchFlags(args);
        if (f.canEdit) {
          expect(args.inScope).toBe(true);
          expect(locked(args.tournamentStatus)).toBe(false);
          expect(args.phase).toBe('upcoming');
          expect(args.status).toBe('SCHEDULED');
        }
        if (f.canDelete) {
          // Delete is never offered beyond edit, and never once a score action exists.
          expect(f.canEdit).toBe(true);
          expect(args.hasActions).toBe(false);
        }
        if (f.canAssign) {
          expect(args.inScope).toBe(true);
          expect(locked(args.tournamentStatus)).toBe(false);
          expect(args.phase).not.toBe('past'); // refused for Final and Not_Scored
        }
        if (f.canScore) {
          expect(args.holdsAssignment).toBe(true);
          expect(locked(args.tournamentStatus)).toBe(false);
          expect(args.phase).not.toBe('past');
        }
      }),
      { numRuns: 300 },
    );
  });

  it('out of scope hides edit, delete and assign (Requirement 19.10 SCOPE_FORBIDDEN)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PHASES),
        fc.constantFrom(...MATCH_STATUSES),
        fc.constantFrom(...TOURNAMENT_STATUSES),
        fc.boolean(),
        fc.boolean(),
        (phase, status, tournamentStatus, holdsAssignment, hasActions) => {
          const f = matchFlags({ phase, status, tournamentStatus, inScope: false, holdsAssignment, hasActions });
          // Scope-gated controls are never rendered without scope; scoring depends on the Assignment,
          // not on scope, so it is not asserted false here.
          expect(f.canEdit).toBe(false);
          expect(f.canDelete).toBe(false);
          expect(f.canAssign).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('a locked tournament (Completed/Archived) hides every control', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('COMPLETED', 'ARCHIVED'),
        fc.constantFrom(...PHASES),
        fc.constantFrom(...MATCH_STATUSES),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (tournamentStatus, phase, status, inScope, holdsAssignment, hasActions) => {
          const f = matchFlags({ phase, status, tournamentStatus, inScope, holdsAssignment, hasActions });
          expect(f).toEqual({ canEdit: false, canDelete: false, canAssign: false, canScore: false });
        },
      ),
      { numRuns: 200 },
    );
  });

  it('a past match (Final or Not_Scored) hides assign and score; editing is already closed', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...MATCH_STATUSES),
        fc.constantFrom(...TOURNAMENT_STATUSES),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (status, tournamentStatus, inScope, holdsAssignment, hasActions) => {
          const f = matchFlags({ phase: 'past', status, tournamentStatus, inScope, holdsAssignment, hasActions });
          expect(f.canAssign).toBe(false);
          expect(f.canScore).toBe(false);
          expect(f.canEdit).toBe(false); // edit needs an upcoming phase
          expect(f.canDelete).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('score needs the ACTIVE Assignment: no canScore without holdsAssignment (Requirement 13.7)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PHASES),
        fc.constantFrom(...MATCH_STATUSES),
        fc.constantFrom(...TOURNAMENT_STATUSES),
        fc.boolean(),
        fc.boolean(),
        (phase, status, tournamentStatus, inScope, hasActions) => {
          const f = matchFlags({ phase, status, tournamentStatus, inScope, holdsAssignment: false, hasActions });
          expect(f.canScore).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('a score action blocks delete while edit stays open (Requirement 12.9)', () => {
    // On an in-scope, unlocked, editable match: delete follows edit exactly when there is no score
    // action, so adding an action removes only delete.
    fc.assert(
      fc.property(fc.constantFrom('DRAFT', 'ONGOING'), (tournamentStatus) => {
        const base = { phase: 'upcoming', status: 'SCHEDULED', tournamentStatus, inScope: true, holdsAssignment: false };
        const withAction = matchFlags({ ...base, hasActions: true });
        const noAction = matchFlags({ ...base, hasActions: false });
        expect(withAction.canEdit).toBe(true);
        expect(withAction.canDelete).toBe(false);
        expect(noAction.canEdit).toBe(true);
        expect(noAction.canDelete).toBe(true);
      }),
      { numRuns: 50 },
    );
  });
});
