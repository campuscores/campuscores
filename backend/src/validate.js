// Pure, total validation and decision helpers shared by the manager API and (through the error
// messages) the UI on-blur checks. No database, no I/O. Thresholds come from the design
// "Field limits" table and Requirements 9, 10, 11, 12, 19.
import { AppError } from './http.js';

// Every rejection names the FIRST invalid field as "<field>: <fix>" so the frontend
// (frontend/src/features/staff/labels.js `messageFor`) maps it to that form field.
const bad = (field, fix) => {
  throw new AppError(400, 'BAD_REQUEST', `${field}: ${fix}`);
};

/**
 * Trimmed text field. Returns the trimmed value.
 * @param {*} value raw input
 * @param {string} field form field name used in the error token
 * @param {number} max maximum trimmed length
 * @param {{ required?: boolean, what?: string }} [opts] `required` rejects empty; `what` names the thing in the fix
 */
export function text(value, field, max, { required = false, what = field } = {}) {
  const v = String(value ?? '').trim();
  if (!v) {
    if (required) bad(field, `Enter ${what}.`);
    return '';
  }
  if (v.length > max) bad(field, `Use ${max} characters or fewer for ${what}.`);
  return v;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/** `YYYY-MM-DD` with a real calendar date. Returns the string. */
export function dateText(value, field, { required = true, what = 'a date' } = {}) {
  const v = String(value ?? '').trim();
  if (!v) {
    if (required) bad(field, `Enter ${what}.`);
    return '';
  }
  // Shape then real-date check: Date.parse normalises 2026-02-30, so compare the round trip.
  if (!DATE.test(v) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) {
    bad(field, `Enter ${what} like 2026-10-25.`);
  }
  return v;
}

/** `HH:MM` 24-hour clock. Returns the string. */
export function timeText(value, field, { required = true, what = 'a time' } = {}) {
  const v = String(value ?? '').trim();
  if (!v) {
    if (required) bad(field, `Enter ${what}.`);
    return '';
  }
  const [h, m] = v.split(':').map(Number);
  if (!TIME.test(v) || h > 23 || m > 59) bad(field, `Enter ${what} like 14:30.`);
  return v;
}

/** Whole number within [min, max] inclusive. Returns the number, or null when empty and not required. */
export function intRange(value, field, min, max, { required = false, what = field } = {}) {
  if (value === '' || value == null) {
    if (required) bad(field, `Enter ${what}.`);
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) bad(field, `Enter ${what} from ${min} to ${max}.`);
  return n;
}

/** A team's college year: 1 to 4 (1st to 4th year), or null when empty. Not a calendar year. */
export function teamYear(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 4) bad('year', 'Choose 1st, 2nd, 3rd or 4th year.');
  return n;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trimmed, lower-cased email, ≤254, the existing invite pattern. Returns the normalised email. */
export function email(value, field = 'email') {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) bad(field, 'Enter an email address.');
  if (v.length > 254 || !EMAIL.test(v)) bad(field, 'Enter an email address like name@example.com.');
  return v;
}

// --- Slugs ---------------------------------------------------------------

/**
 * Lowercase a–z, 0–9 and hyphens, from an arbitrary Unicode name.
 * NFKD + strip marks folds accents; runs of other characters collapse to one hyphen.
 * A slug with no letter gets a `tournament-` prefix so it always matches the DB CHECK (contains a letter).
 * Trimmed to 60 characters so a numeric suffix keeps the result ≤64.
 */
export function slugify(name) {
  let s = String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!/[a-z]/.test(s)) s = s ? `tournament-${s}` : 'tournament';
  s = s.slice(0, 60).replace(/-+$/g, '');
  return s;
}

const RESERVED = new Set(['new']);

/**
 * First free slug from `base`: `base`, then `base-2`, `base-3`, … The literal `new` is reserved
 * (it is a route path), so it never wins even when free.
 * @param {string} base a slugified name
 * @param {(slug: string) => boolean} taken returns true when the slug is already in use
 */
export function nextSlug(base, taken) {
  const free = (s) => !RESERVED.has(s) && !taken(s);
  if (free(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (free(candidate)) return candidate;
  }
}

/** The `teams_unique_name` index key: `lower(btrim())`. Two names collide when their keys match. */
export const nameKey = (s) => String(s ?? '').trim().toLowerCase();

// --- Format change detection --------------------------------------------

// Canonical JSON with sorted keys, so key order never counts as a change.
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
};

