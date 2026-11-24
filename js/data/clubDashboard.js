// My Club dashboard: squad statistics from the latest snapshot and trends
// from the career's stored snapshots. Pure functions — no storage, no DOM.
//
// Data rules:
//   - Club players only (is_club_player, out on loan included); shortlist-only
//     players never count. One row per persistent player ID.
//   - Missing values stay unknown (excluded, with a valid-record count); an
//     explicit 0 is a real value.
//   - Aggregates use full precision; rounding is for display only.
//   - Salaries are monthly, from the weekly wage of a contract with this club
//     (see players.js clubMonthlySalary); a loaned-in player's parent-club
//     contract is unknown, not ours.

import { persistentId, squadKeyByUid, isClubOwned, displayNameOf, clubMonthlySalary } from './players.js';
import { WINDOWS, monthsBefore, SQUAD_LABEL } from './development.js';
import { ATTRIBUTE_GROUPS, intOrNull } from './attributes.js';
import { PITCH_CODES } from './positions.js';
import { addMonths } from './contract.js';

export const SQUADS = [
  { id: 'all', label: 'All club players' },
  { id: 'first', label: 'First Team' },
  { id: 'reserve', label: 'Reserves' },
  { id: 'youth', label: 'Youth' },
  { id: 'loan', label: 'Out on loan' },
];

export const PERIODS = [
  { id: 'overall', label: 'Since first snapshot', short: 'since the first snapshot' },
  { id: '12m', label: 'Last 12 months', short: '12 months' },
  { id: '3m', label: 'Last 3 months', short: '3 months' },
  { id: '1m', label: 'Last month', short: '1 month' },
];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const dayNum = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
export const daysBetween = (a, b) => dayNum(b) - dayNum(a);

// ---- Players of the latest snapshot ---------------------------------------------------

/**
 * Club players of one snapshot, deduplicated by persistent ID (first record
 * wins; players without an ID can't be matched across snapshots and are kept
 * once by uid). Each: { pid, p, name, squad, ca, pa, age, salary }.
 */
