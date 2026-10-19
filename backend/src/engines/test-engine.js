// Test-only engine: one point per POINT action, linked reversal. Only CI and staging enable it.
// Pure: returns a new snapshot and never mutates its inputs.

// Starting snapshot for a match that has no stored snapshot yet. `sides` holds the two side names.
export function init({ matchId, sport, status, sides }) {
  return { matchId, sport, status, sides: sides.map((name) => ({ name, points: 0 })), corrected: false };
}

// action: { type, payload, reversesActionId? } from the request body.
// target: the stored action that `reversesActionId` names, loaded for the same match as
//   { type, payload, reversed } (reversed = a later action already reverses it), or null if not found.
// Returns { ok: true, snapshot } or { ok: false, message }; the route maps the failure to 422 ACTION_INVALID.
export function apply(snapshot, action, target = null) {
  const invalid = (message) => ({ ok: false, message });
  const add = (side, delta) => ({
    ok: true,
    // `corrected` carries over: a reversal while LIVE leaves the public correction marker unset.
    snapshot: { ...snapshot, sides: snapshot.sides.map((s, i) => (i === side ? { ...s, points: s.points + delta } : s)) },
  });

  if (action.reversesActionId == null) {
    if (action.type !== 'POINT') return invalid('Unsupported action type');
    const side = action.payload?.side;
    if (side !== 0 && side !== 1) return invalid('payload.side must be 0 or 1');
    return add(side, 1);
  }

  if (action.type !== 'REVERSE') return invalid('A reversal must have type REVERSE');
  if (!target) return invalid('The reversed action does not exist in this match');
  if (target.type !== 'POINT') return invalid('Only a POINT can be reversed');
  if (target.reversed) return invalid('The action is already reversed');
  const side = target.payload.side;
  if (snapshot.sides[side].points < 1) return invalid('The side has no point to reverse');
  return add(side, -1);
}

export default { init, apply };