/** True when the two formats differ after canonical JSON (key order ignored). */
export const formatChanged = (a, b) => canonical(a) !== canonical(b);

// --- Players -------------------------------------------------------------

// Sports whose Player_Entries may carry a jersey number and a captain marker (Requirement 11.3).
const TEAM_SPORTS = new Set(['football', 'basketball', 'volleyball']);

/**
 * Validate and normalise ≤30 Player_Entries for a sport. Returns a clean array:
 * every entry keeps only `name`, plus `jersey`/`captain` for team sports, dropping any other key.
 * Names the first invalid field.
 */
export function validatePlayers(sport, players) {
  if (players == null) return [];
  if (!Array.isArray(players)) bad('players', 'Provide players as a list.');
  if (players.length > 30) bad('players', 'Use 30 players or fewer.');
  const allowsExtras = TEAM_SPORTS.has(sport);
  let captains = 0;
  const out = [];
  for (const entry of players) {
    const p = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
    const name = text(p.name, 'playerName', 120, { required: true, what: 'the player name' });
    const clean = { name };
    if (allowsExtras) {
      if (p.jersey != null && p.jersey !== '') clean.jersey = intRange(p.jersey, 'number', 0, 99, { what: 'a jersey number' });
      if (p.captain === true) {
        clean.captain = true;
        captains += 1;
      }
    }
    out.push(clean);
  }
  if (captains > 1) bad('players', 'Mark at most one captain.');
  return out;
}

// --- Tournament status machine ------------------------------------------

// Allowed from→to transitions (design; Requirement 9.9).
export const TRANSITIONS = {
  DRAFT: ['ONGOING'],
  ONGOING: ['COMPLETED'],
  COMPLETED: ['ONGOING', 'ARCHIVED'],
  ARCHIVED: ['COMPLETED'],
};

// Completed and Archived refuse every change except a status change (Requirement 9.11).
export const isLocked = (status) => status === 'COMPLETED' || status === 'ARCHIVED';

/**
 * Decide a status change. Returns null to accept, or the 409 Error_Body code (Requirement 9.10):
 * - STATUS_CHANGE_INVALID when the pair is not in TRANSITIONS
 * - NO_SPORTS when publishing (Draft→Ongoing) with no Tournament_Sport
 * - LIVE_MATCHES when completing (Ongoing→Completed) with a Live match
 */
export function statusChange(from, to, { sportCount = 0, liveCount = 0 } = {}) {
  if (!(TRANSITIONS[from] || []).includes(to)) return 'STATUS_CHANGE_INVALID';
  if (from === 'DRAFT' && to === 'ONGOING' && sportCount < 1) return 'NO_SPORTS';
  if (from === 'ONGOING' && to === 'COMPLETED' && liveCount > 0) return 'LIVE_MATCHES';
  return null;
}

// --- Match control flags -------------------------------------------------

/**
 * The controls a staff match row may render (Requirement 19.10, Property 13). Each flag is true only
 * when the matching API rule would accept the action, so the UI never shows a control the API refuses.
 *
 * @param {object} args
 * @param {'live'|'upcoming'|'past'} args.phase staff Match_Phase from `matchPhase`
 * @param {string} args.status match status (SCHEDULED, LIVE, APPROVED, …)
 * @param {string} args.tournamentStatus DRAFT | ONGOING | COMPLETED | ARCHIVED
 * @param {boolean} args.inScope caller owns or manages the Tournament_Sport
 * @param {boolean} args.holdsAssignment caller holds the match's ACTIVE Assignment
 * @param {boolean} args.hasActions the match has at least one score action
 * @returns {{ canEdit: boolean, canDelete: boolean, canAssign: boolean, canScore: boolean }}
 */
export function matchFlags({ phase, status, tournamentStatus, inScope, holdsAssignment, hasActions }) {
  const scope = Boolean(inScope) && !isLocked(tournamentStatus);
  const upcoming = phase === 'upcoming' && status === 'SCHEDULED'; // editable window
  const notClosed = phase !== 'past'; // Final or Not_Scored both report phase 'past'
  return {
    canEdit: scope && upcoming,
    canDelete: scope && upcoming && !hasActions,
    canAssign: scope && notClosed, // upcoming or live; assign refuses Final and Not_Scored
    canScore: Boolean(holdsAssignment) && !isLocked(tournamentStatus) && notClosed,
  };
}
