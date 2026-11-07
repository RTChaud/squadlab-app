// Comparison: two players side by side (attributes only for now). With one
// player selected, their column is filled and the other waits for a selection.
// Each row shades the leading side and shows the gap as a bar (same scale on
// every row, full at 8 points).
// Rows: left value | shared attribute name | right value. Groups follow the
// player profile (order, grouping, colour rules) and open/close together.
// Selections are remembered per career; values are each player's latest
// recorded ones (a player missing from the latest snapshot shows "Last recorded").

import { h, icon, DASH } from '../dom.js';
import { getPlayerProfile, getCompare, setCompareSide, getModel } from '../../store.js';
import {
  ATTRIBUTE_GROUPS, HIDDEN_ATTRS, PERSONALITY_ATTRS, attrBand, attributeDirection, intOrNull,
} from '../../data/attributes.js';
import { isNaturalGoalkeeper } from '../../data/radar.js';
import { profileNameOf, persistentId } from '../../data/players.js';
import { describePositions } from '../../data/positions.js';
import { formatGameDate } from '../../data/snapshot.js';
import { openPlayerPicker } from '../components/playerPicker.js';
import { openAttributeInfo } from '../components/attributeInfoSheet.js';
import { linkWithFrom } from '../../router.js';

const SIDES = ['left', 'right'];
const openState = new Map(); // group key → open (session), so re-renders keep what you opened

function pick(side, otherPid) {
  openPlayerPicker({
    title: side === 'left' ? 'Select left player' : 'Select right player',
    otherPid,
    onPick: (pid) => setCompareSide(side, pid),
  });
}

function playerHead(side, res, otherPid) {
  if (!res) {
    return h('div', { class: `cmp-col cmp-${side} cmp-empty-col` },
      h('button', { type: 'button', class: 'btn btn-secondary cmp-select', onclick: () => pick(side, otherPid) }, icon('plus'), 'Select player'));
  }
  const p = res.player;
  const name = profileNameOf(p);
  const pos = describePositions(p).natural;
  const age = intOrNull(p.age);
  const ca = intOrNull(p.ability?.current);
  const paRaw = intOrNull(p.ability?.potential);
  const pa = paRaw !== null && paRaw > 0 ? paRaw : null; // ≤ 0 is an FM range code, not a PA
  // Each line sits on a shared grid row, so both columns stay level when a name wraps.
  return h('div', { class: `cmp-col cmp-${side}` },
    h('a', { class: 'cmp-name', href: linkWithFrom(`/player/${encodeURIComponent(persistentId(p))}`, '/compare') }, name.main),
    res.current
      ? h('span', { class: 'cmp-meta' }, [pos, age !== null ? String(age) : null].filter(Boolean).join(' · ') || DASH)
      : h('span', { class: 'cmp-meta cmp-old' }, `Last recorded ${formatGameDate(res.model.gameDate)}`),
    h('span', { class: 'cmp-capa', 'aria-label': `CA ${ca ?? 'unavailable'}, PA ${pa ?? 'unavailable'}` },
      'CA ', h('b', {}, ca !== null && ca >= 0 ? String(ca) : DASH), h('span', { class: 'cmp-capa-sep', 'aria-hidden': 'true' }, '·'),
      'PA ', h('b', { class: 'pa' }, pa !== null ? String(pa) : DASH)),
    h('div', { class: 'cmp-actions' },
      h('button', { type: 'button', class: 'cmp-change', 'aria-label': `Change ${side} player (${name.main})`, onclick: () => pick(side, otherPid) }, 'Change'),
      h('button', { type: 'button', class: 'cmp-remove', 'aria-label': `Remove ${name.main} from the comparison`, title: 'Remove', onclick: () => setCompareSide(side, null) }, icon('close'))));
}

function valueCell(v, def, res) {
  if (!res) return h('span', { class: 'cmp-val' }); // no player in this column yet
  if (v === null) return h('span', { class: 'cmp-val' }, h('span', { class: 'attr-val none cmp-na', 'aria-label': `${def.label} unavailable for ${res.name}` }, DASH));
  const band = attrBand(v, attributeDirection(def.key));
  return h('span', { class: 'cmp-val' }, h('span', { class: `attr-val ${band || 'none'}`, 'aria-label': `${def.label} ${v} for ${res.name}` }, String(v)));
}

const BAR_POINTS = 8; // every point adds the same length; 8+ fills the side

/**
 * Who leads on an attribute, using the profile's direction rules: higher wins,
 * lower wins for lower-is-better values, and tendencies, ties or missing values
 * have no leader.
 */
