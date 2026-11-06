// Nationality lookup.
//
// The extract stores save-local nation IDs (player.nation_id and
// second_nation_ids). They are translated with data/fm-nation-mapping.json:
//   save_local_nations[id] → { database_id, name }
//   database_nations[database_id] → { name }   (fallback when name is null)
// Replace that file in the repository whenever it is regenerated; no code
// change is needed.
//
// Save-local IDs belong to one save. If the mapping file has a "career_id"
// field, it is only used for that career; otherwise it is used as-is.
// Anything that cannot be resolved is shown as unavailable — never guessed.

import { FLAG_CODE_BY_DB_ID, flagEmoji } from './flags.js';

const MAPPING_URL = 'data/fm-nation-mapping.json';

let loading = null;
let mapping = null; // { careerId, local: Map<number, {databaseId, name}>, db: Map<number, string> }

function parse(json) {
  if (!json || typeof json !== 'object' || typeof json.save_local_nations !== 'object') return null;
  const db = new Map();
  for (const [id, v] of Object.entries(json.database_nations || {})) {
    if (v && typeof v.name === 'string' && v.name) db.set(Number(id), v.name);
  }
  const local = new Map();
  for (const [id, v] of Object.entries(json.save_local_nations)) {
    if (!v || typeof v !== 'object') continue;
    local.set(Number(id), {
      databaseId: Number.isInteger(v.database_id) ? v.database_id : null,
      name: typeof v.name === 'string' && v.name ? v.name : null,
    });
  }
  return { careerId: typeof json.career_id === 'string' ? json.career_id : null, local, db };
}

/** Load the mapping once. Resolves to true if available; never throws. */
export function loadNations() {
  if (!loading) {
    loading = fetch(MAPPING_URL, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { mapping = parse(json); return !!mapping; })
      .catch(() => { mapping = null; return false; });
  }
  return loading;
}

/**
 * Resolve a save-local nation ID to { name, flag } (flag may be null), or
 * null when it can't be resolved (mapping missing, other career, unknown ID).
 */
export function resolveNation(id, careerId) {
  if (!mapping || !Number.isInteger(id)) return null;
  if (mapping.careerId && careerId && mapping.careerId !== careerId) return null;
  const entry = mapping.local.get(id);
  if (!entry) return null;
  const name = entry.name || (entry.databaseId !== null ? mapping.db.get(entry.databaseId) : null) || null;
  if (!name) return null;
  return { name, flag: entry.databaseId !== null ? flagEmoji(FLAG_CODE_BY_DB_ID[entry.databaseId]) : null };
}

export const nationName = (id, careerId) => resolveNation(id, careerId)?.name ?? null;
