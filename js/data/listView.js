// Shared logic for the Squad and Shortlists player tables: columns, filters,
// search, sorting, development changes and saved-view configurations.
// No DOM here — the UI lives in ui/components/playerBrowser.js and friends.
//
// A "config" is everything a saved view stores:
//   { filters, columns: [columnId], sort: { key, dir }, baseline: 'first' | 'YYYY-MM-DD' }
// The temporary name search and scroll positions are never part of it.

import { ATTRIBUTE_GROUPS, HIDDEN_ATTRS, PERSONALITY_ATTRS, attributeDirection, intOrNull } from './attributes.js';
import { describePositions, formatPositions, PITCH_CODES } from './positions.js';
import { SLOT_IDS, DEFAULT_LINEUPS, hierarchyRank } from './lineups.js';
import { profileNameOf, searchTextOf, persistentId, normalizeSearch } from './players.js';
import { describeChange } from './changes.js';
import { formatGameDate } from './snapshot.js';
import { contractDetails, clausesOf, clauseValue, clauseStatus, addMonths, CLAUSE_TYPES } from './contract.js';
import { formatMoney, toPence, parseMoney } from './money.js';

// ---- Attributes available to columns and conditions ---------------------------------

/** FM-style short headings so attribute columns stay narrow. */
const SHORT = {
  corners: 'Cor', crossing: 'Cro', dribbling: 'Dri', finishing: 'Fin', first_touch: 'Fir', free_kick_taking: 'Fre',
  heading: 'Hea', long_shots: 'Lon', long_throws: 'LTh', marking: 'Mar', passing: 'Pas', penalty_taking: 'Pen',
  tackling: 'Tck', technique: 'Tec',
  aggression: 'Agg', anticipation: 'Ant', bravery: 'Bra', composure: 'Cmp', concentration: 'Cnt', decisions: 'Dec',
  determination: 'Det', flair: 'Fla', leadership: 'Ldr', off_the_ball: 'OtB', positioning: 'Pos', teamwork: 'Tea',
  vision: 'Vis', work_rate: 'Wor',
  acceleration: 'Acc', agility: 'Agi', balance: 'Bal', jumping_reach: 'Jum', natural_fitness: 'Nat', pace: 'Pac',
  stamina: 'Sta', strength: 'Str',
  aerial_reach: 'Aer', command_of_area: 'Cmd', communication: 'Com', eccentricity: 'Ecc', handling: 'Han',
  kicking: 'Kic', one_on_ones: '1v1', punching: 'Pun', reflexes: 'Ref', rushing_out: 'TRO', throwing: 'Thr',
  consistency: 'Cons', dirtiness: 'Dirt', important_matches: 'ImpM', injury_proneness: 'InjP', versatility: 'Vers',
  adaptability: 'Adap', ambition: 'Amb', controversy: 'Cont', loyalty: 'Loy', pressure: 'Pres',
  professionalism: 'Prof', sportsmanship: 'Spor', temperament: 'Temp',
};

export const ATTR_SCALE = { min: 1, max: 20 };

/** Technical, mental, physical, goalkeeping, hidden and personality — grouped. */
export const ATTRIBUTE_CHOICES = [
  ...ATTRIBUTE_GROUPS.map((g) => ({ key: g.key, label: g.label, source: 'attributes', attrs: g.attrs })),
  { key: 'hidden', label: 'Hidden', source: 'attributes', attrs: HIDDEN_ATTRS },
  { key: 'personality', label: 'Personality', source: 'personality', attrs: PERSONALITY_ATTRS },
].map((g) => ({ ...g, attrs: g.attrs.map((a) => ({ key: a.key, label: a.label.replace(/\s*\(Tendency\)$/, ''), fullLabel: a.label, short: SHORT[a.key] || a.label.slice(0, 3), group: g.key, groupLabel: g.label, source: g.source })) }));
export const ATTR_CHOICE = Object.fromEntries(ATTRIBUTE_CHOICES.flatMap((g) => g.attrs.map((a) => [a.key, a])));

const validAttrValue = (v) => Number.isInteger(v) && v >= ATTR_SCALE.min && v <= ATTR_SCALE.max;

/** Stored value of an attribute, or null (missing / out of range — never 0). */
export function attrValue(p, key) {
  const def = ATTR_CHOICE[key];
  if (!def) return null;
  const v = def.source === 'personality' ? p.personality?.[key] : p.attributes?.[key];
  return validAttrValue(v) ? v : null;
}

// ---- Columns ---------------------------------------------------------------------------
// Widths in rem (Name is flexible with a minimum). Column ids:
//   fixed ids below, "a:<attr>" = attribute value, "d:ca" / "d:<attr>" = change.

export const NAME_MIN_REM = 4.8;   // default columns still fit a 390pt iPhone
export const NAME_WIDE_REM = 7.4;  // used once the other columns exceed NAME_FIT_REM (table scrolls)
export const NAME_FIT_REM = 15;

