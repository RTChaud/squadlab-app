// Contract and transfer details for the player profile's Contract sheet, read
// from the extractor's `contract` block and transfer fields as they are. Every
// value comes from the same player snapshot as the rest of the profile.
//
// Clauses are matched by the extractor's decoded `kind` names. For the tested
// FM26 export format a few raw codes are also read (see FM26_CODES); in any
// other format those codes are never guessed.
//
// Amounts are GBP. Display rounds up (formatMoneyDisplay); calculations,
// sorting and filtering use the raw amounts.

import { formatMoneyDisplay, monthlyFromWeekly } from './money.js';

export const UNAVAILABLE = 'Unavailable';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const parseDate = (iso) => { const m = DATE_RE.exec(iso || ''); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; };
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Calendar time from `fromIso` to `toIso`: "2 years, 2 months", "18 days", "Expired" … */
export function timeRemaining(fromIso, toIso) {
  const a = parseDate(fromIso), b = parseDate(toIso);
  if (!a || !b) return null;
  const order = (b.y - a.y) * 10000 + (b.m - a.m) * 100 + (b.d - a.d);
  if (order < 0) return 'Expired';
  if (order === 0) return 'Expires today';
  let years = b.y - a.y, months = b.m - a.m, days = b.d - a.d;
  if (days < 0) { months -= 1; days += daysInMonth(b.m === 1 ? b.y - 1 : b.y, b.m === 1 ? 12 : b.m - 1); }
  if (months < 0) { years -= 1; months += 12; }
  const parts = [];
  if (years) parts.push(plural(years, 'year'));
  if (months) parts.push(plural(months, 'month'));
  if (!years && days) parts.push(plural(days, 'day')); // days only matter under a year
  return `${parts.join(', ')} remaining`;
}

/** True when the snapshot holds a usable contract record for this player. */
export const hasContract = (c) => !!c && typeof c === 'object' && c.end_source !== 'none';

// ---- Export format ------------------------------------------------------------

// Players are tagged with their snapshot's format as snapshots are loaded
// (db.js), so a record from an older snapshot keeps its own format.
const FORMAT = new WeakMap();
export function noteSnapshotFormat(data) {
  if (!data || !Array.isArray(data.players)) return;
  const fmt = data.source?.game === 'FM26' && data.schema_version === 2 ? 'fm26' : 'other';
  for (const p of data.players) if (p && typeof p === 'object') FORMAT.set(p, fmt);
}
const isFm26 = (p) => FORMAT.get(p) === 'fm26';

// Raw clause codes confirmed for the tested FM26 export format.
const FM26_CODES = { standard: 0, champions: 27, relegation: 1, relegationActive: 55 };

const rawClauses = (p) => (Array.isArray(p?.contract?.clauses) ? p.contract.clauses.filter((x) => x && typeof x === 'object') : []);
const codeOf = (cl) => (Number.isInteger(cl?.kind_code) ? cl.kind_code : null);
const kindOf = (cl) => (typeof cl?.kind === 'string' ? cl.kind : '');
/** Every clause carries a code, so "no active clause" can be trusted. */
const completeClauses = (p) => rawClauses(p).every((cl) => codeOf(cl) !== null);

/** Clause amount as a number, or null when missing. */
export const clauseValue = (cl) => (typeof cl?.value === 'number' && Number.isFinite(cl.value) ? cl.value : null);

/** Clause types shared by the profile, table and filters. */
export const CLAUSE_TYPES = [
  { id: 'standard', label: 'Standard' },
  { id: 'foreign', label: 'Foreign-club' },
  { id: 'champions', label: 'Champions League' },
  { id: 'relegation', label: 'Relegation' },
];

const MATCH = {
  standard: (cl, fm26) => kindOf(cl) === 'minimum_fee_release' || (fm26 && codeOf(cl) === FM26_CODES.standard),
  foreign: (cl) => /release/.test(kindOf(cl)) && /foreign/.test(kindOf(cl)),
  champions: (cl, fm26) => (/release/.test(kindOf(cl)) && /champions/.test(kindOf(cl))) || (fm26 && codeOf(cl) === FM26_CODES.champions),
};

/**
 * The relegation release clause as one entry { value, status }, or null.
 * FM26: a positive amount under code 55 is the active clause; otherwise an
 * ordinary code 1 clause is inactive when the clause data is complete, and of
 * unknown status when it isn't. Other formats: decoded name, status unknown.
 */
