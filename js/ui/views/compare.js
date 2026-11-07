// Comparison: two players side by side (attributes only for now).
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
  return h('div', { class: `cmp-col cmp-${side}` },
    h('a', { class: 'cmp-name', href: linkWithFrom(`/player/${encodeURIComponent(persistentId(p))}`, '/compare') }, name.main),
    res.current
      ? h('span', { class: 'cmp-meta' }, [pos, age !== null ? String(age) : null].filter(Boolean).join(' · ') || DASH)
      : h('span', { class: 'cmp-meta cmp-old' }, `Last recorded ${formatGameDate(res.model.gameDate)}`),
    h('button', { type: 'button', class: 'cmp-change', 'aria-label': `Change ${side} player (${name.main})`, onclick: () => pick(side, otherPid) }, 'Change player'));
}

function valueCell(v, def, who) {
  if (v === null) return h('span', { class: 'cmp-val' }, h('span', { class: 'attr-val none cmp-na', 'aria-label': `${def.label} unavailable for ${who}` }, DASH));
  const band = attrBand(v, attributeDirection(def.key));
  return h('span', { class: 'cmp-val' }, h('span', { class: `attr-val ${band || 'none'}`, 'aria-label': `${def.label} ${v} for ${who}` }, String(v)));
}

function row(def, block, L, R) {
  const get = (res) => intOrNull(res.player[block]?.[def.key]);
  const btn = h('button', {
    type: 'button', class: 'cmp-attr', 'aria-haspopup': 'dialog',
    onclick: () => openAttributeInfo(def, btn),
  }, def.label);
  return h('li', { class: 'cmp-row' }, valueCell(get(L), def, L.name), btn, valueCell(get(R), def, R.name));
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
  if (!L || !R) {
    content = h('div', { class: 'empty cmp-empty' },
      h('p', { class: 'empty-title' }, !L && !R ? 'Select two players to compare' : 'Select a second player'),
      h('p', { class: 'empty-text' }, !L && !R
        ? 'Choose a player for each column from your squads or shortlists to see their attributes side by side.'
        : 'Their attributes will appear side by side here.'));
  } else {
    // Profile order: goalkeeping first when both are goalkeepers.
    const bothGK = isNaturalGoalkeeper(L.player) && isNaturalGoalkeeper(R.player);
    const anyGK = isNaturalGoalkeeper(L.player) || isNaturalGoalkeeper(R.player);
    const order = bothGK ? ['goalkeeping', 'mental', 'physical', 'technical'] : ['technical', 'mental', 'physical', 'goalkeeping'];
    const groups = order.map((k) => ATTRIBUTE_GROUPS.find((g) => g.key === k)).map((g) => {
      const open = g.key === 'goalkeeping' ? anyGK : !(g.key === 'technical' && bothGK);
      return group(g.key, g.label, open, [h('ul', { class: 'cmp-list' }, g.attrs.map((a) => row(a, 'attributes', L, R)))]);
    });
    groups.push(group('hidden', 'Hidden attributes & personality', true, [
      h('p', { class: 'sub-head' }, 'Hidden attributes'),
      h('ul', { class: 'cmp-list' }, HIDDEN_ATTRS.map((a) => row(a, 'attributes', L, R))),
      h('p', { class: 'sub-head' }, 'Personality values'),
      h('ul', { class: 'cmp-list' }, PERSONALITY_ATTRS.map((a) => row(a, 'personality', L, R))),
    ]));
    content = h('section', { class: 'cmp-table', 'aria-label': `Attributes: ${L.name} (left) and ${R.name} (right)` }, groups);
  }

  return {
    title: 'Comparison',
    subtitle: model ? formatGameDate(model.gameDate) : '',
    back: '#/',
    body: h('div', { class: 'stack cmp' }, header, content),
  };
}
