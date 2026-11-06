// Player tags — app-created data, separate from imported FM squads/shortlists.
//
// Stored per career as one settings record (key "tags:<careerId>"), so it is
// included in app backups, replaced on restore and cleared on reset, while
// FM snapshot imports never touch it.
//
// Shape (all pure functions below return a NEW state, never mutate):
//   { tags: { [tagId]: { id, name, createdAt } },
//     assignments: { [playerKey]: [tagId, …] } }
// playerKey = "<careerId>:<persistent player ID>" (see players.js).

export const emptyTags = () => ({ tags: {}, assignments: {} });

/** Trim and collapse repeated spaces. Returns '' for blank input. */
export function normalizeTagName(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

const matchKey = (name) => normalizeTagName(name).toLowerCase();

/** Repair anything malformed (e.g. from an edited backup) instead of failing. */
export function sanitizeTags(raw) {
  const out = emptyTags();
  if (!raw || typeof raw !== 'object') return out;
  const seen = new Map(); // matchKey → id (merge accidental duplicates)
  for (const [id, t] of Object.entries(raw.tags || {})) {
    const name = normalizeTagName(t?.name);
    if (!name) continue;
    if (seen.has(matchKey(name))) continue;
    seen.set(matchKey(name), id);
    out.tags[id] = { id, name, createdAt: t.createdAt ?? null };
  }
  for (const [key, ids] of Object.entries(raw.assignments || {})) {
    if (!Array.isArray(ids)) continue;
    const valid = [...new Set(ids.filter((id) => out.tags[id]))];
    if (valid.length) out.assignments[key] = valid;
  }
  // No empty tags.
  for (const id of Object.keys(out.tags)) if (!countFor(out, id)) delete out.tags[id];
  return out;
}

function countFor(state, tagId) {
  let n = 0;
  for (const ids of Object.values(state.assignments)) if (ids.includes(tagId)) n++;
  return n;
}

export function findTagByName(state, name) {
  const k = matchKey(name);
  return Object.values(state.tags).find((t) => matchKey(t.name) === k) || null;
}

/** All tags, alphabetical, with player counts. */
export function listTags(state) {
  return Object.values(state.tags)
    .map((t) => ({ ...t, count: countFor(state, t.id) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base', numeric: true }));
}

export function tagsForPlayer(state, playerKey) {
  return (state.assignments[playerKey] || [])
    .map((id) => state.tags[id])
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base', numeric: true }));
}

export function playerKeysForTag(state, tagId) {
  return Object.entries(state.assignments).filter(([, ids]) => ids.includes(tagId)).map(([k]) => k);
}

const newId = () => `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * Assign a tag by name to a player, reusing an existing tag (case-insensitive,
 * keeping its spelling) or creating it. Returns { state, tag, created, already }.
 * Throws on a blank name.
 */
export function assignTag(state, playerKey, rawName) {
  const name = normalizeTagName(rawName);
  if (!name) throw new Error('Enter a tag name.');
  let tag = findTagByName(state, name);
  let created = false;
  const next = { tags: { ...state.tags }, assignments: { ...state.assignments } };
  if (!tag) {
    tag = { id: newId(), name, createdAt: new Date().toISOString() };
    next.tags[tag.id] = tag;
    created = true;
  }
  const current = next.assignments[playerKey] || [];
  if (current.includes(tag.id)) return { state, tag, created: false, already: true };
  next.assignments[playerKey] = [...current, tag.id];
  return { state: next, tag, created, already: false };
}

/**
 * Remove one tag from one player. If that was the tag's last player, the tag
 * itself is deleted. Other players are untouched.
 */
export function unassignTag(state, playerKey, tagId) {
  const current = state.assignments[playerKey] || [];
  if (!current.includes(tagId)) return { state, deletedTag: false };
  const next = { tags: { ...state.tags }, assignments: { ...state.assignments } };
  const remaining = current.filter((id) => id !== tagId);
  if (remaining.length) next.assignments[playerKey] = remaining;
  else delete next.assignments[playerKey];
  const deletedTag = countFor(next, tagId) === 0;
  if (deletedTag) delete next.tags[tagId];
  return { state: next, deletedTag };
}
