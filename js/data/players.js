// Player identity and history.
//
// Identity = SquadLab career ID + FM's persistent player ID (`unique_id`).
// Keys look like "<career id>:<unique_id>". The career part is always the
// SquadLab career the snapshot is stored in, never the exporter's own
// career_id, so snapshots exported with a different career_id still link to
// the same players (and their tags, lineups and history). When a record has no
// unique_id, the player_key suffix is used, and failing that a uid link worked
// out at import time (only when unambiguous). Names are never used to match.

import { FOOTBALL_ATTRS, HIDDEN_ATTRS, PERSONALITY_ATTRS, intOrNull } from './attributes.js';

const LINKED = Symbol('squadlab.linked');
const UID_PID = Symbol('squadlab.uidPid');

/** FM's own persistent id for a record (unique_id, else the player_key suffix), or null. */
export function ownPersistentId(p) {
  if (Number.isInteger(p?.unique_id)) return String(p.unique_id);
  if (typeof p?.player_key === 'string' && p.player_key.includes(':')) {
    const tail = p.player_key.split(':').pop();
    if (tail) return tail;
  }
  return null;
}

/**
 * Attach a stored record's uid links (players without a unique_id that were
 * matched to an existing player by uid) to its players. Idempotent; the data
 * itself is not changed.
 */
export function linkRecordPlayers(record) {
  const data = record?.data;
  if (!data || data[LINKED]) return record;
  const links = record.uidLinks && typeof record.uidLinks === 'object' ? record.uidLinks : null;
  if (links) {
    for (const p of data.players || []) {
      const pid = links[p?.uid];
      if (typeof pid === 'string' && pid && !ownPersistentId(p)) p[UID_PID] = pid;
    }
  }
  data[LINKED] = true;
  return record;
}

/** The persistent part of a player's key (used in URLs), or null when unknown. */
export function persistentId(p) {
  return ownPersistentId(p) ?? (typeof p?.[UID_PID] === 'string' ? p[UID_PID] : null);
}

/** Key of a player record inside a SquadLab career, or null when it has no persistent id. */
export function playerKey(p, careerId) {
  const pid = persistentId(p);
  return pid ? `${careerId}:${pid}` : null;
}

export const keyFor = (careerId, pid) => `${careerId}:${pid}`;

const pidOfKey = (key) => (typeof key === 'string' ? key.slice(key.lastIndexOf(':') + 1) : '');

/** Find a player in one snapshot's data by persistent key. */
export function findInSnapshot(data, key) {
  const pid = pidOfKey(key);
  return pid ? data.players.find((p) => persistentId(p) === pid) || null : null;
}

/**
 * Work out how an incoming extract's players link to a career's existing
 * players. `known` is the career's metrics list (each { players: [{ key, uid }] }).
 * Returns { uidLinks: { uid: pid }, linked, added, unlinked }:
 *   linked   — players already recorded in the career (same unique_id, or uid link)
 *   added    — players new to the career
 *   unlinked — players with no unique_id whose uid match was missing or ambiguous
 */
export function matchIncomingPlayers(data, known) {
  const knownPids = new Set();
  const pidsByUid = new Map();
  for (const m of known) for (const r of m.players) {
    const pid = pidOfKey(r.key);
    knownPids.add(pid);
    if (Number.isInteger(r.uid)) {
      if (!pidsByUid.has(r.uid)) pidsByUid.set(r.uid, new Set());
      pidsByUid.get(r.uid).add(pid);
    }
  }
  const taken = new Set(data.players.map(ownPersistentId).filter(Boolean));
  const uidLinks = {};
  let linked = 0, added = 0, unlinked = 0;
  for (const p of data.players) {
    const own = ownPersistentId(p);
    if (own) { if (knownPids.has(own)) linked++; else added++; continue; }
    const c = pidsByUid.get(p.uid);
    const pid = c && c.size === 1 ? [...c][0] : null;
    if (pid && !taken.has(pid)) { uidLinks[p.uid] = pid; taken.add(pid); linked++; }
    else unlinked++;
  }
  return { uidLinks, linked, added, unlinked };
}

// ---- Metrics: compact per-snapshot values used for development graphs ------
// Derived from the stored snapshots (never the source of truth), so it can be
// rebuilt at any time and is not part of the backup.

/** Bump when buildMetrics changes; stored metrics with another version are rebuilt. */
export const METRICS_VERSION = 3;

const TEAM_SLOT_KEYS = { 0: 'first', 1: 'reserve', 2: 'youth' };

/**
 * uid → 'first' | 'reserve' | 'youth' | 'loan' from the extract's squads,
 * linked the same way as the Squad screen (team_slot 0/1/2 and the single
 * "Out on loan" group). An ambiguous or missing group links nobody.
 */
export function squadKeyByUid(data) {
  const map = new Map();
  const squads = Array.isArray(data?.squads) ? data.squads : [];
  const add = (list, key) => { if (list.length === 1) for (const u of list[0].player_uids || []) if (!map.has(u)) map.set(u, key); };
  for (const [slot, key] of Object.entries(TEAM_SLOT_KEYS)) add(squads.filter((s) => Number.isInteger(s.team_id) && s.team_slot === Number(slot)), key);
  add(squads.filter((s) => s.id === 'out_on_loan'), 'loan');
  return map;
}

export function buildMetrics(record) {
  linkRecordPlayers(record);
  const { data } = record;
  const squadOf = squadKeyByUid(data);
  const players = [];
  for (const p of data.players) {
    const key = playerKey(p, record.careerId);
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
      // v3: club membership (incl. players out on loan), squad and name on that date.
      own: isClubOwned(p, data),
      squad: squadOf.get(p.uid) ?? null,
      name: displayNameOf(p),
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

/** Every word of the query appears in the player's names (accent- and case-insensitive). */
export function matchesNameQuery(p, query) {
  const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const text = searchTextOf(p);
  return tokens.every((t) => text.includes(t));
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
