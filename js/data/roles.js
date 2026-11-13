// Position & role analysis: the bundled role catalogue, its mapping onto the
// app's fields, and the shared "Role attributes /100" calculation used by the
// player profile, Comparison, Tactic, Lineups and the AI reports.
//
// Source of truth: data/fm27-role-catalogue-fminside.json (FMInside's FM27
// role calculator). Its shape is
//   { positions: { GK: { position, in_possession: [role], out_of_possession: [role] }, … } }
//   role = { role, key_attributes: [label], preferred_attributes: [label], description }
// Each phase has its own list, so a role name can appear in both phases with
// different attributes; roles are resolved by position + phase + role.
// Role ids are "<app position>:<phase>:<slug>" (e.g. "amc:in_possession:advanced_playmaker").
// A trailing position qualifier in the name ("(AMC)", "(Wide)") is kept for
// display but left out of the slug, so ids stay stable.
//
// Saved selections (Lineups slot roles, Tactic, the profile's role explorer,
// Comparison, role filters) store role ids. Ids from the previous catalogue that
// no longer exist are resolved through LEGACY_ROLES: a clear rename at the same
// position and phase maps to the new id; anything else keeps its old name and
// asks to be reselected.

import { SELECTABLE } from './radar.js';
import { TENDENCY_KEYS, attributeDirection } from './attributes.js';
import { formatPositions } from './positions.js';

export const CATALOGUE_URL = 'data/fm27-role-catalogue-fminside.json';

export const PHASES = [
  { id: 'in_possession', label: 'In Possession' },
  { id: 'out_of_possession', label: 'Out of Possession' },
];
export const PHASE_IDS = PHASES.map((p) => p.id);

/** Shown in a role selector when the catalogue lists nothing for that position and phase. */
export const NO_ROLES_TEXT = 'No roles listed for this position and phase';

// ---- Mapping (one place for every view) ----------------------------------------------

/**
 * FMInside position code → the app's position (the extract's `positions`
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
 * Role ids saved with the previous catalogue that this one no longer lists.
 * `to`: a clear rename at the same position and phase. Without `to`, the old
 * name is kept and the role must be reselected.
 */
export const LEGACY_ROLES = {
  'gk:out_of_possession:line_holding_keeper': { name: 'Line-Holding Keeper', to: 'gk:out_of_possession:line_holding_goalkeeper' },
  'ml:out_of_possession:wide_outlet_midfielder': { name: 'Wide Outlet Midfielder', to: 'ml:out_of_possession:wide_outlet_wide_midfielder' },
  'mr:out_of_possession:wide_outlet_midfielder': { name: 'Wide Outlet Midfielder', to: 'mr:out_of_possession:wide_outlet_wide_midfielder' },
  'dl:out_of_possession:full_back': { name: 'Full-Back' },
  'dl:out_of_possession:pressing_full_back': { name: 'Pressing Full-Back' },
  'dl:out_of_possession:holding_full_back': { name: 'Holding Full-Back' },
  'dr:out_of_possession:full_back': { name: 'Full-Back' },
  'dr:out_of_possession:pressing_full_back': { name: 'Pressing Full-Back' },
  'dr:out_of_possession:holding_full_back': { name: 'Holding Full-Back' },
  'wbl:out_of_possession:wing_back': { name: 'Wing-Back' },
  'wbl:out_of_possession:holding_wing_back': { name: 'Holding Wing-Back' },
  'wbl:out_of_possession:pressing_wing_back': { name: 'Pressing Wing-Back' },
  'wbr:out_of_possession:wing_back': { name: 'Wing-Back' },
  'wbr:out_of_possession:holding_wing_back': { name: 'Holding Wing-Back' },
  'wbr:out_of_possession:pressing_wing_back': { name: 'Pressing Wing-Back' },
  'mc:in_possession:box_to_box_midfielder': { name: 'Box-to-Box Midfielder' },
  'mc:in_possession:box_to_box_playmaker': { name: 'Box-to-Box Playmaker' },
  'ml:in_possession:wide_central_midfielder': { name: 'Wide Central Midfielder' },
  'mr:in_possession:wide_central_midfielder': { name: 'Wide Central Midfielder' },
  'aml:in_possession:half_space_winger': { name: 'Half-Space Winger' },
  'amr:in_possession:half_space_winger': { name: 'Half-Space Winger' },
  'aml:in_possession:wide_playmaker': { name: 'Wide Playmaker' },
  'amr:in_possession:wide_playmaker': { name: 'Wide Playmaker' },
  'aml:out_of_possession:inverting_outlet_winger': { name: 'Inverting Outlet Winger' },
  'amr:out_of_possession:inverting_outlet_winger': { name: 'Inverting Outlet Winger' },
  'stc:in_possession:second_striker': { name: 'Second Striker' },
  'stc:in_possession:half_space_forward': { name: 'Half-Space Forward' },
};

/** "half_back" → "Half Back": a readable name for an unknown saved id. */
const nameFromId = (id) => String(id || '').split(':').slice(2).join(' ').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * A saved role id at a position and phase, resolved against the catalogue:
 *   { id, role, renamedFrom } when it (or its clear rename) is listed there;
 *   { id: null, role: null, legacy: { id, name } } when it must be reselected;
 *   { id: null, role: null } when nothing was saved.
 */