const BASE_COLUMNS = [
  { id: 'xi', label: 'Squad slot (XI)', head: 'XI', width: 2.5, dir: 'asc', group: 'info' },
  { id: 'name', label: 'Name', head: 'Name', width: null, dir: 'asc', group: 'info', locked: true },
  { id: 'pos', label: 'Position', head: 'Pos', width: 4.8, dir: 'asc', group: 'info' },
  { id: 'age', label: 'Age', head: 'Age', width: 2.1, dir: 'asc', group: 'info', num: true },
  { id: 'ca', label: 'CA', head: 'CA', width: 2.4, dir: 'desc', group: 'info', num: true },
  { id: 'pa', label: 'PA', head: 'PA', width: 2.4, dir: 'desc', group: 'info', num: true },
  { id: 'squad', label: 'Squad', head: 'Squad', width: 4.4, dir: 'asc', group: 'info' },
  { id: 'club', label: 'Club', head: 'Club', width: 6.6, dir: 'asc', group: 'info' },
  { id: 'nat', label: 'Nationality', head: 'Nat', width: 3.4, dir: 'asc', group: 'info' },
  { id: 'foot', label: 'Preferred foot', head: 'Foot', width: 3.3, dir: 'asc', group: 'info' },
  { id: 'd:ca', label: 'CA change', head: '±CA', width: 2.9, dir: 'desc', group: 'dev', num: true, dev: true },
];
// Contract & transfer (optional; values from the same player snapshot as the row).
export const CONTRACT_COLUMNS = [
  { id: 'c:expiry', label: 'Contract expiry', head: 'Expiry', width: 5.7, dir: 'asc', group: 'contract', num: true, ct: 'expiry' },
  { id: 'c:salary', label: 'Monthly salary', head: 'Salary/m', width: 7, dir: 'desc', group: 'contract', num: true, ct: 'salary' },
  { id: 'c:value', label: 'Transfer value', head: 'Value', width: 7.4, dir: 'desc', group: 'contract', num: true, ct: 'value' },
  { id: 'c:release', label: 'Release clause', head: 'Release', width: 7.4, dir: 'desc', group: 'contract', num: true, ct: 'release' },
  { id: 'c:foreign', label: 'Foreign-club release clause', head: 'Foreign', width: 7.4, dir: 'desc', group: 'contract', num: true, ct: 'foreign' },
  { id: 'c:champions', label: 'Champions League clubs release clause', head: 'UCL clubs', width: 7.4, dir: 'desc', group: 'contract', num: true, ct: 'champions' },
  { id: 'c:relegation', label: 'Relegation release clause', head: 'Relegation', width: 7.4, dir: 'desc', group: 'contract', num: true, ct: 'relegation' },
];
const BASE_BY_ID = Object.fromEntries([...BASE_COLUMNS, ...CONTRACT_COLUMNS].map((c) => [c.id, c]));
export const INFO_COLUMNS = BASE_COLUMNS.filter((c) => c.group === 'info');

/** Definition for any column id, or null if unknown. */
export function columnDef(id) {
  if (BASE_BY_ID[id]) return BASE_BY_ID[id];
  const m = /^(a|d):(.+)$/.exec(id || '');
  const attr = m && ATTR_CHOICE[m[2]];
  if (!attr) return null;
  return m[1] === 'a'
    ? { id, label: attr.label, head: attr.short, width: 2.6, dir: 'desc', group: 'attr', num: true, attr: attr.key }
    : { id, label: `${attr.label} change`, head: `±${attr.short}`, width: 3, dir: 'desc', group: 'dev', num: true, dev: true, attr: attr.key };
}

export const DEFAULT_COLUMNS = {
  squad: ['xi', 'name', 'pos', 'age', 'ca', 'pa'],
  shortlists: ['name', 'pos', 'age', 'ca', 'pa'],
  tags: ['name', 'pos', 'age', 'ca', 'pa'],
};
export const SECTIONS = Object.keys(DEFAULT_COLUMNS);

// ---- Filters ---------------------------------------------------------------------------

export const POSITION_CHOICES = PITCH_CODES.map((code) => ({ code, label: formatPositions([code]) }));
export const FOOT_CHOICES = ['Left', 'Right', 'Both'];
export const TIER_CHOICES = DEFAULT_LINEUPS.map((l) => ({ tier: l.tier, label: l.name, short: l.name.replace(/\s*XI$/, '') }));
export const SLOT_CHOICES = SLOT_IDS;
export const OPERATORS = [
  { id: 'gte', label: 'at least', symbol: '≥' },
  { id: 'lte', label: 'at most', symbol: '≤' },
  { id: 'eq', label: 'equal to', symbol: '=' },
];
const OP_BY_ID = Object.fromEntries(OPERATORS.map((o) => [o.id, o]));
export const RANGES = {
  age: { label: 'Age', min: 14, max: 50 },
  ca: { label: 'CA', min: 1, max: 200 },
  pa: { label: 'PA', min: 1, max: 200 },
};
export const DEFAULT_MIN_FAM = 15;

// Contract & transfer filters:
//   expiry: null | 6 | 12 | 18 (months from the row's snapshot date, both ends inclusive)
//   salary / tvalue: [min | null, max | null] in GBP (monthly salary, transfer value)
//   clause: null | { type: 'any' | 'standard' | 'foreign' | 'champions' | 'relegation', max: GBP | null, status: 'any' | 'active' }
//   ('any' looks across every decoded clause of the three types)
export const EXPIRY_CHOICES = [6, 12, 18];
export const MONEY_RANGES = {
  salary: { label: 'Monthly salary', chip: 'Salary' },
  tvalue: { label: 'Transfer value', chip: 'Value' },
};
export { CLAUSE_TYPES };
export const CLAUSE_FILTERS = [{ id: 'any', label: 'Any' }, ...CLAUSE_TYPES];
const clausesFor = (p, type) => (type === 'any'
  ? [...new Set(CLAUSE_TYPES.flatMap((t) => clausesOf(p, t.id)))]
  : clausesOf(p, type));
