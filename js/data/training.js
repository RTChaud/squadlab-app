// Individual training recommendations (Development screen).
//
// Configuration: data/individual_training.json — everything about the
// training focuses (ids, labels, applicability, trained attributes, how many
// there are, their order) comes from that file. Nothing here or in the UI
// names a focus. To revise the list, replace the file (see README).
//
// File shape (schema_version 1):
//   { schema_version: 1, data_version: "…", provisional?, notes?, sources?,
//     training_focuses: [ { id, label, applies_to: "all"|"outfield"|"goalkeeper",
//                           trained_attributes: [canonical attribute id] } ] }
// schema_version is the file FORMAT; data_version identifies the mapping
// revision (change it whenever focuses or attributes change). Optional
// metadata (provisional, notes, sources, any other field) is ignored by the
// calculation.
//
// Validation: an unsupported schema or a missing focus list makes the whole
// file unusable (`error`). A focus with a bad id/label/applicability, or with
// an attribute id the app doesn't record, is left out of the recommendations
// and described in `issues` (also logged to the console) — never partially
// used and never scored as zero.
//
// Recommendation (advisory only):
//   1. The selected roles' key attributes, combined into one set (shared
//      attributes once, equal weight).
//   2. Baseline = mean of that set (every value must be recorded).
//   3. Each applicable focus: +1 to every attribute it trains, capped at 20;
//      only attributes in the set count.
//   4. Rank by simulated increase ↓, then mean of the relevant attributes that
//      can still improve ↑, then their lowest value ↑, then label (A–Z), then id.
//   5. Focuses with no increase are dropped; the top MAX_RECOMMENDATIONS shown.

import { FOOTBALL_ATTRS, ATTR_BY_KEY } from './attributes.js';
import { keyAttrs, roleValue } from './roles.js';

export const TRAINING_URL = 'data/individual_training.json';
export const SUPPORTED_SCHEMA_VERSIONS = [1];
export const APPLIES_TO = ['all', 'outfield', 'goalkeeper'];
export const MAX_RECOMMENDATIONS = 5;
export const ATTR_MAX = 20;

// ---- Attribute adapter (the only place canonical ids meet the app's ids) ----------------

/**
 * Canonical training-attribute id → the app's attribute key, for ids that
 * differ from the extract's field names. Ids not listed here are used as-is
 * when the app records a football attribute with that key (they currently
 * all match, so this is empty).
 */
export const CANONICAL_ATTRIBUTE_ALIASES = {};

/** The app's attribute key for a canonical id, or null if the app doesn't record it. */
export function appAttributeKey(canonicalId) {
  if (typeof canonicalId !== 'string') return null;
  const id = canonicalId.trim();
  const key = Object.prototype.hasOwnProperty.call(CANONICAL_ATTRIBUTE_ALIASES, id) ? CANONICAL_ATTRIBUTE_ALIASES[id] : id;
  return ATTR_BY_KEY[key] ? key : null;
}

const ATTR_ORDER = new Map(FOOTBALL_ATTRS.map((a, i) => [a.key, i]));

// ---- Loading & validation -----------------------------------------------------------------

/**
 * Validate a raw configuration. Returns
 *   { schemaVersion, dataVersion, focuses: [{ id, label, appliesTo, attrs: [appKey] }], byId: Map, issues: [text], error: text|null }
 */
export function normaliseTraining(raw) {
  const issues = [];
  const empty = (error) => ({ schemaVersion: null, dataVersion: null, focuses: [], byId: new Map(), issues, error });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty('The training configuration is not a JSON object.');
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(raw.schema_version)) {
    return empty(`Training configuration schema_version ${JSON.stringify(raw.schema_version ?? null)} isn’t supported (expected ${SUPPORTED_SCHEMA_VERSIONS.join(' or ')}).`);
  }
  if (!Array.isArray(raw.training_focuses)) return empty('The training configuration has no training_focuses list.');
  const dataVersion = typeof raw.data_version === 'string' && raw.data_version.trim() ? raw.data_version.trim() : null;
  if (!dataVersion) issues.push('data_version is missing.');

  const focuses = [];
  const byId = new Map();
  raw.training_focuses.forEach((f, i) => {
    const where = `training_focuses[${i}]${typeof f?.id === 'string' ? ` “${f.id}”` : ''}`;
    const id = typeof f?.id === 'string' ? f.id.trim() : '';
    const label = typeof f?.label === 'string' ? f.label.trim() : '';
    if (!id) { issues.push(`${where}: missing id; focus ignored.`); return; }
    if (byId.has(id)) { issues.push(`${where}: duplicate id; only the first is used.`); return; }
    if (!label) { issues.push(`${where}: missing label; focus ignored.`); return; }
    if (!APPLIES_TO.includes(f.applies_to)) { issues.push(`${where}: applies_to ${JSON.stringify(f.applies_to ?? null)} must be one of ${APPLIES_TO.join(', ')}; focus ignored.`); return; }
    const list = Array.isArray(f.trained_attributes) ? f.trained_attributes : null;
    if (!list || !list.length) { issues.push(`${where}: no trained_attributes; focus ignored.`); return; }
    const unknown = list.filter((a) => !appAttributeKey(a));
    if (unknown.length) {
      issues.push(`${where}: unknown attribute id${unknown.length === 1 ? '' : 's'} ${unknown.map((a) => JSON.stringify(a)).join(', ')}; focus ignored.`);
      return;
    }
    const attrs = [...new Set(list.map(appAttributeKey))];
    if (attrs.length !== list.length) issues.push(`${where}: an attribute is listed twice; it counts once.`);
    const focus = { id, label, appliesTo: f.applies_to, attrs };
    focuses.push(focus);
    byId.set(id, focus);
  });
  return { schemaVersion: raw.schema_version, dataVersion, focuses, byId, issues, error: null };
}