export function resolveSavedRole(cat, position, phase, id) {
  if (!id) return { id: null, role: null, legacy: null };
  const list = rolesFor(cat, position, phase);
  const direct = list.find((r) => r.id === id);
  if (direct) return { id, role: direct, legacy: null };
  const old = LEGACY_ROLES[id];
  const renamed = old?.to ? list.find((r) => r.id === old.to) : null;
  if (renamed) return { id: renamed.id, role: renamed, legacy: null, renamedFrom: id };
  return { id: null, role: null, legacy: { id, name: old?.name || nameFromId(id) } };
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
 * Normalise the FMInside catalogue into
 *   { game, source, positions: [{ code, catCode, label, short, phases }], roles: Map(id → role), counts, issues }
 * role = { id, name, phase, position (app code), attrs: [attrDef], description (null for now) }
 * attrDef = { key, label, block, mapped, tendency, tier: 'key' | 'preferred' }
 * Entries that can't be used are skipped and described in `issues`.
 */
export function normaliseCatalogue(raw) {
  const issues = [];
  const roles = new Map();
  const positions = [];
  const counts = { in_possession: 0, out_of_possession: 0 };

  const attrDef = (label, tier) => {
    const key = attributeKeyForLabel(label);
    const app = key ? SELECTABLE[key] : null;
    if (!app) issues.push(`Attribute “${label}” isn’t one the app records.`);
    return {
      key: key || String(label), tier,
      label: app ? app.label : String(label),
      block: app ? app.source : 'attributes',
      mapped: !!app,
      tendency: key ? TENDENCY_KEYS.has(key) : false,
    };
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
      for (const r of Array.isArray(pos?.[phase]) ? pos[phase] : []) {
        const name = typeof r?.role === 'string' ? r.role.trim() : '';
        const key = Array.isArray(r?.key_attributes) ? r.key_attributes : [];
        const preferred = Array.isArray(r?.preferred_attributes) ? r.preferred_attributes : [];
        if (!name || !key.length) { issues.push(`A ${catCode} ${phase.replace(/_/g, ' ')} role is missing its name or key attributes.`); continue; }
        const id = `${code}:${phase}:${roleSlug(name)}`;
        if (roles.has(id)) { issues.push(`${catCode} ${phase.replace(/_/g, ' ')} lists “${name}” twice; the first entry is used.`); continue; }
        const keyAttrs = [...new Set(key)].map((l) => attrDef(l, 'key'));
        const keyLabels = new Set(key.map(normLabel));
        const prefAttrs = [...new Set(preferred)].filter((l) => !keyLabels.has(normLabel(l))).map((l) => attrDef(l, 'preferred'));
        const description = typeof r?.description === 'string' && r.description.trim() ? r.description.trim() : null;
        const role = { id, name, phase, position: code, attrs: [...keyAttrs, ...prefAttrs], description };
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
export const keyAttrs = (role) => role.attrs.filter((a) => a.tier === 'key');
export const preferredAttrs = (role) => role.attrs.filter((a) => a.tier === 'preferred');

/**
 * Check a saved { position, role } for one phase against the active catalogue.
 * An unknown position clears both; a renamed role maps to its new id; a role
 * that isn't listed for that position and phase is cleared and reported with
 * its old name, so the UI can ask for another.
 * Returns { position, role, cleared: null | { reason, roleName } }.
 */
export function validateSelection(cat, phase, sel) {
  const position = sel?.position && positionByCode(cat, sel.position) ? sel.position : null;
  let cleared = null, role = null;
  if (sel?.position && !position) cleared = { reason: 'position' };
  else if (position && sel?.role) {
    const r = resolveSavedRole(cat, position, phase, sel.role);
    role = r.id;
    if (!r.id) cleared = { reason: 'role', roleName: r.legacy?.name || null };
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
 * SquadLab role attribute score (0–100), shared by every view and the AI requests:
 * the mean of the role's Key attributes × 5 (20 → 100). Preferred attributes
 * are context only and never change the score. Lower-is-better values are
 * flipped (21 − v). A Key attribute with no recorded value makes the score
 * incomplete: `value` is then null (never computed as if it were 0) and
 * `partial` is the mean of the values that are recorded, for display only.
 * Full precision is kept; round only for display.
 * Returns { value|null, partial|null, incomplete, missing: [label], mean, parts, preferred: [{ attr, value }] }.
 */
export function roleScore(role, p) {
  const parts = keyAttrs(role).map((a) => {
    const value = roleValue(p, a);
    const lower = a.mapped && attributeDirection(a.key) === 'negative';
    return { attr: a, value, used: true, weight: 1, scoreValue: value === null ? null : (lower ? 21 - value : value) };
  });
  const known = parts.filter((x) => x.scoreValue !== null);
  const missing = parts.filter((x) => x.scoreValue === null).map((x) => x.attr.label);
  const knownMean = known.length ? known.reduce((s, x) => s + x.scoreValue, 0) / known.length : null;
  const incomplete = missing.length > 0;
  return {
    value: !incomplete && knownMean !== null ? knownMean * 5 : null,
    mean: incomplete ? null : knownMean,
    partial: knownMean === null ? null : knownMean * 5,
    incomplete,
    missing,
    parts,
    excluded: [],
    preferred: preferredAttrs(role).map((a) => ({ attr: a, value: roleValue(p, a) })),
  };
}

/** Display: one decimal, without a trailing ".0" (80, 81.7). */
export const fmtScore = (v) => (v === null || v === undefined ? '—' : String(Math.round(v * 10) / 10));

/** Short text for the score breakdown. */
export function scoreBreakdown(s) {
  const lines = [];
  if (s.value !== null) {
    const items = s.parts.map((x) => `${x.attr.label} ${x.value}${x.scoreValue !== x.value ? ` (counts as ${x.scoreValue})` : ''}`).join(', ');
    lines.push(`Mean of Key attributes ${items} = ${Math.round(s.mean * 100) / 100} × 5 = ${fmtScore(s.value)}/100`);
  } else if (s.incomplete) {
    lines.push(`Incomplete: no recorded value for ${s.missing.join(', ')}.`);
  } else {
    lines.push('Unavailable: this role has no Key attributes.');
  }
  return lines;
}