const MONEY_MAX = 1e13;
const moneyOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MONEY_MAX ? toPence(v) : null);

export const emptyFilters = () => ({
  positions: [], minFam: DEFAULT_MIN_FAM,
  age: [null, null], ca: [null, null], pa: [null, null],
  feet: [], tags: [], tagMode: 'any',
  tiers: [], slots: [], unassigned: false,
  attrs: [],
  roles: null,
  expiry: null, salary: [null, null], tvalue: [null, null], clause: null,
  nations: [],
});

const collator = new Intl.Collator('en-GB', { sensitivity: 'base', numeric: true });
const intIn = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null);
const uniq = (arr) => [...new Set(arr)];

// ---- Role filter ------------------------------------------------------------------------
// Only with exactly one position selected. Stored with the filters (so saved views keep it):
//   roles: null | { position, in_possession: { id, name } | null, out_of_possession: { id, name } | null,
//                   conds: [{ key, op: 'gte' | 'lte' | null, value: 1–20 | null, tendency }] }
// conds are the selected roles' key attributes (one per attribute, shared across phases).
// Ordinary attributes always carry a threshold; a tendency stays unset (not applied) until
// a minimum or maximum is chosen.

export const ROLE_DEFAULT_MIN = 15;
export const ROLE_OPERATORS = OPERATORS.filter((o) => o.id !== 'eq');
export const roleCondActive = (c) => !!c.op && c.value !== null;

function sanitizeRoleFilter(raw, positions) {
  if (!raw || typeof raw !== 'object' || positions.length !== 1 || raw.position !== positions[0]) return null;
  const pos = positions[0];
  const role = (r, phase) => (r && typeof r.id === 'string' && r.id.startsWith(`${pos}:${phase}:`)
    ? { id: r.id, name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : r.id } : null);
  const ip = role(raw.in_possession, 'in_possession');
  const oop = role(raw.out_of_possession, 'out_of_possession');
  if (!ip && !oop) return null;
  const seen = new Set();
  const conds = (Array.isArray(raw.conds) ? raw.conds : []).map((c) => {
    if (!c || !ATTR_CHOICE[c.key] || seen.has(c.key)) return null;
    const tendency = c.tendency === true;
    const set = ROLE_OPERATORS.some((o) => o.id === c.op) && validAttrValue(c.value);
    if (!tendency && !set) return null;
    seen.add(c.key);
    return { key: c.key, op: set ? c.op : null, value: set ? c.value : null, tendency };
  }).filter(Boolean);
  return { position: pos, in_possession: ip, out_of_possession: oop, conds };
}

// ---- Tactic → filters ---------------------------------------------------------------------
// The Tactic screen's search, as ordinary filters (so its count and the Shortlists
// results use the same matching): familiarity ≥ 16 at the position, and each key
// attribute of the chosen role(s) ≥ 15 — once per attribute even when both phases
// list it. Tendencies are listed but left unset, as in the Filters sheet.
export const TACTIC_MIN_FAM = 16;

/** @param roles { in_possession: role | null, out_of_possession: role | null } (catalogue roles) */
export function tacticFilters(position, roles) {
  const conds = [];
  const seen = new Set();
  for (const phase of ['in_possession', 'out_of_possession']) {
    for (const a of (roles[phase]?.attrs || []).filter((x) => x.tier === 'key')) {
      if (!a.mapped || !ATTR_CHOICE[a.key] || seen.has(a.key)) continue;
      seen.add(a.key);
      conds.push(a.tendency ? { key: a.key, op: null, value: null, tendency: true } : { key: a.key, op: 'gte', value: ROLE_DEFAULT_MIN, tendency: false });
    }
  }
  const pick = (r) => (r ? { id: r.id, name: r.name } : null);
  return sanitizeFilters({
    ...emptyFilters(),
    positions: [position],
    minFam: TACTIC_MIN_FAM,
    roles: { position, in_possession: pick(roles.in_possession), out_of_possession: pick(roles.out_of_possession), conds },
  });
}

