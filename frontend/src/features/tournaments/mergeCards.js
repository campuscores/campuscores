/**
 * Merge live home-room cards into a public match list by match ID (Requirement 17.13).
 * IDs compare as strings. Pure: the inputs are never changed.
 *
 * - An ID in both lists: the read's match fields stay (time, venue, stage, phase, sides),
 *   the card's `status` and `score` win, and fields only the card has (winner, periods, ...) are added.
 * - A match without a card is returned as is.
 * - A card whose ID the read does not contain is appended, in card order, after the read's matches.
 *
 * @param {Array<object>|null} matches public `match` DTOs from the cached read
 * @param {Array<object>|null} cards public `card` DTOs from `useHomeCards()` (null before the first message)
 * @returns {Array<object>} every match ID and card ID exactly once
 */
export function mergeCards(matches, cards) {
  const live = new Map((cards ?? []).map(card => [String(card.id), card]));
  const read = matches ?? [];
  const merged = read.map(match => {
    const card = live.get(String(match.id));
    return card ? { ...card, ...match, status: card.status, score: card.score } : match;
  });
  const readIds = new Set(read.map(match => String(match.id)));
  return [...merged, ...[...live.values()].filter(card => !readIds.has(String(card.id)))];
}