let loading = null;
let active = null;

function report(cfg) {
  if (cfg.error) console.warn(`[SquadLab training] ${cfg.error}`);
  cfg.issues.forEach((t) => console.warn(`[SquadLab training] ${t}`));
}

/** Load (once) and validate the bundled configuration. Resolves the config (with `error` if unusable). */
export function loadTraining() {
  if (active) return Promise.resolve(active);
  if (!loading) {
    loading = fetch(TRAINING_URL, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((raw) => { active = normaliseTraining(raw); report(active); return active; })
      .catch((e) => {
        loading = null;
        const cfg = { ...normaliseTraining(null), error: `Training configuration could not be loaded (${e.message}).` };
        report(cfg);
        return cfg;
      });
  }
  return loading;
}

/** For tests: use this raw configuration instead of the bundled file. */
export function useTraining(raw) {
  active = normaliseTraining(raw);
  loading = Promise.resolve(active);
  report(active);
  return active;
}

/** A saved focus reference, by id (null when that focus is no longer in the configuration). */
export const focusById = (cfg, id) => cfg?.byId?.get(id) || null;

/** Whether a focus applies in a goalkeeper or outfield context. */
export function focusApplies(focus, isGoalkeeper) {
  if (focus.appliesTo === 'all') return true;
  return focus.appliesTo === (isGoalkeeper ? 'goalkeeper' : 'outfield');
}

// ---- Recommendations ------------------------------------------------------------------------

/**
 * @param cfg     normalised configuration
 * @param p       player record (current values)
 * @param o       { position: app position code, roles: [catalogue role | null, …] }
 * Returns one of
 *   { status: 'no-role' }
 *   { status: 'missing', missing: [label] }      a key attribute has no recorded value
 *   { status: 'ok', baseline, keyCount, items: [{ focus, attrs: [{ key, label, value, atMax }], rank: {…} }] }
 * Items hold the top MAX_RECOMMENDATIONS; `rank` is for checks only, never shown.
 */
export function recommendTraining(cfg, p, { position, roles }) {
  const chosen = (roles || []).filter(Boolean);
  if (!chosen.length) return { status: 'no-role' };

  // 1. Unique key-attribute set across both roles (equal weight).
  const set = new Map();
  for (const r of chosen) for (const a of keyAttrs(r)) if (!set.has(a.key)) set.set(a.key, a);
  const values = new Map();
  const missing = [];
  for (const [key, a] of set) {
    const v = roleValue(p, a);
    if (v === null) missing.push(a.label); else values.set(key, v);
  }
  if (missing.length) return { status: 'missing', missing };

  // 2. Baseline (kept for checks; not displayed).
  const n = set.size;
  const sum = [...values.values()].reduce((s, v) => s + v, 0);
  const baseline = sum / n;

  // 3–4. Simulate each applicable focus.
  const isGk = position === 'gk';
  const scored = [];
  for (const focus of cfg.focuses) {
    if (!focusApplies(focus, isGk)) continue;
    const relevant = focus.attrs.filter((k) => values.has(k));
    const improvable = relevant.filter((k) => values.get(k) < ATTR_MAX);
    // Integer points gained across the set (each +1, capped at 20); the grade rises by points / n.
    const points = improvable.length;
    if (!points) continue;
    const imp = improvable.map((k) => values.get(k));
    scored.push({
      focus,
      attrs: relevant
        .map((k) => ({ key: k, label: ATTR_BY_KEY[k].label, value: values.get(k), atMax: values.get(k) >= ATTR_MAX }))
        .sort((a, b) => a.value - b.value || ATTR_ORDER.get(a.key) - ATTR_ORDER.get(b.key)),
      rank: {
        points,
        increase: (sum + points) / n - baseline,
        meanImprovable: imp.reduce((s, v) => s + v, 0) / imp.length,
        minImprovable: Math.min(...imp),
      },
    });
  }
  scored.sort((a, b) => b.rank.points - a.rank.points
    || a.rank.meanImprovable - b.rank.meanImprovable
    || a.rank.minImprovable - b.rank.minImprovable
    || a.focus.label.localeCompare(b.focus.label)
    || (a.focus.id < b.focus.id ? -1 : a.focus.id > b.focus.id ? 1 : 0));
  return { status: 'ok', baseline, keyCount: n, items: scored.slice(0, MAX_RECOMMENDATIONS) };
}