export function sanitizeFilters(raw) {
  const f = emptyFilters();
  if (!raw || typeof raw !== 'object') return f;
  const arr = (v) => (Array.isArray(v) ? v : []);
  f.positions = uniq(arr(raw.positions).filter((c) => PITCH_CODES.includes(c)));
  f.minFam = intIn(raw.minFam, 1, 20) ?? DEFAULT_MIN_FAM;
  for (const k of Object.keys(RANGES)) {
    const r = arr(raw[k]);
    let lo = intIn(r[0], RANGES[k].min, RANGES[k].max), hi = intIn(r[1], RANGES[k].min, RANGES[k].max);
    if (lo !== null && hi !== null && lo > hi) [lo, hi] = [hi, lo];
    f[k] = [lo, hi];
  }
  f.feet = uniq(arr(raw.feet).filter((x) => FOOT_CHOICES.includes(x)));
  f.tags = uniq(arr(raw.tags).filter((x) => typeof x === 'string' && x));
  f.tagMode = raw.tagMode === 'all' ? 'all' : 'any';
  f.tiers = uniq(arr(raw.tiers).filter((t) => TIER_CHOICES.some((c) => c.tier === t))).sort();
  f.slots = SLOT_CHOICES.filter((s) => arr(raw.slots).includes(s));
  f.unassigned = raw.unassigned === true;
  f.attrs = arr(raw.attrs)
    .filter((c) => c && ATTR_CHOICE[c.key] && OP_BY_ID[c.op] && validAttrValue(c.value))
    .map((c) => ({ key: c.key, op: c.op, value: c.value }));
  f.roles = sanitizeRoleFilter(raw.roles, f.positions);
  f.expiry = EXPIRY_CHOICES.includes(raw.expiry) ? raw.expiry : null;
  for (const k of Object.keys(MONEY_RANGES)) {
    const r = arr(raw[k]);
    let lo = moneyOrNull(r[0]), hi = moneyOrNull(r[1]);
    if (lo !== null && hi !== null && lo > hi) [lo, hi] = [hi, lo];
    f[k] = [lo, hi];
  }
  const cl = raw.clause;
  f.clause = cl && CLAUSE_FILTERS.some((t) => t.id === cl.type)
    ? { type: cl.type, max: moneyOrNull(cl.max), status: cl.type === 'relegation' && cl.status === 'active' ? 'active' : 'any' }
    : null;
  f.nations = uniq(arr(raw.nations).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 80))).slice(0, 300).sort(collator.compare);
  return f;
}

/** Validate one attribute condition while editing; returns an error message or null. */
export function conditionError(c) {
  if (!c.key || !ATTR_CHOICE[c.key]) return 'Choose an attribute.';
  if (!OP_BY_ID[c.op]) return 'Choose at least, at most or equal to.';
  if (c.value === '' || c.value === null || c.value === undefined) return `Enter a value from ${ATTR_SCALE.min} to ${ATTR_SCALE.max}.`;
  const n = Number(c.value);
  if (!Number.isInteger(n)) return `Use a whole number from ${ATTR_SCALE.min} to ${ATTR_SCALE.max}.`;
  if (n < ATTR_SCALE.min || n > ATTR_SCALE.max) return `${ATTR_CHOICE[c.key].label} uses ${ATTR_SCALE.min}–${ATTR_SCALE.max}, so ${n} isn’t valid.`;
  return null;
}

/** Validate a money min–max (typed text) while editing; returns an error message or null. */
export function moneyRangeError(label, lo, hi) {
  const a = parseMoney(lo), b = parseMoney(hi);
  if (Number.isNaN(a) || Number.isNaN(b)) return `${label}: enter an amount such as 150,000.`;
  if (a !== null && b !== null && a > b) return `${label}: the minimum is higher than the maximum.`;
  return null;
}

/** Validate one money amount (typed text); returns an error message or null. */
export function moneyError(label, v) {
  return Number.isNaN(parseMoney(v)) ? `${label}: enter an amount such as 30,000,000.` : null;
}

/** Validate a min–max range while editing; returns an error message or null. */
export function rangeError(key, lo, hi) {
  const r = RANGES[key];
  const parse = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  const a = parse(lo), b = parse(hi);
  for (const [v, which] of [[a, 'Minimum'], [b, 'Maximum']]) {
    if (v === null) continue;
    if (!Number.isInteger(v)) return `${r.label}: ${which.toLowerCase()} must be a whole number.`;
    if (v < r.min || v > r.max) return `${r.label}: use ${r.min}–${r.max}.`;
  }
  if (a !== null && b !== null && a > b) return `${r.label}: the minimum is higher than the maximum.`;
  return null;
}

export function activeFilterCount(f) {
  let n = 0;
  if (f.positions.length) n++;
  for (const k of Object.keys(RANGES)) if (f[k][0] !== null || f[k][1] !== null) n++;
  if (f.feet.length) n++;
  if (f.tags.length) n++;
  // Same units as the chips: lineups, slots and Not assigned each count once.
  if (f.tiers.length) n++;
  if (f.slots.length) n++;
  if (f.unassigned) n++;
  n += f.attrs.length;
  if (f.roles) n++;
  if (f.expiry) n++;
  for (const k of Object.keys(MONEY_RANGES)) if (f[k][0] !== null || f[k][1] !== null) n++;
  if (f.clause) n++;
  if (f.nations.length) n++;
  return n;
}

// ---- Rows --------------------------------------------------------------------------------

const TEAM_ORDER = { first: 0, reserve: 1, youth: 2, loan: 3 };

/** Preferred foot — same rule as the player profile (equal = Both). */
export function preferredFoot(p) {
  const l = intOrNull(p.left_foot), r = intOrNull(p.right_foot);
  if (l === null || r === null) return null;
  return l === r ? 'Both' : r > l ? 'Right' : 'Left';
}


/**
 * Build the row model for one player (current values from the latest snapshot).
 * ctx: { careerId, keyOf(p), slotsOf(key), tagsOf(key) → [tag], teamOf(p) → {key,label,short}|null,
 *        nationsOf(p) → [{ name, flag }] (primary first), primaryNationOf(p) → { name, flag } | null }
 */
