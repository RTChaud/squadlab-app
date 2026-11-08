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
