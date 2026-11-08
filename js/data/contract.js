// Contract and transfer details for the player profile's Contract sheet, read
// from the extractor's `contract` block and transfer fields as they are. Every
// value comes from the same player snapshot as the rest of the profile.
//
// Clause kinds are matched by the extractor's decoded `kind` names only; codes
// it couldn't name ("unknown") are never guessed.

import { formatMoney, monthlyFromWeekly } from './money.js';

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

/** Clause types, matched by the extractor's decoded kind names (shared by the profile, table and filters). */
export const CLAUSE_TYPES = [
  { id: 'standard', label: 'Standard', test: (k) => k === 'minimum_fee_release' },
  { id: 'foreign', label: 'Foreign-club', test: (k) => /release/.test(k) && /foreign/.test(k) },
  { id: 'relegation', label: 'Relegation', test: (k) => k === 'relegation_release' },
];
const CLAUSE_TEST = Object.fromEntries(CLAUSE_TYPES.map((t) => [t.id, t.test]));

/** Every decoded clause of a type (the profile and columns show the first). */
export function clausesOf(p, type) {
  const c = p?.contract;
  const test = CLAUSE_TEST[type];
  return test && Array.isArray(c?.clauses) ? c.clauses.filter((x) => x && typeof x.kind === 'string' && test(x.kind)) : [];
}

/** Clause amount as a number, or null when missing. */
export const clauseValue = (cl) => (typeof cl?.value === 'number' && Number.isFinite(cl.value) ? cl.value : null);

/** Amount cell for a clause: dash when not decoded, "Unavailable" when its amount is missing. */
function clauseAmount(cl) {
  if (!cl) return { text: null, state: 'none', amount: null };
  const amount = clauseValue(cl);
  return amount === null ? { text: UNAVAILABLE, state: 'unavailable', amount } : { text: formatMoney(amount), state: 'ok', amount };
}

/** Relegation release status: only from an explicit flag in the snapshot. */
export function clauseStatus(cl) {
  const v = cl?.active ?? cl?.is_active ?? (typeof cl?.status === 'string' ? cl.status.toLowerCase() : undefined);
  if (v === true || v === 'active') return 'active';
  if (v === false || v === 'inactive') return 'inactive';
  return 'unknown';
}

/** Recorded expiry (ISO date) or null. */
export const contractEnd = (p) => (hasContract(p?.contract) && parseDate(p.contract.end) ? p.contract.end : null);

/** Monthly salary from the recorded weekly wage, or null. */
export function monthlySalary(p) {
  const c = p?.contract;
  return hasContract(c) && typeof c.wage === 'number' && Number.isFinite(c.wage) ? monthlyFromWeekly(c.wage) : null;
}

/** Stored transfer valuation: "zero" is a recorded £0, "unset" isn't recorded. */
export const transferValue = (p) => (typeof p?.transfer_value === 'number' && Number.isFinite(p.transfer_value) ? p.transfer_value : (p?.transfer_value_state === 'zero' ? 0 : null));

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
  // Asking price: only from a dedicated field (the current extract has none).
  const askingRaw = p?.asking_price ?? p?.transfer?.asking_price ?? c?.asking_price;
  const tv = transferValue(p);
  const relegation = clausesOf(p, 'relegation')[0];

  return {
    contract: {
      end,
      remaining: end ? timeRemaining(gameDate, end) : null,
      monthly,
      monthlyText: monthly === null ? UNAVAILABLE : formatMoney(monthly),
    },
    transfer: {
      asking: formatMoney(askingRaw) || UNAVAILABLE,
      value: formatMoney(tv) || UNAVAILABLE,
      valueAmount: tv,
      release: clauseAmount(clausesOf(p, 'standard')[0]),
      foreign: clauseAmount(clausesOf(p, 'foreign')[0]),
      relegation: { ...clauseAmount(relegation), status: relegation ? clauseStatus(relegation) : null },
    },
  };
}