export function buildRow(p, ctx) {
  const key = ctx.keyOf(p);
  const name = profileNameOf(p);
  const positions = describePositions(p);
  const fam = p.positions && typeof p.positions === 'object' ? p.positions : {};
  const slots = ctx.slotsOf(key);
  const team = ctx.teamOf(p);
  const nations = ctx.nationsOf(p);
  const ca = intOrNull(p.ability?.current);
  const pa = intOrNull(p.ability?.potential);
  const natural = new Set((Array.isArray(p.natural_positions) ? p.natural_positions : []).map((c) => String(c).toLowerCase()));
  return {
    p, key, uid: p.uid, pid: persistentId(p),
    name,
    sortName: name.common || [name.last, name.first].filter(Boolean).join(' ') || name.main,
    search: normalizeSearch(`${searchTextOf(p)} ${p.full_name || ''} ${p.legal_name || ''}`),
    age: intOrNull(p.age),
    ca: ca !== null && ca >= 0 ? ca : null,
    pa: pa !== null && pa > 0 ? pa : null,
    positions,
    extraPositions: (Array.isArray(p.accomplished_positions) ? p.accomplished_positions : [])
      .filter((c) => !natural.has(String(c).toLowerCase())).length,
    fam: Object.fromEntries(PITCH_CODES.map((c) => [c, intOrNull(fam[c])])),
    naturalCodes: natural,
    slots, slotRank: hierarchyRank(slots),
    tagIds: new Set(ctx.tagsOf(key).map((t) => t.id)),
    team,
    club: (typeof p.club_short_name === 'string' && p.club_short_name.trim()) || (typeof p.club_name === 'string' && p.club_name.trim()) || null,
    nations,
    // Sorting uses the primary nationality only (dual nationals match filters through either).
    primaryNation: ctx.primaryNationOf ? ctx.primaryNationOf(p) : nations[0] || null,
    foot: preferredFoot(p),
    // Contract & transfer, read the same way as the profile's Contract sheet.
    ctDate: ctx.gameDateOf?.(p) || null,
    ct: contractDetails(p, ctx.gameDateOf?.(p) || null),
  };
}

// ---- Search & filters ------------------------------------------------------------------

export function matchesSearch(row, query) {
  const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean);
  return tokens.every((t) => row.search.includes(t));
}

const inRange = (v, [lo, hi]) => {
  if (lo === null && hi === null) return true;
  if (v === null) return false; // unknown never matches a range
  return (lo === null || v >= lo) && (hi === null || v <= hi);
};

const compareOp = (v, op, target) => (op === 'gte' ? v >= target : op === 'lte' ? v <= target : v === target);

export function matchesFilters(row, f) {
  if (f.positions.length && !f.positions.some((c) => row.fam[c] !== null && row.fam[c] >= f.minFam)) return false;
  if (!inRange(row.age, f.age) || !inRange(row.ca, f.ca) || !inRange(row.pa, f.pa)) return false;
  if (f.feet.length && !(row.foot && f.feet.includes(row.foot))) return false;
  // Nationality: any selected country, through any recorded nationality. None selected = everyone (missing included).
  if (f.nations.length && !row.nations.some((n) => f.nations.includes(n.name))) return false;
  if (f.tags.length) {
    const ok = f.tagMode === 'all' ? f.tags.every((t) => row.tagIds.has(t)) : f.tags.some((t) => row.tagIds.has(t));
    if (!ok) return false;
  }
  if (f.tiers.length || f.slots.length || f.unassigned) {
    // Any one assignment must satisfy both tier and slot (when given).
    const viaAssignment = (f.tiers.length || f.slots.length) && row.slots.some((s) =>
      (!f.tiers.length || f.tiers.includes(s.tier)) && (!f.slots.length || f.slots.includes(s.slot)));
    const viaUnassigned = f.unassigned && row.slots.length === 0;
    if (!viaAssignment && !viaUnassigned) return false;
  }
  for (const c of f.attrs) {
    const v = attrValue(row.p, c.key);
    if (v === null || !compareOp(v, c.op, c.value)) return false; // missing never matches
  }
  // Role key attributes: every active condition must match too (AND with everything above).
  for (const c of f.roles?.conds || []) {
    if (!roleCondActive(c)) continue;
    const v = attrValue(row.p, c.key);
    if (v === null || !compareOp(v, c.op, c.value)) return false;
  }
  // Contract & transfer (missing dates or amounts never match).
  if (f.expiry) {
    const from = row.ctDate, end = row.ct.contract.end;
    if (!from || !end || end < from || end > addMonths(from, f.expiry)) return false;
  }
  if (!inRange(moneySort(row, 'salary'), f.salary) || !inRange(moneySort(row, 'value'), f.tvalue)) return false;
  if (f.clause) {
    const { type, max, status } = f.clause;
    // One clause of the chosen type must satisfy the maximum and status together.
    const ok = clausesFor(row.p, type).some((cl) => {
      const v = clauseValue(cl);
      return (max === null || (v !== null && toPence(v) <= max)) && (status !== 'active' || clauseStatus(cl) === 'active');
    });
    if (!ok) return false;
  }
  return true;
}

/** Raw contract amount for sorting / ranges (to the penny, not the rounded display), or null. */
function moneySort(row, which) {
  const t = row.ct.transfer;
  const v = which === 'salary' ? row.ct.contract.monthly : which === 'value' ? t.valueAmount : t[which]?.amount ?? null;
  return typeof v === 'number' && Number.isFinite(v) ? toPence(v) : null;
}

