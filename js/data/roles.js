// Position & role analysis: the bundled role catalogue, its mapping onto the
// app's fields, and the shared role score used by the player profile,
// Comparison, Tactic, Lineups, sorting/filters and the AI requests.
//
// Source of truth: data/role-catalogue.json, generated from the user's
// "Roles and positions" list. Its shape is
//   { positions: { GK: { position, in_possession: [role], out_of_possession: [role] }, … } }
//   role = { role, key_attributes: [label] }
// Each phase has its own list, so a role name can appear in both phases (or at
// several positions) with different attributes; roles are always resolved by
// position + phase + role. Role ids are "<app position>:<phase>:<slug>"
// (e.g. "amc:in_possession:advanced_playmaker").
//
// Saved selections (Lineups slot roles, Tactic, the profile's role explorer,
// Comparison, role filters) store role ids. An id the catalogue still lists at
// that position and phase is kept; a clear rename at the same position and
// phase (LEGACY_ROLES) is migrated; anything else is cleared so a replacement
// can be chosen.

import { SELECTABLE } from './radar.js';
import { formatPositions } from './positions.js';

export const CATALOGUE_URL = 'data/role-catalogue.json';

export const PHASES = [
  { id: 'in_possession', label: 'In Possession' },
  { id: 'out_of_possession', label: 'Out of Possession' },
];
export const PHASE_IDS = PHASES.map((p) => p.id);

/** Shown in a role selector when the catalogue lists nothing for that position and phase. */
export const NO_ROLES_TEXT = 'No roles listed for this position and phase';

// ---- Mapping (one place for every view) ----------------------------------------------

/**
 * Catalogue position code → the app's position (the extract's `positions`
 * familiarity key). Left and right stay separate; ST is the app's STC.
 */
export const POSITION_CODE_MAP = {
  GK: 'gk', DR: 'dr', DC: 'dc', DL: 'dl', WBR: 'wbr', WBL: 'wbl', DM: 'dm',
  MR: 'mr', MC: 'mc', ML: 'ml', AMR: 'amr', AMC: 'amc', AML: 'aml', ST: 'stc', STC: 'stc',
};

