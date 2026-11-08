// Radar definitions and calculations — separate from chart rendering.
//
// The overviews are SquadLab's own calculations (agreed weights below), not
// FM's polygon or role ratings, and not an overall player rating.
// Values stay on the attributes' own 1–20 scale; full precision is kept for
// plotting and rounded to one decimal only for display.

import {
  ATTRIBUTE_GROUPS, HIDDEN_ATTRS, PERSONALITY_ATTRS, VALUE_DIRECTION, ATTR_BY_KEY,
  TENDENCY_KEYS, attributeDirection,
} from './attributes.js';

export const RADAR_SCALE = { min: 1, max: 20, rings: [5, 10, 15, 20] };

const label = (key) => ATTR_BY_KEY[key]?.label ?? key;
/** Equal weights as exact fractions (an arithmetic mean). */
const mean = (...keys) => keys.map((key) => ({ key, weight: 1 / keys.length }));
const weighted = (...pairs) => pairs.map(([key, weight]) => ({ key, weight }));

/** Outfield overview — fixed clockwise axis order. */
export const OUTFIELD_OVERVIEW = [
  { id: 'defending', label: 'Defending', kind: 'weighted', inputs: weighted(['tackling', 0.5], ['marking', 0.25], ['positioning', 0.25]) },
  { id: 'physical', label: 'Physical', kind: 'mean', inputs: mean('strength', 'stamina', 'balance', 'agility') },
  { id: 'speed', label: 'Speed', kind: 'mean', inputs: mean('acceleration', 'pace') },
  { id: 'vision', label: 'Vision', kind: 'mean', inputs: mean('vision', 'flair', 'passing') },
  { id: 'attacking', label: 'Attacking', kind: 'mean', inputs: mean('finishing', 'off_the_ball', 'composure') },
  { id: 'technique', label: 'Technique', kind: 'mean', inputs: mean('technique', 'first_touch', 'dribbling') },
  { id: 'aerial', label: 'Aerial', kind: 'mean', inputs: mean('heading', 'jumping_reach') },
  { id: 'mental', label: 'Mental', kind: 'mean', inputs: mean('determination', 'decisions', 'anticipation', 'teamwork', 'bravery', 'concentration') },
];

/** Goalkeeper overview — fixed clockwise axis order. Eccentricity is deliberately excluded (a tendency). */
export const GOALKEEPER_OVERVIEW = [
  { id: 'shot_stopping', label: 'Shot Stopping', kind: 'mean', inputs: mean('reflexes', 'one_on_ones') },
  { id: 'aerial', label: 'Aerial', kind: 'mean', inputs: mean('handling', 'aerial_reach') },
  { id: 'communication', label: 'Communication', kind: 'mean', inputs: mean('communication', 'command_of_area') },
  { id: 'distribution', label: 'Distribution', kind: 'mean', inputs: mean('throwing', 'kicking') },
  { id: 'mental', label: 'Mental', kind: 'mean', inputs: mean('anticipation', 'bravery', 'concentration', 'decisions', 'determination', 'teamwork') },
  { id: 'positioning', label: 'Positioning', kind: 'single', inputs: [{ key: 'positioning', weight: 1 }] },
  { id: 'physical', label: 'Physical', kind: 'mean', inputs: mean('balance', 'agility', 'strength', 'stamina') },
  { id: 'speed', label: 'Speed', kind: 'mean', inputs: mean('acceleration', 'pace') },
];

/** Natural goalkeepers (from the extractor's natural_positions) use the GK overview. */
export function isNaturalGoalkeeper(p) {
  return (Array.isArray(p.natural_positions) ? p.natural_positions : []).some((c) => String(c).toUpperCase() === 'GK');
}

export const overviewFor = (p) => (isNaturalGoalkeeper(p)
  ? { id: 'goalkeeper', title: 'Goalkeeper overview', axes: GOALKEEPER_OVERVIEW }
  : { id: 'outfield', title: 'Outfield overview', axes: OUTFIELD_OVERVIEW });

const valid = (v) => Number.isInteger(v) && v >= RADAR_SCALE.min && v <= RADAR_SCALE.max;
const fmt1 = (v) => v.toFixed(1);

/**
 * Compute one overview axis. If any input is missing or out of range the
 * axis is unavailable (no zero, no re-weighting).
 * Returns { id, label, value|null, inputs: [{key,label,value,weight}], missing: [labels], formula }.
 */
export function computeAxis(axis, p) {
  const inputs = axis.inputs.map((i) => ({ ...i, label: label(i.key), value: p.attributes?.[i.key] ?? null }));
  const missing = inputs.filter((i) => !valid(i.value)).map((i) => i.label);
  let value = null;
  if (!missing.length) value = inputs.reduce((sum, i) => sum + i.value * i.weight, 0);
  return { id: axis.id, label: axis.label, value, inputs, missing, formula: formulaText(axis, inputs, value), direction: 'positive' };
}

function formulaText(axis, inputs, value) {
  const v = (i) => (valid(i.value) ? i.value : '—');
  const result = value === null ? 'unavailable' : fmt1(value);
  if (axis.kind === 'single') return `${inputs[0].label} ${v(inputs[0])} = ${result}`;
  if (axis.kind === 'weighted') {
    return `${inputs.map((i) => `${i.label} ${v(i)} × ${i.weight.toFixed(2)}`).join(' + ')} = ${result}`;
  }
  return `(${inputs.map((i) => `${i.label} ${v(i)}`).join(' + ')}) ÷ ${inputs.length} = ${result}`;
}