const moneyRangeText = (label, [lo, hi]) => (lo !== null && hi !== null ? (lo === hi ? `${label} ${formatMoney(lo)}` : `${label} ${formatMoney(lo)}–${formatMoney(hi)}`)
  : lo !== null ? `${label} ≥ ${formatMoney(lo)}` : `${label} ≤ ${formatMoney(hi)}`);

/** Removable chips describing the active filters: [{ id, text, label, remove(filters) → filters }]. */
export function filterChips(f, tagName) {
  const chips = [];
  const clone = () => sanitizeFilters(JSON.parse(JSON.stringify(f)));
  if (f.positions.length) {
    chips.push({ id: 'pos', text: `${f.positions.map((c) => formatPositions([c])).join(', ')} ≥ ${f.minFam}`,
      label: `Position familiarity at least ${f.minFam}`, remove: () => ({ ...clone(), positions: [] }) });
  }
  if (f.roles) {
    const r = f.roles;
    const names = [r.in_possession && `${r.in_possession.name} (IP)`, r.out_of_possession && `${r.out_of_possession.name} (OOP)`].filter(Boolean);
    const active = r.conds.filter(roleCondActive);
    const conds = active.map((c) => `${ATTR_CHOICE[c.key].short} ${OP_BY_ID[c.op].symbol} ${c.value}`).join(', ');
    chips.push({ id: 'roles', role: true, text: `Role: ${names.join(' + ')}${conds ? ` · ${conds}` : ''}`,
      label: `Role filter: ${names.join(' and ')}${active.length ? `; ${active.map((c) => `${ATTR_CHOICE[c.key].label} ${OP_BY_ID[c.op].label} ${c.value}`).join(', ')}` : ''}`,
      remove: () => ({ ...clone(), roles: null }) });
  }
  for (const k of Object.keys(RANGES)) {
    const [lo, hi] = f[k];
    if (lo === null && hi === null) continue;
    const text = lo !== null && hi !== null ? (lo === hi ? `${RANGES[k].label} ${lo}` : `${RANGES[k].label} ${lo}–${hi}`)
      : lo !== null ? `${RANGES[k].label} ≥ ${lo}` : `${RANGES[k].label} ≤ ${hi}`;
    chips.push({ id: k, text, label: text, remove: () => ({ ...clone(), [k]: [null, null] }) });
  }
  if (f.feet.length) chips.push({ id: 'foot', text: `Foot: ${f.feet.join(', ')}`, label: `Preferred foot ${f.feet.join(' or ')}`, remove: () => ({ ...clone(), feet: [] }) });
  if (f.tags.length) {
    const names = f.tags.map((t) => tagName(t) || 'Deleted tag');
    const mode = f.tags.length > 1 ? (f.tagMode === 'all' ? ' (all)' : ' (any)') : '';
    chips.push({ id: 'tags', text: `Tags${mode}: ${names.join(', ')}`, label: `Tags ${f.tagMode}: ${names.join(', ')}`, remove: () => ({ ...clone(), tags: [] }) });
  }
  if (f.tiers.length) chips.push({ id: 'tiers', text: `XI: ${f.tiers.map((t) => TIER_CHOICES.find((c) => c.tier === t).short).join(', ')}`, label: 'Lineup', tiers: f.tiers, remove: () => ({ ...clone(), tiers: [] }) });
  if (f.slots.length) chips.push({ id: 'slots', text: `Slot: ${f.slots.join(', ')}`, label: `Lineup slot ${f.slots.join(' or ')}`, remove: () => ({ ...clone(), slots: [] }) });
  if (f.unassigned) chips.push({ id: 'unassigned', text: 'Not assigned', label: 'No default-lineup assignment', remove: () => ({ ...clone(), unassigned: false }) });
  f.attrs.forEach((c, i) => {
    const text = `${ATTR_CHOICE[c.key].label} ${OP_BY_ID[c.op].symbol} ${c.value}`;
    chips.push({ id: `attr${i}`, text, label: `${ATTR_CHOICE[c.key].label} ${OP_BY_ID[c.op].label} ${c.value}`,
      remove: () => { const n = clone(); n.attrs.splice(i, 1); return n; } });
  });
  if (f.expiry) chips.push({ id: 'expiry', text: `Expires within ${f.expiry} months`, label: `Contract expires within ${f.expiry} months`, remove: () => ({ ...clone(), expiry: null }) });
  for (const k of Object.keys(MONEY_RANGES)) {
    if (f[k][0] === null && f[k][1] === null) continue;
    const text = moneyRangeText(MONEY_RANGES[k].chip, f[k]);
    chips.push({ id: k, text, label: moneyRangeText(MONEY_RANGES[k].label, f[k]), remove: () => ({ ...clone(), [k]: [null, null] }) });
  }
  if (f.clause) {
    const t = CLAUSE_FILTERS.find((x) => x.id === f.clause.type);
    const what = t.id === 'any' ? 'Any clause' : `${t.label} clause${f.clause.status === 'active' ? ' (active)' : ''}`;
    const text = f.clause.max === null ? what : `${what} ≤ ${formatMoney(f.clause.max)}`;
    chips.push({ id: 'clause', text, label: `Release clause: ${text}`, remove: () => ({ ...clone(), clause: null }) });
  }
  if (f.nations.length) {
    chips.push({ id: 'nations', text: `Nationality: ${f.nations.join(', ')}`, label: `Nationality ${f.nations.join(' or ')}`, remove: () => ({ ...clone(), nations: [] }) });
  }
  return chips;
}

