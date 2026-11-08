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
const hasContract = (c) => !!c && typeof c === 'object' && c.end_source !== 'none';

const clauseOf = (c, test) => (Array.isArray(c?.clauses) ? c.clauses.find((x) => x && typeof x.kind === 'string' && test(x.kind)) : undefined);

/** Amount cell for a clause: dash when not decoded, "Unavailable" when its amount is missing. */
function clauseAmount(cl) {
  if (!cl) return { text: null, state: 'none' };
  const text = formatMoney(cl.value);
  return text ? { text, state: 'ok' } : { text: UNAVAILABLE, state: 'unavailable' };
}

/** Relegation release status: only from an explicit flag in the snapshot. */
function clauseStatus(cl) {
  const v = cl?.active ?? cl?.is_active ?? (typeof cl?.status === 'string' ? cl.status.toLowerCase() : undefined);
  if (v === true || v === 'active') return 'active';
  if (v === false || v === 'inactive') return 'inactive';
  return 'unknown';
}

/**
 * @param p player record (the profile's snapshot)
 * @param gameDate that snapshot's in-game date
 */
export function contractDetails(p, gameDate) {
  const c = p?.contract;
  const ok = hasContract(c);

  const end = ok && parseDate(c.end) ? c.end : null;
  const wage = ok && typeof c.wage === 'number' && Number.isFinite(c.wage) ? c.wage : null;

  // Asking price: only from a dedicated field (the current extract has none).
  const askingRaw = p?.asking_price ?? p?.transfer?.asking_price ?? c?.asking_price;
  // Transfer value: the stored valuation; "zero" is a recorded £0, "unset" isn't recorded.
  const tv = typeof p?.transfer_value === 'number' ? p.transfer_value : (p?.transfer_value_state === 'zero' ? 0 : null);

  const standard = clauseOf(c, (k) => k === 'minimum_fee_release');
  const foreign = clauseOf(c, (k) => /release/.test(k) && /foreign/.test(k));
  const relegation = clauseOf(c, (k) => k === 'relegation_release');

  return {
    contract: {
      end,
      remaining: end ? timeRemaining(gameDate, end) : null,
      monthly: wage === null ? null : monthlyFromWeekly(wage),
      monthlyText: wage === null ? UNAVAILABLE : formatMoney(monthlyFromWeekly(wage)),
    },
    transfer: {
      asking: formatMoney(askingRaw) || UNAVAILABLE,
      value: formatMoney(tv) || UNAVAILABLE,
      release: clauseAmount(standard),
      foreign: clauseAmount(foreign),
      relegation: { ...clauseAmount(relegation), status: relegation ? clauseStatus(relegation) : null },
    },
  };
}
