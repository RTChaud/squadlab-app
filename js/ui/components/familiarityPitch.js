// Position-familiarity pitch (front to back), shared by the player profile
// and the Squad/Shortlists position sheet. Values come straight from the
// extract's `positions` block (sw is kept in the data but not drawn);
// missing values stay "—", never 0 or 1.
//
// With `onSelect`, tiles become buttons (role explorers): the selected tile
// gets an orange outline, and the familiarity colour stays.
// With `plain` (Tactic), tiles show only the position, no player values.
// With `pair` (Comparison), each tile shows both players' familiarity: left
// player's value on the left, right player's on the right, each in its colour.

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
 * @param {object} [o]  selected (code), onSelect(code), selectable(code) → bool, plain (no values),
 *                      pair [{ player, name } | null, { player, name } | null] (Comparison)
 * Returns the pitch element; with onSelect it also has setSelected(code).
 */
export function FamiliarityPitch(p, o = {}) {
  const famOf = (pl) => (pl?.positions && typeof pl.positions === 'object' ? pl.positions : {});
  const fam = famOf(p);
  const tiles = new Map();
  const pairTile = (code) => {
    const label = formatPositions([code]);
    const side = (x, cls) => {
      if (!x) return h('span', { class: `ptile-pv ${cls}` });
      const v = intOrNull(famOf(x.player)[code]);
      const band = famBand(v);
      return h('span', { class: `ptile-pv ${cls} ${band ? band.cls : 'fnone'}` }, v ?? DASH);
    };
    const said = o.pair.filter(Boolean).map((x) => `${x.name} ${intOrNull(famOf(x.player)[code]) ?? 'unavailable'}`).join(', ');
    const btn = h('button', {
      type: 'button', class: 'ptile ptile-btn ptile-pair', 'data-pos': code, 'aria-pressed': 'false',
      'aria-label': `${label}, familiarity ${said}: explore roles`, onclick: () => o.onSelect(code),
    }, h('span', { class: 'ptile-code' }, label), h('span', { class: 'ptile-pvs' }, side(o.pair[0], 'l'), side(o.pair[1], 'r')));
    tiles.set(code, btn);
    return btn;
  };
  const tile = (code) => {
    if (!code) return h('span', { class: 'ptile ptile-blank' });
    if (o.pair && o.onSelect) return pairTile(code);
    const v = intOrNull(fam[code]);
    const band = famBand(v);
    const label = formatPositions([code]);
    if (o.plain) {
      const sel = !o.selectable || o.selectable(code);
      if (!o.onSelect || !sel) return h('span', { class: 'ptile ptile-plain ptile-off', 'data-pos': code }, h('span', { class: 'ptile-code' }, label));
      const btn = h('button', {
        type: 'button', class: 'ptile ptile-btn ptile-plain', 'data-pos': code, 'aria-pressed': 'false',
        'aria-label': label, onclick: () => o.onSelect(code),
      }, h('span', { class: 'ptile-code' }, label));
      tiles.set(code, btn);
      return btn;
    }
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