// ---- Nationality options -------------------------------------------------------------------
// The Nationality filter offers the countries represented in the view's player
// pool (not the filtered results), so ticking one country leaves the others
// available. Squad, Shortlists and Tags use the selected squad / list / tag;
// Tactic results use the players at the chosen position and roles.

/** Countries represented in rows, alphabetical by displayed name: [{ name, flag }]. */
export function nationOptions(rows) {
  const byName = new Map();
  for (const r of rows) for (const n of r.nations) if (n?.name && !byName.has(n.name)) byName.set(n.name, { name: n.name, flag: n.flag || null });
  return [...byName.values()].sort((a, b) => collator.compare(a.name, b.name));
}

/** The Tactic pool's criteria taken from a filter set: position(s), familiarity and roles only. */
export function tacticPoolFilters(f) {
  return sanitizeFilters({ ...emptyFilters(), positions: f.positions, minFam: f.minFam, roles: f.roles });
}

/** Country names matching a search (case- and accent-insensitive). */
export function matchCountry(name, query) {
  const q = normalizeSearch(query).trim();
  return !q || normalizeSearch(name).includes(q);
}

// ---- Development changes -------------------------------------------------------------------

/**
 * Prepare change lookups from the career's metrics.
 * metrics: [{ gameDate, players: [{ key, ca, attrs }] }] (any order); latestDate = displayed snapshot.
 * baseline: 'first' (each player's first recorded observation) or a snapshot date.
 */
export function buildDevContext(metrics, latestDate, baseline) {
  const snaps = [...metrics].sort((a, b) => a.gameDate.localeCompare(b.gameDate))
    .map((m) => ({ gameDate: m.gameDate, byKey: new Map(m.players.map((x) => [x.key, x])) }));
  const byDate = new Map(snaps.map((s) => [s.gameDate, s]));
  const earlier = snaps.filter((s) => s.gameDate < latestDate);
  return { latestDate, baseline, earlierDates: earlier.map((s) => s.gameDate), snaps: earlier, byDate };
}

/** Which observation a player is compared with: { date, obs } or { date|null, obs: null, reason }. */
export function baselineFor(dev, key) {
  if (dev.baseline === 'first') {
    const s = dev.snaps.find((x) => x.byKey.has(key));
    return s ? { date: s.gameDate, obs: s.byKey.get(key) } : { date: null, obs: null, reason: 'no earlier observation' };
  }
  const s = dev.byDate.get(dev.baseline);
  if (!s || dev.baseline >= dev.latestDate) return { date: dev.baseline, obs: null, reason: `no earlier snapshot dated ${formatGameDate(dev.baseline)}` };
  const obs = s.byKey.get(key);
  return obs ? { date: s.gameDate, obs } : { date: s.gameDate, obs: null, reason: `not in the ${formatGameDate(s.gameDate)} snapshot` };
}

/**
 * Change for a dev column. Returns { diff|null, text, tone, label, title } where
 * unavailable values carry an explicit reason (never shown as 0).
 */
export function devChange(row, col, dev) {
  const what = col.attr ? (ATTR_CHOICE[col.attr]?.label || col.attr) : 'CA';
  const b = baselineFor(dev, row.key);
  const current = col.attr ? attrValue(row.p, col.attr) : row.ca;
  if (!b.obs) return { diff: null, text: '—', tone: 'na', label: `${what} change unavailable: ${b.reason}`, title: `Unavailable: ${b.reason}` };
  const base = col.attr ? (validAttrValue(b.obs.attrs?.[col.attr]) ? b.obs.attrs[col.attr] : null) : (Number.isInteger(b.obs.ca) && b.obs.ca >= 0 ? b.obs.ca : null);
  const since = formatGameDate(b.date);
  if (current === null || base === null) {
    const why = current === null ? 'missing in the latest snapshot' : `missing in the ${since} snapshot`;
    return { diff: null, text: '—', tone: 'na', label: `${what} change unavailable: ${why}`, title: `Unavailable: ${why}` };
  }
  const c = describeChange(current, base, col.attr ? attributeDirection(col.attr) : 'positive');
  const text = c.diff === 0 ? '0' : c.text;
  const label = c.diff === 0 ? `${what}: no change since ${since}` : `${what}: ${c.label} since ${since}`;
  return { diff: c.diff, text, tone: c.diff === 0 ? 'none' : c.tone, label, title: `Since ${since}: ${base} → ${current}` };
}

// ---- Sorting -----------------------------------------------------------------------------------

