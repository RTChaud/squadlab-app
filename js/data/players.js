// Player identity and history.
//
// Identity = career ID + FM's persistent player ID (`unique_id`). The extractor
// already provides this as `player_key` ("<career_id>:<unique_id>"). Names are
// never used to match, and `uid` is only used inside one snapshot (squad and
// shortlist membership lists refer to it).

import { FOOTBALL_ATTRS, intOrNull } from './attributes.js';

/** Persistent key for a player record, or null when it cannot be trusted. */
export function playerKey(p, careerId) {
  if (typeof p.player_key === 'string' && p.player_key) {
    return p.player_key.startsWith(`${careerId}:`) ? p.player_key : null;
  }
  return Number.isInteger(p.unique_id) ? `${careerId}:${p.unique_id}` : null;
}

export const keyFor = (careerId, persistentId) => `${careerId}:${persistentId}`;

/** The id used in URLs (the persistent part of the key). */
export function persistentId(p) {
  if (typeof p.player_key === 'string' && p.player_key.includes(':')) return p.player_key.split(':').pop();
  return Number.isInteger(p.unique_id) ? String(p.unique_id) : null;
}

/** Find a player in one snapshot's data by persistent key. */
export function findInSnapshot(data, key) {
  return data.players.find((p) => playerKey(p, data.career_id) === key) || null;
}

// ---- Metrics: compact per-snapshot values used for development graphs ------
// Derived from the stored snapshots (never the source of truth), so it can be
// rebuilt at any time and is not part of the backup.

export function buildMetrics(record) {
  const { data } = record;
  const players = [];
  for (const p of data.players) {
    const key = playerKey(p, data.career_id);
    if (!key) continue;
    const attrs = {};
    for (const a of FOOTBALL_ATTRS) attrs[a.key] = intOrNull(p.attributes?.[a.key]);
    players.push({
      key,
      uid: p.uid,
      ca: intOrNull(p.ability?.current),
      pa: intOrNull(p.ability?.potential),
      club: p.club_name ?? null,
      attrs,
    });
  }
  return { id: record.id, careerId: record.careerId, gameDate: record.gameDate, players };
}

/**
 * Chronological history for one player from metrics of the active career.
 * Returns [{ gameDate, present, ca, attrs, club }] for EVERY snapshot, with
 * present=false where the player was not in that snapshot, so charts can show
 * gaps instead of joining across missing observations.
 */
export function playerHistory(metricsList, careerId, key) {
  return metricsList
    .filter((m) => m.careerId === careerId)
    .sort((a, b) => a.gameDate.localeCompare(b.gameDate))
    .map((m) => {
      const row = m.players.find((p) => p.key === key);
      return row
        ? { gameDate: m.gameDate, present: true, ca: row.ca, attrs: row.attrs, club: row.club }
        : { gameDate: m.gameDate, present: false, ca: null, attrs: {}, club: null };
    });
}