export function clubPlayers(data) {
  const squadOf = squadKeyByUid(data);
  const seen = new Set();
  const out = [];
  for (const p of data.players || []) {
    if (!isClubOwned(p, data)) continue;
    const pid = persistentId(p);
    const id = pid ?? `uid:${p.uid}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const pa = intOrNull(p.ability?.potential);
    out.push({
      pid, id, p,
      name: displayNameOf(p),
      squad: squadOf.get(p.uid) ?? null,
      ca: intOrNull(p.ability?.current),
      pa: pa !== null && pa > 0 ? pa : null, // FM writes negative "range" codes for unknown potential
      age: intOrNull(p.age),
      salary: clubMonthlySalary(p, data),
    });
  }
  return out;
}

export const inSquad = (rows, squad) => (squad && squad !== 'all' ? rows.filter((r) => r.squad === squad) : rows);

// ---- Statistics ---------------------------------------------------------------------

export function median(values) {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Summary of one numeric field over rows ({ name, ... }). Unknown values are
 * left out and counted. Records list every tied holder.
 * → { count, known, min, max, mean, median, sum, minHolders, maxHolders }
 */
export function summarise(rows, valueOf) {
  const known = rows.map((r) => ({ r, v: valueOf(r) })).filter((x) => isNum(x.v));
  const vals = known.map((x) => x.v);
  if (!vals.length) return { count: rows.length, known: 0, min: null, max: null, mean: null, median: null, sum: null, minHolders: [], maxHolders: [] };
  const min = Math.min(...vals), max = Math.max(...vals);
  const sum = vals.reduce((a, b) => a + b, 0);
  const byName = (a, b) => a.name.localeCompare(b.name);
  return {
    count: rows.length, known: vals.length, min, max, sum, mean: sum / vals.length, median: median(vals),
    minHolders: known.filter((x) => x.v === min).map((x) => x.r).sort(byName),
    maxHolders: known.filter((x) => x.v === max).map((x) => x.r).sort(byName),
  };
}

export function squadStats(rows) {
  return {
    count: rows.length,
    ca: summarise(rows, (r) => r.ca),
    pa: summarise(rows, (r) => r.pa),
    headroom: summarise(rows, (r) => (r.ca !== null && r.pa !== null ? r.pa - r.ca : null)),
    salary: summarise(rows, (r) => r.salary),
    age: summarise(rows, (r) => r.age),
  };
}

// ---- Distributions ----------------------------------------------------------------------

const band = (id, label, min, max, detail) => ({ id, label, min, max, detail: detail || label });
export const DISTRIBUTIONS = {
  age: { title: 'Age', valueOf: (r) => r.age, bands: [
    band('u19', '18 and under', -Infinity, 18), band('19', '19–21', 19, 21), band('22', '22–24', 22, 24), band('25', '25–27', 25, 27),
    band('28', '28–30', 28, 30), band('31', '31–33', 31, 33), band('34', '34 and over', 34, Infinity)] },
  ca: { title: 'CA', valueOf: (r) => r.ca, bands: [
    band('u80', 'Under 80', -Infinity, 79), band('80', '80–99', 80, 99), band('100', '100–119', 100, 119), band('120', '120–139', 120, 139),
    band('140', '140–159', 140, 159), band('160', '160–179', 160, 179), band('180', '180–200', 180, Infinity)] },
  pa: { title: 'PA', valueOf: (r) => r.pa, bands: [
    band('u80', 'Under 80', -Infinity, 79), band('80', '80–99', 80, 99), band('100', '100–119', 100, 119), band('120', '120–139', 120, 139),
    band('140', '140–159', 140, 159), band('160', '160–179', 160, 179), band('180', '180–200', 180, Infinity)] },
  salary: { title: 'Monthly salary', valueOf: (r) => r.salary, money: true, bands: [
    band('u10', 'Under £10k', -Infinity, 10000, 'Under £10,000 a month'),
    band('10', '£10k–£50k', 10000, 50000, '£10,000 to under £50,000 a month'),
    band('50', '£50k–£100k', 50000, 100000, '£50,000 to under £100,000 a month'),
    band('100', '£100k–£250k', 100000, 250000, '£100,000 to under £250,000 a month'),
    band('250', '£250k–£500k', 250000, 500000, '£250,000 to under £500,000 a month'),
    band('500', '£500k and over', 500000, Infinity, '£500,000 or more a month')] },
};

/**
 * Bands for one distribution. Whole-number bands are inclusive (min ≤ v ≤ max);
 * money bands are [min, max) so £50,000 sits in "£50k–£100k" only.
 * → { bands: [{ ...band, rows }], unknown: rows }
 */
export function distribution(rows, kind) {
  const d = DISTRIBUTIONS[kind];
  const inBand = d.money ? (v, b) => v >= b.min && v < b.max : (v, b) => v >= b.min && v <= b.max;
  const bands = d.bands.map((b) => ({ ...b, rows: [] }));
  const unknown = [];
  for (const r of rows) {
    const v = d.valueOf(r);
    if (!isNum(v)) { unknown.push(r); continue; }
    const b = bands.find((x) => inBand(v, x));
    if (b) b.rows.push(r); else unknown.push(r);
  }
  return { bands, unknown };
}

// ---- Development summary (periods shared with Development) ------------------------------

const asc = (list) => [...list].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
const STANDARD_GROUPS = ATTRIBUTE_GROUPS.filter((g) => g.key !== 'goalkeeping');

/**
 * The two snapshots a period compares: the latest, and the latest snapshot on
 * or before the cutoff (Overall: the first snapshot). When the career's
 * history starts after the cutoff, its first snapshot is used and the period
 * is flagged as shorter. → { start, end, cutoff, coverage: 'full'|'shorter'|'longer'|null, insufficient }
 */
export function periodEndpoints(metrics, periodId) {
  const list = asc(metrics);
  if (!list.length) return { start: null, end: null, cutoff: null, coverage: null, insufficient: true };
  const end = list[list.length - 1];
  const w = WINDOWS.find((x) => x.id === periodId) || WINDOWS[0];
  if (!w.months) {
    const start = list[0];
    return { start, end, cutoff: null, coverage: 'full', insufficient: start === end };
  }
  const cutoff = monthsBefore(end.gameDate, w.months);
  const before = list.filter((m) => m.gameDate <= cutoff);
  if (before.length) {
    const start = before[before.length - 1];
    return { start, end, cutoff, coverage: start.gameDate === cutoff ? 'full' : 'longer', insufficient: false };
  }
  const start = list[0];
  return { start, end, cutoff, coverage: 'shorter', insufficient: start === end };
}

/**
 * CA and attribute development of the cohort (pids of the selected squad's
 * current members, or every club player) between two snapshots' metrics.
 * Only players recorded as club players at both endpoints with a CA at both
 * are compared; squad moves inside the club don't matter.
 */
export function developmentSummary(startM, endM, cohortPids) {
  const pidOf = (key) => key.slice(key.lastIndexOf(':') + 1);
  const a = new Map(startM.players.map((r) => [pidOf(r.key), r]));
  const b = new Map(endM.players.map((r) => [pidOf(r.key), r]));
  const compared = [];
  let notAtStart = 0, missingCa = 0;
  for (const pid of cohortPids) {
    const s = a.get(pid), e = b.get(pid);
    if (!e?.own) continue;
    if (!s?.own) { notAtStart++; continue; }
    if (!Number.isInteger(s.ca) || !Number.isInteger(e.ca)) { missingCa++; continue; }
    compared.push({ pid, name: e.name, from: s.ca, to: e.ca, change: e.ca - s.ca, s, e });
  }
  const changes = compared.map((x) => x.change);
  const total = changes.reduce((x, y) => x + y, 0);
  const maxC = changes.length ? Math.max(...changes) : null, minC = changes.length ? Math.min(...changes) : null;
  const byName = (x, y) => x.name.localeCompare(y.name);

  // Attribute points: per group, only attributes known at both endpoints.
  const groups = STANDARD_GROUPS.map((g) => {
    let net = 0, comparedValues = 0, expected = 0;
    for (const x of compared) for (const at of g.attrs) {
      expected++;
      const v0 = x.s.attrs?.[at.key], v1 = x.e.attrs?.[at.key];
      if (Number.isInteger(v0) && Number.isInteger(v1)) { net += v1 - v0; comparedValues++; }
    }
    return { key: g.key, label: g.label, net, compared: comparedValues, expected };
  });

  return {
    cohort: cohortPids.length,
    compared: compared.length,
    notAtStart, missingCa,
    rows: compared.sort((x, y) => y.change - x.change || byName(x, y)),
    total: compared.length ? total : null,
    mean: compared.length ? total / compared.length : null,
    median: median(changes),
    gain: maxC !== null && maxC > 0 ? { value: maxC, holders: compared.filter((x) => x.change === maxC).sort(byName) } : null,
    decline: minC !== null && minC < 0 ? { value: minC, holders: compared.filter((x) => x.change === minC).sort(byName) } : null,
    improving: changes.filter((c) => c > 0).length,
    unchanged: changes.filter((c) => c === 0).length,
    declining: changes.filter((c) => c < 0).length,
    attrs: {
      groups,
      net: groups.reduce((n, g) => n + g.net, 0),
      compared: groups.reduce((n, g) => n + g.compared, 0),
      expected: groups.reduce((n, g) => n + g.expected, 0),
    },
  };
}

// ---- Squad evolution --------------------------------------------------------------------

/**
 * One point per stored snapshot, for the players belonging to the selected
 * squad on that date (All: every club player then). Averages use known values
 * only; the salary total is null when no salary is known, and each point
 * keeps its coverage so changing coverage can be shown.
 */
export function squadEvolution(metrics, squad) {
  return asc(metrics).map((m) => {
    const rows = m.players.filter((r) => r.own && (squad === 'all' || r.squad === squad));
    const known = (f) => rows.map(f).filter(isNum);
    const avg = (vals) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
    const ca = known((r) => r.ca), pa = known((r) => (isNum(r.pa) && r.pa > 0 ? r.pa : null)), age = known((r) => r.age), sal = known((r) => r.salary);
    return {
      gameDate: m.gameDate,
      count: rows.length,
      avgCa: avg(ca), avgPa: avg(pa), avgAge: avg(age),
      salary: sal.length ? sal.reduce((a, b) => a + b, 0) : null,
      known: { ca: ca.length, pa: pa.length, age: age.length, salary: sal.length },
    };
  });
}

// ---- Nationalities ----------------------------------------------------------------------

/**
 * Primary nationality per player (once each), resolved with `resolve(id)` →
 * { name, flag } | null. → { rows: [{ name, flag, count, share, players }], unknown: players }
 */
export function nationalities(rows, resolve) {
  const by = new Map();
  const unknown = [];
  for (const r of rows) {
    const n = Number.isInteger(r.p.nation_id) ? resolve(r.p.nation_id) : null;
    if (!n?.name) { unknown.push(r); continue; }
    if (!by.has(n.name)) by.set(n.name, { name: n.name, flag: n.flag || null, players: [] });
    by.get(n.name).players.push(r);
  }
  const total = rows.length;
  const list = [...by.values()].map((x) => ({ ...x, count: x.players.length, share: total ? x.players.length / total : 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { rows: list, unknown, total };
}

// ---- Contracts ---------------------------------------------------------------------------

/**
 * Contract outlook from the current in-game date. Windows are cumulative
 * (within 12 months includes within 6). Contracts with another club (players
 * loaned in), expired and unknown expiries are kept apart.
 */
export function contractOutlook(rows, gameDate, data) {
  const club = data?.club?.uid ?? data?.club?.unique_id;
  const withEnd = [], expired = [], unknown = [], otherClub = [];
  for (const r of rows) {
    const c = r.p.contract;
    const usable = c && typeof c === 'object' && c.end_source !== 'none';
    if (usable && Number.isInteger(c.club_uid) && Number.isInteger(club) && c.club_uid !== club) { otherClub.push(r); continue; }
    const end = usable && typeof c.end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.end) ? c.end : null;
    if (!end) { unknown.push({ ...r, end: null }); continue; }
    if (end < gameDate) expired.push({ ...r, end }); else withEnd.push({ ...r, end });
  }
  const byEnd = (a, b) => a.end.localeCompare(b.end) || a.name.localeCompare(b.name);
  const windows = [6, 12, 24].map((months) => {
    const limit = addMonths(gameDate, months);
    const list = withEnd.filter((r) => r.end <= limit).sort(byEnd);
    const sal = list.map((r) => r.salary).filter(isNum);
    return { months, limit, rows: list, salary: sal.length ? sal.reduce((a, b) => a + b, 0) : null, salaryKnown: sal.length };
  });
  return { windows, expired: expired.sort(byEnd), unknown, otherClub };
}

// ---- Wage concentration -------------------------------------------------------------------

export function wageConcentration(rows, n = 5) {
  const known = rows.filter((r) => isNum(r.salary));
  const total = known.reduce((a, r) => a + r.salary, 0);
  const top = [...known].sort((a, b) => b.salary - a.salary || a.name.localeCompare(b.name)).slice(0, n);
  const topSum = top.reduce((a, r) => a + r.salary, 0);
  return { top, topSum, total, known: known.length, count: rows.length, share: total > 0 ? topSum / total : null };
}

// ---- Position coverage --------------------------------------------------------------------

export const COVER_MIN = 15;
/** Players with familiarity ≥ 15 per pitch position (counts overlap). */
export function positionCoverage(rows) {
  const hasFam = (r) => r.p.positions && typeof r.p.positions === 'object';
  const unknown = rows.filter((r) => !hasFam(r));
  const positions = PITCH_CODES.map((code) => {
    const list = rows.filter(hasFam).map((r) => ({ ...r, fam: intOrNull(r.p.positions[code]) }))
      .filter((r) => r.fam !== null && r.fam >= COVER_MIN)
      .sort((a, b) => b.fam - a.fam || a.name.localeCompare(b.name));
    return { code, rows: list };
  });
  return { positions, unknown };
}

// ---- Snapshot changes ------------------------------------------------------------------------

/**
 * Club membership changes between two snapshots for a squad view. For a
 * single squad, moves between club squads are listed apart from players newly
 * or no longer recorded at the club.
 */
export function membershipChanges(startM, endM, squad) {
  const a = new Map(startM.players.map((r) => [r.key, r]));
  const b = new Map(endM.players.map((r) => [r.key, r]));
  const inSq = (r) => r?.own && (squad === 'all' || r.squad === squad);
  const out = { joinedClub: [], leftClub: [], movedIn: [], movedOut: [] };
  for (const [key, r] of b) {
    if (!inSq(r)) continue;
    const old = a.get(key);
    if (!old?.own) out.joinedClub.push({ key, before: old || null, after: r });
    else if (squad !== 'all' && old.squad !== squad) out.movedIn.push({ key, before: old, after: r });
  }
  for (const [key, r] of a) {
    if (!inSq(r)) continue;
    const now = b.get(key);
    if (!now?.own) out.leftClub.push({ key, before: r, after: now || null });
    else if (squad !== 'all' && now.squad !== squad) out.movedOut.push({ key, before: r, after: now });
  }
  const byName = (x, y) => (x.after?.name || x.before?.name || '').localeCompare(y.after?.name || y.before?.name || '');
  for (const k of Object.keys(out)) out[k].sort(byName);
  return out;
}

export { SQUAD_LABEL };
