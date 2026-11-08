// Money formatting, in one place. Amounts in this version are assumed to be GBP
// (the extract stores plain numbers). Every amount shows a pound sign, comma
// separators and exactly two decimals: £1,000.00, £74,256,000.00.

export const CURRENCY = 'GBP';

const FMT = new Intl.NumberFormat('en-GB', {
  style: 'currency', currency: CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 2,
});

/** Formatted amount, or null when the amount isn't a finite number. */
export function formatMoney(amount) {
  return typeof amount === 'number' && Number.isFinite(amount) ? FMT.format(amount) : null;
}

/** Weekly wage → monthly salary (× 52 ÷ 12); full precision, rounded only for display. */
export const monthlyFromWeekly = (weekly) => (typeof weekly === 'number' && Number.isFinite(weekly) ? (weekly * 52) / 12 : null);

/** Rounded to whole pence — what the formatted amount shows (used for comparisons). */
export const toPence = (amount) => Math.round(amount * 100) / 100;

/**
 * Amount typed by the user: "150000", "150,000.00", "£1,000" → number; '' → null;
 * anything else → NaN (invalid).
 */
export function parseMoney(text) {
  const t = String(text ?? '').replace(/[£,\s]/g, '');
  if (!t) return null;
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : NaN;
}

/** Amount for an input field: "150,000.00" (no £ sign — the field shows it). */
export const formatMoneyInput = (amount) => (typeof amount === 'number' && Number.isFinite(amount) ? FMT.format(amount).replace(/^£/, '') : '');