/** Catalogue attribute label → the app's attribute key (from the app's own attribute list). */
const normLabel = (s) => String(s || '').toLowerCase().replace(/\(tendency\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const LABEL_TO_KEY = new Map(Object.entries(SELECTABLE).map(([key, a]) => [normLabel(a.label), key]));
export const attributeKeyForLabel = (label) => LABEL_TO_KEY.get(normLabel(label)) || null;

/** Slug for a role id: the name without a trailing position qualifier. */
export const roleSlug = (name) => String(name || '').replace(/\s*\((?:AMC|Wide)\)\s*$/i, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * Saved role ids from earlier catalogues that map unambiguously to a role in
 * this one (same position, same phase, same role under a corrected name).
 * Any other id the catalogue doesn't list is cleared.
 */
export const LEGACY_ROLES = {
  'gk:out_of_possession:line_holding_goalkeeper': 'gk:out_of_possession:line_holding_keeper',
  'ml:out_of_possession:wide_outlet_midfielder': 'ml:out_of_possession:wide_outlet_wide_midfielder',
  'mr:out_of_possession:wide_outlet_midfielder': 'mr:out_of_possession:wide_outlet_wide_midfielder',
};

/**
 * A saved role id at a position and phase, resolved against the catalogue:
 *   { id, role } when it is listed there (or { id, role, renamedFrom } after a migration);
 *   { id: null, role: null, cleared: oldId } when it can't be mapped safely;
 *   { id: null, role: null, cleared: null } when nothing was saved.
 */
export function resolveSavedRole(cat, position, phase, id) {
  if (!id) return { id: null, role: null, cleared: null };
  const list = rolesFor(cat, position, phase);
  const direct = list.find((r) => r.id === id);
  if (direct) return { id, role: direct, cleared: null };
  const to = LEGACY_ROLES[id];
  const renamed = to ? list.find((r) => r.id === to) : null;
  if (renamed) return { id: renamed.id, role: renamed, cleared: null, renamedFrom: id };
  return { id: null, role: null, cleared: id };
}

// ---- Loading & validation ---------------------------------------------------------------

let loading = null;
let active = null;

/** Load (once) and normalise the bundled catalogue. Resolves the catalogue or one with `error`. */
export function loadRoleCatalogue() {
  if (active) return Promise.resolve(active);
  if (!loading) {
    loading = fetch(CATALOGUE_URL)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((raw) => (active = normaliseCatalogue(raw)))
      .catch((e) => { loading = null; return { error: `Role catalogue could not be loaded (${e.message}).`, positions: [], roles: new Map() }; });
  }
  return loading;
}

/** The catalogue once loaded (null before). */
export const activeCatalogue = () => active;

/** For tests and catalogue updates: use this raw catalogue instead of the bundled file. */
export function useCatalogue(raw) {
  active = normaliseCatalogue(raw);
  loading = Promise.resolve(active);
  return active;
}

/**
 * Normalise the catalogue into
 *   { game, source, positions: [{ code, catCode, label, short, phases }], roles: Map(id → role), counts, issues }
 * role = { id, name, phase, position (app code), attrs: [attrDef] }
 * attrDef = { key, label, block, mapped }
 * Nothing is skipped silently: an entry or attribute that can't be used is
 * described in `issues` (an unmapped attribute keeps the role, whose score is
 * then unavailable).
 */
export function normaliseCatalogue(raw) {
  const issues = [];
  const roles = new Map();
  const positions = [];
  const counts = { in_possession: 0, out_of_possession: 0 };

  const attrDef = (label, where) => {
    const key = attributeKeyForLabel(label);
    const app = key ? SELECTABLE[key] : null;
    if (!app) issues.push(`${where}: attribute “${label}” isn’t one the app records.`);
    return { key: key || String(label), label: app ? app.label : String(label), block: app ? app.source : 'attributes', mapped: !!app };
  };

  const src = raw && typeof raw.positions === 'object' && !Array.isArray(raw.positions) ? raw.positions : {};
  for (const [rawCode, pos] of Object.entries(src)) {
    const catCode = String(rawCode).toUpperCase();
    const code = POSITION_CODE_MAP[catCode];
    if (!code) { issues.push(`Position “${rawCode}” isn’t one the app knows.`); continue; }
    if (positions.some((p) => p.code === code)) { issues.push(`Position ${catCode} appears twice; the first entry is used.`); continue; }
    const phases = {};
    for (const phase of PHASE_IDS) {
      phases[phase] = [];
      const where = `${catCode} ${phase.replace(/_/g, ' ')}`;
      for (const r of Array.isArray(pos?.[phase]) ? pos[phase] : []) {
        const name = typeof r?.role === 'string' ? r.role.trim() : '';
        const key = Array.isArray(r?.key_attributes) ? r.key_attributes : [];
        if (!name || !key.length) { issues.push(`${where}: a role is missing its name or key attributes.`); continue; }
        const id = `${code}:${phase}:${roleSlug(name)}`;
        if (roles.has(id)) { issues.push(`${where} lists “${name}” twice; the first entry is used.`); continue; }
        if (new Set(key.map(normLabel)).size !== key.length) issues.push(`${where} “${name}” lists an attribute twice; it counts once.`);
        const attrs = [...new Map(key.map((l) => [normLabel(l), l])).values()].map((l) => attrDef(l, `${where} “${name}”`));
        const role = { id, name, phase, position: code, attrs };
        roles.set(id, role);
        phases[phase].push(role);
        counts[phase]++;
      }
    }
    positions.push({ code, catCode, label: String(pos?.position || catCode), short: formatPositions([code.toUpperCase()]), phases });
  }

  return {
    game: typeof raw?.game === 'string' ? raw.game : null,
    source: typeof raw?.source === 'string' ? raw.source : null,
    version: typeof raw?.source === 'string' ? raw.source : 'unknown',
    positions,
    roles,
    counts,
    issues: [...new Set(issues)],
  };
}

export const positionByCode = (cat, code) => cat.positions.find((p) => p.code === code) || null;
export const rolesFor = (cat, code, phase) => positionByCode(cat, code)?.phases[phase] || [];
/** The role's key attributes (every listed attribute is a key attribute). */
export const keyAttrs = (role) => role.attrs;

/**
 * Check a saved { position, role } for one phase against the active catalogue.
 * An unknown position clears both; a migrated role maps to its new id; a role
 * that isn't listed for that position and phase is cleared (`cleared` = the
 * old id) so a replacement can be chosen.
 * Returns { position, role, cleared: null | { reason, id } }.
 */
export function validateSelection(cat, phase, sel) {
  const position = sel?.position && positionByCode(cat, sel.position) ? sel.position : null;
  let cleared = null, role = null;
  if (sel?.position && !position) cleared = { reason: 'position', id: sel.role || null };
  else if (position && sel?.role) {
    const r = resolveSavedRole(cat, position, phase, sel.role);
    role = r.id;
    if (!r.id) cleared = { reason: 'role', id: r.cleared };
  }
  return { position, role, cleared };
}

// ---- Values and the score ------------------------------------------------------------------

const valid = (v) => Number.isInteger(v) && v >= 1 && v <= 20;

/** The player's recorded value for a role attribute (null if missing or out of range). */
export function roleValue(p, a) {
  if (!a.mapped) return null;
  const v = p?.[a.block]?.[a.key];
  return valid(v) ? v : null;
}

/** Familiarity (1–20) at an app position code, or null. */
export function familiarityAt(p, code) {
  const v = p?.positions?.[code];
  return valid(v) ? v : null;
}

/**
 * SquadLab role score, shared by every view and the AI requests: the
 * equal-weight arithmetic mean of the key attributes listed for that
 * position, phase and role, on the 1–20 attribute scale. Phases are scored
 * separately and never combined. If any key attribute has no recorded value
 * the score is unavailable (`value` null): no zero, no partial mean.
 * Full precision is kept; round only for display (fmtScore).
 * Returns { value|null, incomplete, missing: [label], parts: [{ attr, value }] }.
 */
export function roleScore(role, p) {
  const parts = keyAttrs(role).map((a) => ({ attr: a, value: roleValue(p, a) }));
  const missing = parts.filter((x) => x.value === null).map((x) => x.attr.label);
  const incomplete = missing.length > 0 || !parts.length;
  const value = incomplete ? null : parts.reduce((s, x) => s + x.value, 0) / parts.length;
  return { value, incomplete, missing, parts };
}

/** Display on the 1–20 scale with one decimal (14.3, 15.0); "—" when unavailable. */
export const fmtScore = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : (Math.round(v * 10) / 10).toFixed(1));
/** For AI payloads: rounded to two decimals. */
export const scoreForAi = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

/** Short text for the score breakdown. */
export function scoreBreakdown(s) {
  if (s.value !== null) {
    const items = s.parts.map((x) => `${x.attr.label} ${x.value}`).join(' + ');
    return [`(${items}) ÷ ${s.parts.length} = ${fmtScore(s.value)}`];
  }
  if (s.missing.length) return [`Unavailable: no recorded value for ${s.missing.join(', ')}.`];
  return ['Unavailable: this role has no key attributes.'];
}
