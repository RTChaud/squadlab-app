// Position-familiarity pitch (front to back), shared by the player profile
// and the Squad/Shortlists position sheet. Values come straight from the
// extract's `positions` block (sw is kept in the data but not drawn);
// missing values stay "—", never 0 or 1.
//
// With `onSelect`, tiles become buttons (the profile's role explorer): the
// selected tile gets an orange outline, and the familiarity colour stays.

import { h, DASH } from '../dom.js';
import { formatPositions, famBand } from '../../data/positions.js';
import { intOrNull } from '../../data/attributes.js';

const PITCH = [
  [null, 'stc', null],
  ['aml', 'amc', 'amr'],
  ['ml', 'mc', 'mr'],
  ['wbl', 'dm', 'wbr'],
  ['dl', 'dc', 'dr'],
  [null, 'gk', null],
];

/**
 * @param p player record
 * @param {object} [o]  selected (code), onSelect(code), selectable(code) → bool
 * Returns the pitch element; with onSelect it also has setSelected(code).
 */
export function FamiliarityPitch(p, o = {}) {
  const fam = p.positions && typeof p.positions === 'object' ? p.positions : {};
  const tiles = new Map();
  const tile = (code) => {
    if (!code) return h('span', { class: 'ptile ptile-blank' });
    const v = intOrNull(fam[code]);
    const band = famBand(v);
    const label = formatPositions([code]);
    const kids = [h('span', { class: 'ptile-code' }, label), h('span', { class: 'ptile-val' }, v ?? DASH)];
    if (!o.onSelect || (o.selectable && !o.selectable(code))) {
      return h('span', { class: `ptile ${band ? band.cls : 'fnone'}`, title: `${label}: ${v ?? DASH}` }, kids);
    }
    const btn = h('button', {
      type: 'button', class: `ptile ptile-btn ${band ? band.cls : 'fnone'}`, 'data-pos': code,
      'aria-pressed': 'false', 'aria-label': `${label}, familiarity ${v ?? 'unavailable'}: explore roles`,
      onclick: () => o.onSelect(code),
    }, kids);
    tiles.set(code, btn);
    return btn;
  };
  const el = h('div', { class: `pitch${o.onSelect ? ' pitch-select' : ''}` }, PITCH.map((row) => h('div', { class: 'pitch-row' }, row.map(tile))));
  el.setSelected = (code) => {
    for (const [c, b] of tiles) { const on = c === code; b.classList.toggle('ptile-sel', on); b.setAttribute('aria-pressed', String(on)); }
  };
  el.setSelected(o.selected ?? null);
  return el;
}