function leadOf(key, l, r) {
  if (l === null || r === null || l === r) return null;
  const dir = attributeDirection(key);
  if (dir === 'neutral') return null;
  const leftLeads = dir === 'negative' ? l < r : l > r;
  return { side: leftLeads ? 'left' : 'right', gap: Math.abs(l - r) };
}

function row(def, block, L, R) {
  const get = (res) => (res ? intOrNull(res.player[block]?.[def.key]) : null);
  const l = get(L), r = get(R);
  const lead = L && R ? leadOf(def.key, l, r) : null;
  const btn = h('button', {
    type: 'button', class: 'cmp-attr', 'aria-haspopup': 'dialog',
    onclick: () => openAttributeInfo(def, btn),
  }, def.label, lead ? h('span', { class: 'sr-only' }, `, ${(lead.side === 'left' ? L : R).name} leads by ${lead.gap}`) : null);
  const gapLabel = (side) => h('span', { class: `cmp-gap cmp-gap-${side}`, 'aria-hidden': 'true' },
    lead && lead.side === side && lead.gap >= 2 ? `+${lead.gap}` : '');
  const strength = !lead ? 0 : lead.gap >= 4 ? 3 : lead.gap >= 2 ? 2 : 1;
  const mid = h('div', { class: 'cmp-mid' }, gapLabel('left'), btn, gapLabel('right'),
    lead ? h('span', { class: 'cmp-bar', 'aria-hidden': 'true' },
      h('span', { class: 'cmp-bar-fill', style: `--w:${Math.min(lead.gap, BAR_POINTS) / BAR_POINTS}` })) : null);
  return h('li', { class: `cmp-row${lead ? ` lead-${lead.side} lead-s${strength}` : ''}`, 'data-key': def.key },
    valueCell(l, def, L), mid, valueCell(r, def, R));
}

function group(key, title, open, body) {
  const d = h('details', { class: 'group cmp-group', open: openState.has(key) ? openState.get(key) : open },
    h('summary', {}, h('span', {}, title)), ...body);
  d.addEventListener('toggle', () => openState.set(key, d.open));
  return d;
}

export async function CompareView() {
  const sel = getCompare();
  const [L, R] = await Promise.all(SIDES.map(async (s) => {
    const pid = sel[s];
    const res = pid ? await getPlayerProfile(pid) : null;
    return res ? { ...res, name: profileNameOf(res.player).main } : null;
  }));
  const model = getModel();

  const header = h('div', { class: 'cmp-head' },
    playerHead('left', L, sel.right),
    h('span', { class: 'cmp-vs', 'aria-hidden': 'true' }, 'vs'),
    playerHead('right', R, sel.left));

  let content;
  const present = [L, R].filter(Boolean);
  if (!present.length) {
    content = h('div', { class: 'empty cmp-empty' },
      h('p', { class: 'empty-title' }, 'Select two players to compare'),
      h('p', { class: 'empty-text' }, 'Choose a player for each column from your squads or shortlists to see their attributes side by side.'));
  } else {
    // Profile order: goalkeeping first when every selected player is a goalkeeper.
    const allGK = present.every((x) => isNaturalGoalkeeper(x.player));
    const anyGK = present.some((x) => isNaturalGoalkeeper(x.player));
    const order = allGK ? ['goalkeeping', 'mental', 'physical', 'technical'] : ['technical', 'mental', 'physical', 'goalkeeping'];
    const groups = order.map((k) => ATTRIBUTE_GROUPS.find((g) => g.key === k)).map((g) => {
      const open = g.key === 'goalkeeping' ? anyGK : !(g.key === 'technical' && allGK);
      return group(g.key, g.label, open, [h('ul', { class: 'cmp-list' }, g.attrs.map((a) => row(a, 'attributes', L, R)))]);
    });
    groups.push(group('hidden', 'Hidden attributes & personality', true, [
      h('p', { class: 'sub-head' }, 'Hidden attributes'),
      h('ul', { class: 'cmp-list' }, HIDDEN_ATTRS.map((a) => row(a, 'attributes', L, R))),
      h('p', { class: 'sub-head' }, 'Personality values'),
      h('ul', { class: 'cmp-list' }, PERSONALITY_ATTRS.map((a) => row(a, 'personality', L, R))),
    ]));
    const label = L && R ? `Attributes: ${L.name} (left) and ${R.name} (right)` : `Attributes: ${present[0].name} (${L ? 'left' : 'right'})`;
    content = h('section', { class: 'cmp-table', 'aria-label': label }, groups);
  }

  return {
    title: 'Comparison',
    subtitle: model ? formatGameDate(model.gameDate) : '',
    back: '#/',
    body: h('div', { class: 'stack cmp' }, header, content),
  };
}
