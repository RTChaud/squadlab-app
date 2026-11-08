// Position & role analysis: the bundled role catalogue, its mapping onto the
// app's fields, and the shared "Role attributes /100" calculation used by the
// player profile and the Comparison tab.
//
// The catalogue is a plain JSON file shipped with the app
// (data/fm27-role-catalogue.json). It can be replaced by a revised file with
// different role names or attribute lists: everything here is read from it, and
// anything it contains that the app can't map is reported, not guessed.
// Selections are stored by role id, which is unique per position AND phase, so
// a role with the same name in both phases stays two separate entries.

import { SELECTABLE } from './radar.js';
import { TENDENCY_KEYS, attributeDirection } from './attributes.js';
import { formatPositions } from './positions.js';

export const CATALOGUE_URL = 'data/fm27-role-catalogue.json';

export const PHASES = [
  { id: 'in_possession', label: 'In Possession' },
  { id: 'out_of_possession', label: 'Out of Possession' },
];
export const PHASE_IDS = PHASES.map((p) => p.id);

// ---- Mapping (one place for both views) -----------------------------------------------

/**
 * Catalogue position code → the app's familiarity key (the extract's
 * `positions` block, lower case). The catalogue uses STC for the striker;
 * ST is accepted as an alias.
 */
export const POSITION_CODE_MAP = {
  GK: 'gk', DC: 'dc', DL: 'dl', DR: 'dr', WBL: 'wbl', WBR: 'wbr', DM: 'dm',
  MC: 'mc', ML: 'ml', MR: 'mr', AMC: 'amc', AML: 'aml', AMR: 'amr', STC: 'stc', ST: 'stc',
};

/**
 * Catalogue attribute key → app attribute key, for names that differ. Keys not
 * listed are used as they are (e.g. one_on_ones, work_rate). Where the value
 * lives (attributes or personality) comes from the app's attribute list.
 */
export const ATTRIBUTE_KEY_ALIASES = {
  one_v_ones: 'one_on_ones',
  one_on_one: 'one_on_ones',
  workrate: 'work_rate',
  off_ball: 'off_the_ball',
  jumping: 'jumping_reach',
};

const appAttrKey = (catKey) => ATTRIBUTE_KEY_ALIASES[catKey] || catKey;

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
 * Normalise a raw catalogue into
 *   { version, status, source, schemaVersion, positions: [{ code, catCode, label, short, phases }],
 *     roles: Map(id → role), issues: [text] }
 * role = { id, name, phase, position (app code), attrs: [attrDef], description }
 * attrDef = { key, catKey, label, block, mapped, tendency, tier: 'key'|'supporting', weight }
 * Entries that can't be used are skipped and described in `issues`.
 */
export function normaliseCatalogue(raw) {
  const issues = [];
  const labels = raw && typeof raw.attribute_labels === 'object' ? raw.attribute_labels : {};
  const rules = raw && typeof raw.scoring_rules === 'object' && raw.scoring_rules ? raw.scoring_rules : {};
  const roles = new Map();
  const positions = [];
  const seenPos = new Set();

  const attrDef = (catKey, tier, weight) => {
    const key = appAttrKey(String(catKey));
    const app = SELECTABLE[key];
    if (!app) issues.push(`Attribute “${catKey}” isn’t one the app records.`);
    const rule = rules[catKey] || rules[key] || null;
    return {
      key, catKey: String(catKey), tier, weight,
      label: app ? app.label.replace(/\s*\(Tendency\)$/, '') : String(labels[catKey] || catKey),
      block: app ? app.source : 'attributes',
      mapped: !!app,
      tendency: TENDENCY_KEYS.has(key),
      rule: rule === 'higher_is_better' || rule === 'lower_is_better' ? rule : null,
    };
  };

  for (const pos of Array.isArray(raw?.positions) ? raw.positions : []) {
    const catCode = String(pos?.position_code || '').toUpperCase();
    const code = POSITION_CODE_MAP[catCode];
    if (!code) { issues.push(`Position “${pos?.position_code}” isn’t one the app knows.`); continue; }
    if (seenPos.has(code)) { issues.push(`Position ${catCode} appears twice; the first entry is used.`); continue; }
    seenPos.add(code);
    const phases = {};
    for (const phase of PHASE_IDS) {
      phases[phase] = [];
      for (const r of Array.isArray(pos[phase]) ? pos[phase] : []) {
        const id = typeof r?.id === 'string' ? r.id.trim() : '';
        const name = typeof r?.name === 'string' ? r.name.trim() : '';
        const key = Array.isArray(r?.key_attributes) ? r.key_attributes : [];
        const supporting = Array.isArray(r?.supporting_attributes) ? r.supporting_attributes : [];
        if (!id || !name || !key.length) { issues.push(`A ${catCode} ${phase.replace(/_/g, ' ')} role is missing its id, name or key attributes.`); continue; }
        if (roles.has(id)) { issues.push(`Role id “${id}” is used twice; the first entry is used.`); continue; }
        // Key attributes weigh 2 and supporting 1 when a supporting list exists; otherwise all equal.
        const kw = supporting.length ? 2 : 1;
        const attrs = [...new Set(key)].map((k) => attrDef(k, 'key', kw))
          .concat([...new Set(supporting)].filter((k) => !key.includes(k)).map((k) => attrDef(k, 'supporting', 1)));
        const description = typeof r?.description === 'string' ? r.description.trim() : '';
        const role = { id, name, phase, position: code, attrs, description };
        roles.set(id, role);
        phases[phase].push(role);
      }
    }
    positions.push({ code, catCode, label: String(pos.label || catCode), short: formatPositions([catCode === 'ST' ? 'STC' : catCode]), phases });
  }

  return {
    schemaVersion: raw?.schema_version ?? null,
    version: typeof raw?.catalogue_version === 'string' ? raw.catalogue_version : 'unknown',
    status: typeof raw?.status === 'string' ? raw.status : null,
    source: raw?.source && typeof raw.source === 'object' ? {
      publisher: raw.source.publisher || null, url: raw.source.url || null,
      retrieved: raw.source.retrieved_on || null, notes: raw.source.notes || null,
    } : null,
    positions,
    roles,
    issues: [...new Set(issues)],
  };
}

