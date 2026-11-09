// Lineups — app-created data for the active career (like tags).
//
// Stored as one settings record ("lineups:<careerId>"), so it is included in
// app backups, replaced on restore and cleared on reset; FM snapshot imports
// never touch it. Assignments are the single source of truth: the "Squad
// slot" values and hierarchy ranks are always derived from them.
//
// Shape (pure functions below return a NEW state):
//   { lineups: [ { id, name, kind: 'default'|'custom', tier?, createdAt,
//                  slots: { GK: playerKey|null, RB: …, … } } ],
//     slotRoles: { GK: { in_possession: roleId|null, out_of_possession: roleId|null }, RB: …, … } }
// playerKey = "<careerId>:<persistent player ID>" (see players.js).
// slotRoles is the career's tactical setup: one In Possession and one Out of
// Possession role per formation slot, shared by First XI, Backup XI and Future
// XI and kept whoever is (or isn't) in the slot. Role ids are the role
// catalogue's stable ids ("<position>:<phase>:<role>"); older data without
// slotRoles loads with every role unset.

// ---- Formation (definition only — rendering lives in the lineup view) ------

/**
 * 4-2-3-1 slots in the fixed SORT order (right side first). `fam` is the
 * position-familiarity field used in the picker. Do not reorder: hierarchy
 * ranks depend on this order.
 */
export const SLOTS = [
  { id: 'GK', fam: 'gk' },
  { id: 'RB', fam: 'dr' },
  { id: 'RCB', fam: 'dc' },
  { id: 'LCB', fam: 'dc' },
  { id: 'LB', fam: 'dl' },
  { id: 'RDM', fam: 'dm' },
  { id: 'LDM', fam: 'dm' },
  { id: 'RW', fam: 'amr' },
  { id: 'CAM', fam: 'amc' },
  { id: 'LW', fam: 'aml' },
  { id: 'ST', fam: 'stc' },
];
export const SLOT_IDS = SLOTS.map((s) => s.id);
export const SLOT_BY_ID = Object.fromEntries(SLOTS.map((s, i) => [s.id, { ...s, order: i }]));
export const FORMATION = { id: '4-2-3-1', label: '4-2-3-1 (2 DM, 1 CAM)' };

/** The three fixed lineups. Stable IDs; tier drives the Squad slot field. */
export const DEFAULT_LINEUPS = [
  { id: 'first-xi', name: 'First XI', tier: 1 },
  { id: 'backup-xi', name: 'Backup XI', tier: 2 },
  { id: 'future-xi', name: 'Future XI', tier: 3 },
];
const DEFAULT_IDS = new Set(DEFAULT_LINEUPS.map((d) => d.id));
export const isDefault = (id) => DEFAULT_IDS.has(id);

const emptySlots = () => Object.fromEntries(SLOT_IDS.map((id) => [id, null]));

export const ROLE_PHASES = ['in_possession', 'out_of_possession'];
export const emptySlotRoles = () => Object.fromEntries(SLOT_IDS.map((id) => [id, { in_possession: null, out_of_possession: null }]));

/** A stored role id is kept only when it belongs to that slot's position and phase. */
export const validSlotRole = (slotId, phase, roleId) => typeof roleId === 'string' && !!SLOT_BY_ID[slotId] && roleId.startsWith(`${SLOT_BY_ID[slotId].fam}:${phase}:`) && roleId.length <= 120;

export function sanitizeSlotRoles(raw) {
  const out = emptySlotRoles();
  if (raw && typeof raw === 'object') {
    for (const id of SLOT_IDS) for (const ph of ROLE_PHASES) {
      const v = raw[id]?.[ph];
      if (validSlotRole(id, ph, v)) out[id][ph] = v;
    }
  }
  return out;
}

