// Player identity and history.
//
// Identity = career ID + FM's persistent player ID (`unique_id`). The extractor
// already provides this as `player_key` ("<career_id>:<unique_id>"). Names are
// never used to match, and `uid` is only used inside one snapshot (squad and
// shortlist membership lists refer to it).

import { FOOTBALL_ATTRS, HIDDEN_ATTRS, PERSONALITY_ATTRS, intOrNull } from './attributes.js';

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

/** Bump when buildMetrics changes; stored metrics with another version are rebuilt. */
export const METRICS_VERSION = 2;

export function buildMetrics(record) {
  const { data } = record;
  const players = [];
  for (const p of data.players) {
    const key = playerKey(p, data.career_id);
    if (!key) continue;
    const attrs = {};
    for (const a of FOOTBALL_ATTRS) attrs[a.key] = intOrNull(p.attributes?.[a.key]);
    // v2: hidden attributes and personality too (list development columns).
    for (const a of HIDDEN_ATTRS) attrs[a.key] = intOrNull(p.attributes?.[a.key]);
    for (const a of PERSONALITY_ATTRS) attrs[a.key] = intOrNull(p.personality?.[a.key]);
    players.push({
      key,
      uid: p.uid,
      ca: intOrNull(p.ability?.current),
      pa: intOrNull(p.ability?.potential),
      club: p.club_name ?? null,
      attrs,
    });
  }
  return { id: record.id, careerId: record.careerId, gameDate: record.gameDate, v: METRICS_VERSION, players };
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

// ---- Display helpers shared by lineups and pickers ------------------------------

/**
 * Club ownership from the extract's own field (is_club_player), falling back
 * to squad membership. Shortlist membership never makes a player "ours".
 */
export function isClubOwned(p, data) {
  if (typeof p.is_club_player === 'boolean') return p.is_club_player;
  return Array.isArray(data?.squad_player_uids) ? data.squad_player_uids.includes(p.uid) : false;
}

const txt = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Full display name: common name if FM has one, else first + last. */
export function displayNameOf(p) {
  return txt(p.common_name) || [txt(p.first_name), txt(p.last_name)].filter(Boolean).join(' ') || txt(p.name) || '—';
}

/** Compact name for small spaces: common name, else "N. Surname". */
export function compactNameOf(p) {
  if (txt(p.common_name)) return txt(p.common_name);
  const first = txt(p.first_name), last = txt(p.last_name);
  if (first && last) return `${first.charAt(0)}. ${last}`;
  return last || first || txt(p.name) || '—';
}

/** Lower-case, accent-free text for searching ("Benítez" → "benitez"). */
export const normalizeSearch = (text) => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Accent-insensitive search text for a player (display, common and full names). */
export function searchTextOf(p) {
  return normalizeSearch([p.common_name, p.first_name, p.last_name, p.name, p.full_name].filter((x) => typeof x === 'string').join(' '));
}

/**
 * Name as the profile shows it: the recorded common/display name when FM has
 * one (e.g. "Endrick"), else first + last. `full` is the longer name to show
 * underneath when it differs. Underlying fields are never changed.
 */
export function profileNameOf(p) {
  const first = txt(p.first_name), last = txt(p.last_name), common = txt(p.common_name);
  const full = [first, last].filter(Boolean).join(' ');
  return {
    main: common || full || txt(p.name) || '—',
    full: common && full && common !== full ? full : null,
    common, first, last,
  };
}