export const positionByCode = (cat, code) => cat.positions.find((p) => p.code === code) || null;
export const rolesFor = (cat, code, phase) => positionByCode(cat, code)?.phases[phase] || [];

/**
 * Check a saved { position, role } for one phase against the active catalogue.
 * An unknown position clears both; a role that isn't listed for that position
 * and phase is cleared and reported, so the UI can ask for another.
 * Returns { position, role, cleared: null | { reason } }.
 */
export function validateSelection(cat, phase, sel) {
  const position = sel?.position && positionByCode(cat, sel.position) ? sel.position : null;
  const roleOk = position && sel?.role && rolesFor(cat, position, phase).some((r) => r.id === sel.role);
  let cleared = null;
  if (sel?.position && !position) cleared = { reason: 'position' };
  else if (sel?.role && !roleOk) cleared = { reason: 'role', roleName: cat.roles.get(sel.role)?.name || null };
  return { position, role: roleOk ? sel.role : null, cleared };
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
 * Whether an attribute counts towards the score: tendencies and other
 * context-dependent values only count when the catalogue gives a scoring rule.
 */
export function isScored(a) {
  if (a.rule) return true;
  if (a.tendency) return false;
  return a.mapped ? attributeDirection(a.key) !== 'neutral' : true;
}

/**
 * SquadLab role attribute score (0–100), shared by the profile and Comparison.
 * Weighted mean of the scored attributes (all equal for this catalogue; key 2 /
 * supporting 1 when a supporting list exists), multiplied by 5 so 20 → 100.
 * Lower-is-better values are flipped (21 − v). Full precision is kept; round
 * only for display. Any missing scored value makes the score unavailable.
 * Returns { value|null, parts: [{ attr, value, used, weight, reason }], excluded, missing, mean }.
 */
export function roleScore(role, p) {
  const parts = role.attrs.map((a) => {
    const value = roleValue(p, a);
    const used = isScored(a);
    const lower = a.rule === 'lower_is_better' || (!a.rule && a.mapped && attributeDirection(a.key) === 'negative');
    return { attr: a, value, used, weight: a.weight, scoreValue: value === null ? null : (lower ? 21 - value : value), reason: used ? null : 'tendency' };
  });
  const scored = parts.filter((x) => x.used);
  const missing = scored.filter((x) => x.scoreValue === null).map((x) => x.attr.label);
  const excluded = parts.filter((x) => !x.used).map((x) => x.attr.label);
  let value = null, mean = null;
  if (scored.length && !missing.length) {
    const wsum = scored.reduce((s, x) => s + x.weight, 0);
    mean = scored.reduce((s, x) => s + x.scoreValue * x.weight, 0) / wsum;
    value = mean * 5;
  }
  return { value, mean, parts, excluded, missing };
}

/** Display: one decimal, without a trailing ".0" (80, 81.7). */
export const fmtScore = (v) => (v === null || v === undefined ? '—' : String(Math.round(v * 10) / 10));

/** Short text for the score breakdown. */
export function scoreBreakdown(s) {
  const used = s.parts.filter((x) => x.used);
  const weighted = used.some((x) => x.weight !== used[0].weight);
  const lines = [];
  if (s.value !== null) {
    const items = used.map((x) => `${x.attr.label} ${x.value}${x.scoreValue !== x.value ? ` (counts as ${x.scoreValue})` : ''}${weighted ? ` ×${x.weight}` : ''}`).join(', ');
    lines.push(`${weighted ? 'Weighted mean' : 'Mean'} of ${items} = ${Math.round(s.mean * 100) / 100} × 5 = ${fmtScore(s.value)}/100`);
  } else if (s.missing.length) {
    lines.push(`Unavailable: no recorded value for ${s.missing.join(', ')}.`);
  } else {
    lines.push('Unavailable: this role has no scored attributes.');
  }
  if (s.excluded.length) lines.push(`${s.excluded.join(', ')} ${s.excluded.length === 1 ? 'is a tendency' : 'are tendencies'}: shown, but not scored.`);
  return lines;
}