/** Definition text (no values) for the information sheet. */
export function definitionText(axis) {
  if (axis.kind === 'single') return label(axis.inputs[0].key);
  if (axis.kind === 'weighted') return axis.inputs.map((i) => `${label(i.key)} × ${i.weight.toFixed(2)}`).join(' + ');
  return `Mean of ${axis.inputs.map((i) => label(i.key)).join(', ')}`;
}

export const computeOverview = (p) => {
  const o = overviewFor(p);
  return { ...o, axes: o.axes.map((a) => computeAxis(a, p)) };
};

// ---- Selected attributes ------------------------------------------------------
// Everything the app shows on a 1–20 scale. CA/PA are excluded (1–200).

export const MIN_SELECTED = 3;
export const MAX_SELECTED = 8;

const TENDENCIES = TENDENCY_KEYS;

export const SELECTABLE_GROUPS = [
  ...ATTRIBUTE_GROUPS.map((g) => ({ key: g.key, label: g.label, source: 'attributes', attrs: g.attrs })),
  { key: 'hidden', label: 'Hidden', source: 'attributes', attrs: HIDDEN_ATTRS },
  { key: 'personality', label: 'Personality', source: 'personality', attrs: PERSONALITY_ATTRS },
];
export const SELECTABLE = Object.fromEntries(SELECTABLE_GROUPS.flatMap((g) => g.attrs.map((a) => [a.key, { ...a, group: g.key, groupLabel: g.label, source: g.source }])));

/**
 * Colour direction for a selectable attribute: tendencies are neutral;
 * hidden/personality values follow VALUE_DIRECTION (unlisted = neutral);
 * normal football attributes are positive.
 */
export const directionFor = attributeDirection;

/** Caution text for attributes where higher isn't simply better, else null. */
export function interpretationNote(key) {
  if (TENDENCIES.has(key)) return 'Tendency — higher isn’t necessarily better.';
  const dir = VALUE_DIRECTION[key];
  if (dir === 'negative') return 'Higher is worse for this attribute.';
  if (dir === 'neutral') return 'Context-dependent — higher isn’t necessarily better.';
  return null;
}

/** Plot actual individual values, in selection order. */
export function computeSelected(p, keys) {
  return keys.filter((k) => SELECTABLE[k]).map((k) => {
    const def = SELECTABLE[k];
    const raw = def.source === 'personality' ? p.personality?.[k] : p.attributes?.[k];
    const value = valid(raw) ? raw : null;
    return { id: k, label: def.label, value, missing: value === null ? [def.label] : [], note: interpretationNote(k), group: def.groupLabel, direction: directionFor(k) };
  });
}

// ---- Position/role profiles ------------------------------------------------------
// Role definitions come from the bundled role catalogue (see roles.js). Each
// phase stores its own { position (app code), role (catalogue role id) };
// selections are checked against the active catalogue when they are used.
export const ROLE_PHASES = [
  { id: 'in_possession', label: 'In Possession' },
  { id: 'out_of_possession', label: 'Out of Possession' },
];

// ---- Per-player preferences ---------------------------------------------------------
// Stored per career (settings key "radar:<careerId>"), keyed by player key.

export const emptyRadarPrefs = () => ({ players: {} });

/** One phase's saved role selection (shape only; catalogue validity is checked on use). */
export const sanitizeRoleSel = (r) => ({
  position: typeof r?.position === 'string' && r.position ? r.position : null,
  role: typeof r?.role === 'string' && r.role ? r.role : null,
});

/**
 * Last role per position and phase: { [position]: { in_possession, out_of_possession } }
 * (role ids, checked against the catalogue when used). `legacy` is the older
 * one-{ position, role }-per-phase shape, whose choices are carried over.
 */
export function sanitizeRoleMemory(byPos, legacy) {
  const str = (x) => (typeof x === 'string' && x ? x : null);
  const out = {};
  const add = (pos, phase, role) => {
    if (!str(pos) || !str(role) || !ROLE_PHASES.some((ph) => ph.id === phase)) return;
    (out[pos] ||= {})[phase] = role;
  };
  if (byPos && typeof byPos === 'object') {
    for (const [pos, byPhase] of Object.entries(byPos)) for (const ph of ROLE_PHASES) add(pos, ph.id, byPhase?.[ph.id]);
  }
  for (const ph of ROLE_PHASES) {
    const r = sanitizeRoleSel(legacy?.[ph.id]);
    if (r.position && r.role && !out[r.position]?.[ph.id]) add(r.position, ph.id, r.role);
  }
  return out;
}

export function sanitizeRadarPrefs(raw) {
  const out = emptyRadarPrefs();
  if (!raw || typeof raw !== 'object' || typeof raw.players !== 'object') return out;
  for (const [key, v] of Object.entries(raw.players)) {
    if (!v || typeof v !== 'object') continue;
    const attrs = [...new Set((Array.isArray(v.selected) ? v.selected : []).filter((k) => SELECTABLE[k]))].slice(0, MAX_SELECTED);
    // Role explorer (profile): last role per position and phase, the selected
    // position and the phase whose details are shown. Role ids are checked
    // against the active catalogue when used.
    const str = (x) => (typeof x === 'string' && x ? x : null);
    const roleByPos = sanitizeRoleMemory(v.roleByPos, v.roles);
    out.players[key] = {
      selected: attrs, roleByPos,
      rolePos: str(v.rolePos),
      roleTab: ROLE_PHASES.some((ph) => ph.id === v.roleTab) ? v.roleTab : ROLE_PHASES[0].id,
    };
  }
  return out;
}

export const playerRadarPrefs = (prefs, key) => prefs.players[key] || {
  selected: [], roleByPos: {}, rolePos: null, roleTab: ROLE_PHASES[0].id,
};
