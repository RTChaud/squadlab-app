// Nationality lookup.
//
// The extract stores FM's internal nation IDs (e.g. 139), which are specific to
// the game database and are NOT ISO country codes. Names and flags are shown
// only when a verified mapping is added below, e.g.
//   139: { name: 'England', flag: '🏴' },
// Until then nationality shows as unavailable rather than being guessed.

export const NATIONS = {};

/** Resolve a nation ID; null when no verified mapping exists. */
export function nationName(id) {
  const n = Number.isInteger(id) ? NATIONS[id] : null;
  return n ? n : null;
}