/** Sort value for a column (null = missing, always last). */
function sortValue(row, id, dev) {
  switch (id) {
    case 'xi': return row.slotRank === Infinity ? null : row.slotRank;
    case 'pos': return row.positions.sortKey >= 999 ? null : row.positions.sortKey;
    case 'age': return row.age;
    case 'ca': return row.ca;
    case 'pa': return row.pa;
    case 'squad': return row.team ? TEAM_ORDER[row.team.key] ?? 9 : null;
    case 'club': return row.club;
    case 'nat': return row.primaryNation?.name ?? null;
    case 'foot': return row.foot;
    case 'c:expiry': return row.ct.contract.end ? Number(row.ct.contract.end.replace(/-/g, '')) : null;
    case 'c:salary': return moneySort(row, 'salary');
    case 'c:value': return moneySort(row, 'value');
    case 'c:release': return moneySort(row, 'release');
    case 'c:foreign': return moneySort(row, 'foreign');
    case 'c:champions': return moneySort(row, 'champions');
    case 'c:relegation': return moneySort(row, 'relegation');
    default: {
      const col = columnDef(id);
      if (!col) return null;
      if (col.dev) return dev ? devChange(row, col, dev).diff : null;
      if (col.attr) return attrValue(row.p, col.attr);
      return null;
    }
  }
}

const byName = (a, b) => collator.compare(a.sortName, b.sortName) || collator.compare(a.pid || '', b.pid || '');

/**
 * Sort rows. Numbers numerically, text by collation; missing values last in
 * either direction; ties fall back to name (then persistent id) so order is stable.
 */
export function sortRows(rows, sort, dev) {
  if (sort.key === 'name') {
    const d = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => byName(a, b) * d);
  }
  const dir = sort.dir === 'asc' ? 1 : -1;
  const keyed = rows.map((r) => ({ r, v: sortValue(r, sort.key, dev) }));
  keyed.sort((x, y) => {
    const xn = x.v === null || x.v === undefined, yn = y.v === null || y.v === undefined;
    if (xn !== yn) return xn ? 1 : -1;
    if (!xn) {
      const c = typeof x.v === 'number' && typeof y.v === 'number' ? x.v - y.v : collator.compare(String(x.v), String(y.v));
      if (c) return c * dir;
    }
    return byName(x.r, y.r);
  });
  return keyed.map((k) => k.r);
}

// ---- Configs (what a saved view stores) ----------------------------------------------------------

export const DEFAULT_SORT = { key: 'ca', dir: 'desc' };

export function defaultConfig(section) {
  return { filters: emptyFilters(), columns: [...DEFAULT_COLUMNS[section] || DEFAULT_COLUMNS.squad], sort: { ...DEFAULT_SORT }, baseline: 'first' };
}

/** Sort keys allowed for a column set: any shown column, plus XI (Squad slot) and Nationality even when hidden. */
export const sortableKeys = (columns) => uniq(['xi', ...columns, 'nat']);

export function sanitizeConfig(raw, section) {
  const base = defaultConfig(section);
  if (!raw || typeof raw !== 'object') return base;
  let columns = uniq((Array.isArray(raw.columns) ? raw.columns : []).filter((id) => columnDef(id)));
  if (!columns.length) columns = base.columns;
  if (!columns.includes('name')) columns.splice(columns[0] === 'xi' ? 1 : 0, 0, 'name'); // Name is always shown
  const s = raw.sort && typeof raw.sort === 'object' ? raw.sort : {};
  const sort = sortableKeys(columns).includes(s.key)
    ? { key: s.key, dir: s.dir === 'asc' ? 'asc' : 'desc' }
    : (columns.includes('ca') ? { ...DEFAULT_SORT } : { key: 'name', dir: 'asc' });
  const baseline = typeof raw.baseline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.baseline) ? raw.baseline : 'first';
  return { filters: sanitizeFilters(raw.filters), columns, sort, baseline };
}

export const sameConfig = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- Saved views & per-section state (stored per career) --------------------------------------------

export const DEFAULT_VIEW_ID = 'default';
export const normalizeViewName = (raw) => String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);

export const emptyListPrefs = () => ({
  views: [],
  sections: Object.fromEntries(SECTIONS.map((s) => [s, { viewId: DEFAULT_VIEW_ID, config: defaultConfig(s) }])),
});

export function sanitizeListPrefs(raw) {
  const out = emptyListPrefs();
  if (!raw || typeof raw !== 'object') return out;
  const names = new Set();
  for (const v of Array.isArray(raw.views) ? raw.views : []) {
    const name = normalizeViewName(v?.name);
    if (!v || typeof v.id !== 'string' || !v.id || v.id === DEFAULT_VIEW_ID || !name) continue;
    if (names.has(name.toLowerCase()) || out.views.some((x) => x.id === v.id)) continue;
    names.add(name.toLowerCase());
    out.views.push({ id: v.id, name, config: sanitizeConfig(v.config, 'squad'), createdAt: v.createdAt ?? null, updatedAt: v.updatedAt ?? null });
  }
  for (const s of SECTIONS) {
    const st = raw.sections?.[s];
    if (!st) continue;
    const viewId = st.viewId === DEFAULT_VIEW_ID || out.views.some((v) => v.id === st.viewId) ? st.viewId : DEFAULT_VIEW_ID;
    out.sections[s] = { viewId, config: sanitizeConfig(st.config, s) };
  }
  return out;
}

export const newViewId = () => `v_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Name check for create/rename; returns an error message or null. */
export function viewNameError(prefs, name, exceptId = null) {
  const n = normalizeViewName(name);
  if (!n) return 'Enter a name.';
  if (n.toLowerCase() === 'default') return '“Default” is reserved for the built-in view.';
  if (prefs.views.some((v) => v.id !== exceptId && v.name.toLowerCase() === n.toLowerCase())) return 'A view with this name already exists.';
  return null;
}
