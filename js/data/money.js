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

const MAX_POUND_DIGITS = 13;
const group = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * Live formatting while an amount is typed: digits go into the pounds and the
 * field always reads "1,000.00" (typing another 0 gives "10,000.00"). Typing "."
 * moves into the pence, which are then overwritten. Deleting a comma or the
 * point deletes the digit next to it instead.
 *
 * @param {string} raw     the field's text after the edit
 * @param {number} caret   caret position in raw
 * @param {string} prev    the field's text before the edit
 * @param {string} inputType  the InputEvent's inputType ('' if unknown)
 * @returns {{ text: string, caret: number }}
 */
export function formatMoneyTyping(raw, caret, prev = '', inputType = '') {
  let s = String(raw ?? '').replace(/[^\d.]/g, (ch, i) => { if (i < caret) caret--; return ''; });
  const digitsOf = (t) => String(t).replace(/\D/g, '');
  const deleting = inputType.startsWith('delete');
  // Only a separator went: remove the neighbouring digit instead.
  if (deleting && prev && digitsOf(s) === digitsOf(prev) && s.replace(/\./g, '').length === digitsOf(s).length
      && (prev.includes('.') && !s.includes('.') || String(raw).length < prev.length)) {
    const back = inputType !== 'deleteContentForward';
    if (!s.includes('.') && prev.includes('.')) {
      // The point was deleted: put it back and treat it as deleting the pound digit before it.
      const p = caret;
      s = `${s.slice(0, p)}.${s.slice(p)}`;
      if (back) {
        const i = s.slice(0, p).search(/\d(?!.*\d)/);
        if (i >= 0) { s = s.slice(0, i) + s.slice(i + 1); caret = i; } else caret = p;
      } else caret = p + 1;
    } else {
      let i = back ? caret - 1 : caret;
      while (i >= 0 && i < s.length && !/\d/.test(s[i])) i += back ? -1 : 1;
      if (i >= 0 && i < s.length) { s = s.slice(0, i) + s.slice(i + 1); caret = back ? i : caret; }
    }
  }
  const dot = s.indexOf('.');
  let int = dot === -1 ? s : s.slice(0, dot);
  let dec = dot === -1 ? '' : s.slice(dot + 1).replace(/\./g, '');
  const inDec = dot !== -1 && caret > dot;
  let n = inDec ? int.length : Math.min(caret, int.length); // pound digits before the caret
  let m = inDec ? Math.max(0, caret - dot - 1 - (s.slice(dot + 1, caret).match(/\./g)?.length || 0)) : 0;
  // Pence: overwrite what follows the caret, then keep the last two.
  if (dec.length > 2 && inputType !== 'insertText') dec = dec.slice(0, 2); // pasted: keep the first two
  if (dec.length > 2) {
    const over = dec.length - 2;
    const after = dec.slice(m);
    const cut = Math.min(over, after.length);
    dec = dec.slice(0, m) + after.slice(cut);
    if (dec.length > 2) { const extra = dec.length - 2; dec = dec.slice(extra); m = Math.max(0, m - extra); }
  }
  m = Math.min(m, 2);
  // Pounds: drop leading zeros, cap the length.
  const lead = int.match(/^0+/)?.[0].length || 0;
  if (lead) { const keep = int.length === lead ? 1 : 0; int = int.slice(lead - keep); n = Math.max(0, n - (lead - keep)); }
  if (int.length > MAX_POUND_DIGITS) { int = int.slice(0, MAX_POUND_DIGITS); n = Math.min(n, MAX_POUND_DIGITS); }
  const typedPoint = dot !== -1 && !deleting && !prev.includes('.');
  if (!int && !/[1-9]/.test(dec) && !(typedPoint && s === '.')) {
    if (!int && !dec && !(dot !== -1 && !deleting)) return { text: '', caret: 0 };
    if (deleting || !dec) return { text: dot !== -1 && !deleting ? '0.00' : '', caret: dot !== -1 && !deleting ? 2 : 0 };
  }
  if (!int) { int = '0'; n = inDec ? 1 : 0; }
  const pounds = group(int);
  const text = `${pounds}.${dec.padEnd(2, '0')}`;
  let pos;
  if (inDec) pos = pounds.length + 1 + m;
  else { pos = 0; for (let seen = 0; pos < pounds.length && seen < n; pos++) if (/\d/.test(pounds[pos])) seen++; }
  return { text, caret: pos };
}
