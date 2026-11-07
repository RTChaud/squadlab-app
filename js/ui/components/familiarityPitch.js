// Position-familiarity pitch (front to back), shared by the player profile
// and the Squad/Shortlists position sheet. Values come straight from the
// extract's `positions` block (sw is kept in the data but not drawn);
// missing values stay "—", never 0 or 1.

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

export function FamiliarityPitch(p) {
  const fam = p.positions && typeof p.positions === 'object' ? p.positions : {};
  const tile = (code) => {
    if (!code) return h('span', { class: 'ptile ptile-blank' });
    const v = intOrNull(fam[code]);
    const band = famBand(v);
    return h('span', { class: `ptile ${band ? band.cls : 'fnone'}`, title: `${formatPositions([code])}: ${v ?? DASH}` },
      h('span', { class: 'ptile-code' }, formatPositions([code])),
      h('span', { class: 'ptile-val' }, v ?? DASH));
  };
  return h('div', { class: 'pitch' }, PITCH.map((row) => h('div', { class: 'pitch-row' }, row.map(tile))));
}