export function normalizeLineupName(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

const newId = () => `l_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * Repair/validate stored or imported data and guarantee exactly one of each
 * default lineup, first and in order. Unknown slots and non-string player
 * keys are dropped; players missing from snapshots are kept (shown as last
 * recorded / unknown by the UI).
 */
export function sanitizeLineups(raw, careerId) {
  const list = Array.isArray(raw?.lineups) ? raw.lineups : [];
  const validKey = (k) => typeof k === 'string' && k && (!careerId || k.startsWith(`${careerId}:`));
  const cleanSlots = (slots) => {
    const out = emptySlots();
    if (slots && typeof slots === 'object') for (const id of SLOT_IDS) if (validKey(slots[id])) out[id] = slots[id];
    return out;
  };

  const defaults = DEFAULT_LINEUPS.map((d) => {
    const stored = list.find((l) => l && l.id === d.id);
    return { id: d.id, name: d.name, kind: 'default', tier: d.tier, createdAt: stored?.createdAt ?? new Date().toISOString(), slots: cleanSlots(stored?.slots) };
  });
  const seen = new Set(DEFAULT_IDS);
  const customs = [];
  for (const l of list) {
    if (!l || typeof l.id !== 'string' || seen.has(l.id)) continue;
    const name = normalizeLineupName(l.name);
    if (!name) continue;
    seen.add(l.id);
    customs.push({ id: l.id, name, kind: 'custom', createdAt: l.createdAt ?? null, slots: cleanSlots(l.slots) });
  }
  return { lineups: [...defaults, ...customs], slotRoles: sanitizeSlotRoles(raw?.slotRoles) };
}

export const emptyLineups = (careerId) => sanitizeLineups(null, careerId);

const replaceLineup = (state, id, fn) => ({ ...state, lineups: state.lineups.map((l) => (l.id === id ? fn(l) : l)) });

/**
 * Set or clear one slot's roles for the three default lineups. `roles` may
 * hold either phase; a phase given as null is cleared, one left out is kept.
 */
export function setSlotRoles(state, slotId, roles) {
  if (!SLOT_BY_ID[slotId]) throw new Error(`Unknown slot ${slotId}`);
  const current = state.slotRoles?.[slotId] || { in_possession: null, out_of_possession: null };
  const next = { ...current };
  for (const ph of ROLE_PHASES) {
    if (!(ph in (roles || {}))) continue;
    const v = roles[ph];
    if (v !== null && !validSlotRole(slotId, ph, v)) throw new Error(`That role doesn't belong to ${slotId}.`);
    next[ph] = v;
  }
  return { ...state, slotRoles: { ...emptySlotRoles(), ...(state.slotRoles || {}), [slotId]: next } };
}

/** Put a player in one slot (replacing whoever was there). Other slots are untouched. */
export function assignSlot(state, lineupId, slotId, playerKey) {
  if (!SLOT_BY_ID[slotId]) throw new Error(`Unknown slot ${slotId}`);
  return replaceLineup(state, lineupId, (l) => ({ ...l, slots: { ...l.slots, [slotId]: playerKey } }));
}

/** Empty one slot. The same player's other slots stay as they are. */
export function clearSlot(state, lineupId, slotId) {
  return replaceLineup(state, lineupId, (l) => ({ ...l, slots: { ...l.slots, [slotId]: null } }));
}

export function createLineup(state, rawName, slots = null) {
  const name = normalizeLineupName(rawName);
  if (!name) throw new Error('Enter a lineup name.');
  const lineup = { id: newId(), name, kind: 'custom', createdAt: new Date().toISOString(), slots: { ...emptySlots(), ...(slots || {}) } };
  return { state: { ...state, lineups: [...state.lineups, lineup] }, lineup };
}

export function renameLineup(state, id, rawName) {
  if (isDefault(id)) throw new Error('Default lineups cannot be renamed.');
  const name = normalizeLineupName(rawName);
  if (!name) throw new Error('Enter a lineup name.');
  return replaceLineup(state, id, (l) => ({ ...l, name }));
}

/** Copy any lineup (default or custom) into a NEW custom lineup. */
export function duplicateLineup(state, id, rawName) {
  const src = state.lineups.find((l) => l.id === id);
  if (!src) throw new Error('Lineup not found.');
  return createLineup(state, rawName || `${src.name} (copy)`, src.slots);
}

export function deleteLineup(state, id) {
  if (isDefault(id)) throw new Error('Default lineups cannot be deleted.');
  return { ...state, lineups: state.lineups.filter((l) => l.id !== id) };
}

// ---- Squad slot (derived from the three default lineups only) -------------

const RANK_UNASSIGNED = Number.POSITIVE_INFINITY;

/**
 * Map playerKey → [{ tier, slot, rank, label }] sorted by rank, where
 * rank = (tier − 1) × 11 + slot order. Custom lineups are ignored.
 */
export function buildSquadSlotIndex(state) {
  const index = new Map();
  for (const l of state.lineups) {
    if (l.kind !== 'default' || !l.tier) continue;
    SLOTS.forEach((s, i) => {
      const key = l.slots[s.id];
      if (!key) return;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({ tier: l.tier, slot: s.id, rank: (l.tier - 1) * SLOTS.length + i, label: `${l.tier}–${s.id}` });
    });
  }
  for (const list of index.values()) list.sort((a, b) => a.rank - b.rank);
  return index;
}

/** Sorting key: earliest assignment in the full hierarchy, or Infinity. */
export const hierarchyRank = (entries) => (entries && entries.length ? entries[0].rank : RANK_UNASSIGNED);