function relegationClause(p) {
  const all = rawClauses(p);
  if (isFm26(p)) {
    const active = all.find((cl) => codeOf(cl) === FM26_CODES.relegationActive && clauseValue(cl) > 0);
    if (active) return { value: clauseValue(active), status: 'active' };
    const ordinary = all.find((cl) => codeOf(cl) === FM26_CODES.relegation || kindOf(cl) === 'relegation_release');
    const pending = all.find((cl) => codeOf(cl) === FM26_CODES.relegationActive);
    if (ordinary) return { value: clauseValue(ordinary), status: completeClauses(p) ? 'inactive' : 'unknown' };
    return pending ? { value: clauseValue(pending), status: 'unknown' } : null;
  }
  const named = all.find((cl) => kindOf(cl) === 'relegation_release');
  return named ? { value: clauseValue(named), status: 'unknown' } : null;
}

/** Every clause of a type as { value, status? } (the profile and columns show the first). */
export function clausesOf(p, type) {
  if (!hasContract(p?.contract)) return [];
  if (type === 'relegation') { const r = relegationClause(p); return r ? [r] : []; }
  const test = MATCH[type];
  if (!test) return [];
  const fm26 = isFm26(p);
  return rawClauses(p).filter((cl) => test(cl, fm26)).map((cl) => ({ value: clauseValue(cl) }));
}

/** Amount cell for a clause: dash when not recorded, "Unavailable" when its amount is missing. */
function clauseAmount(cl) {
  if (!cl) return { text: null, state: 'none', amount: null };
  const amount = clauseValue(cl);
  return amount === null ? { text: UNAVAILABLE, state: 'unavailable', amount } : { text: formatMoneyDisplay(amount), state: 'ok', amount };
}

/** Relegation release status: 'active' | 'inactive' | 'unknown'. */
export const clauseStatus = (cl) => cl?.status || 'unknown';

/** Recorded expiry (ISO date) or null. */
export const contractEnd = (p) => (hasContract(p?.contract) && parseDate(p.contract.end) ? p.contract.end : null);

/** Monthly salary from the recorded weekly wage, or null. */
export function monthlySalary(p) {
  const c = p?.contract;
  return hasContract(c) && typeof c.wage === 'number' && Number.isFinite(c.wage) ? monthlyFromWeekly(c.wage) : null;
}

/** Stored transfer valuation: "zero" is a recorded £0, "unset" isn't recorded. */
export const transferValue = (p) => (typeof p?.transfer_value === 'number' && Number.isFinite(p.transfer_value) ? p.transfer_value : (p?.transfer_value_state === 'zero' ? 0 : null));

const positive = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * The selling club's asking price (not a release clause), raw amount:
 *   { amount, source: 'verified' | 'indicative' | null }
 * 'verified': a dedicated `asking_price` field on the player record, when the
 * snapshot has one. 'indicative': otherwise the top-level transfer_value, when
 * transfer_value_state is "ok" and the amount is positive — in the current
 * Crystal Palace exports it matched FM's asking price at the precision FM
 * shows (Mainoo 80,874,782 ≈ £81m, Bergvall 60,498,534 ≈ £60m), but its
 * meaning isn't confirmed, so the UI labels it as indicative.
 */
export function askingPrice(p) {
  if (positive(p?.asking_price)) return { amount: p.asking_price, source: 'verified' };
  if (p?.transfer_value_state === 'ok' && positive(p?.transfer_value)) return { amount: p.transfer_value, source: 'indicative' };
  return { amount: null, source: null };
}

/** ISO date `months` calendar months after `iso` (day clamped to the month's end). */
export function addMonths(iso, months) {
  const a = parseDate(iso);
  if (!a) return null;
  const t = a.y * 12 + (a.m - 1) + months;
  const y = Math.floor(t / 12), m = (t % 12) + 1;
  const d = Math.min(a.d, daysInMonth(y, m));
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * @param p player record (the profile's snapshot)
 * @param gameDate that snapshot's in-game date
 */
export function contractDetails(p, gameDate) {
  const c = p?.contract;
  const end = contractEnd(p);
  const monthly = monthlySalary(p);
  const asking = askingPrice(p);
  const tv = transferValue(p);
  const relegation = clausesOf(p, 'relegation')[0];  // { value, status } or undefined

  return {
    contract: {
      end,
      remaining: end ? timeRemaining(gameDate, end) : null,
      monthly,
      monthlyText: monthly === null ? UNAVAILABLE : formatMoneyDisplay(monthly),
    },
    transfer: {
      asking: { ...asking, text: asking.amount === null ? UNAVAILABLE : formatMoneyDisplay(asking.amount) },
      value: formatMoneyDisplay(tv) || UNAVAILABLE,
      valueAmount: tv,
      release: clauseAmount(clausesOf(p, 'standard')[0]),
      foreign: clauseAmount(clausesOf(p, 'foreign')[0]),
      champions: clauseAmount(clausesOf(p, 'champions')[0]),
      relegation: { ...clauseAmount(relegation), status: relegation ? clauseStatus(relegation) : null },
    },
  };
}
