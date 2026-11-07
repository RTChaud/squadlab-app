// Comparison: two players side by side. With one player selected, their
// column is filled and the other waits for a selection.
//
// One "Compare by" selector drives both the radar and the attribute table:
//   All attributes      — overlaid Player overview radar (outfield or goalkeeper)
//                         + every attribute group, each with a Net advantage footer
//   Selected attributes — up to 8 picked attributes (shared picker) in the same
//                         order on the radar and in the table, one footer
//   Position / role     — placeholder until the role catalogue exists
// Rows: left value | shared attribute name | right value. The leading side is
// shaded and the gap drawn as a bar (same scale on every row, full at 8 points).
// Players, mode and selected attributes are remembered per career; values are
// each player's latest recorded ones ("Last recorded" in the header if older).

import { h, icon, DASH } from '../dom.js';
import { getPlayerProfile, getCompare, setCompareSide, setCompareView, getModel } from '../../store.js';
import {
  ATTRIBUTE_GROUPS, HIDDEN_ATTRS, PERSONALITY_ATTRS, attrBand, attributeDirection, intOrNull,
} from '../../data/attributes.js';
import {
  isNaturalGoalkeeper, overviewFor, computeAxis, computeSelected, SELECTABLE, MIN_SELECTED, MAX_SELECTED,
} from '../../data/radar.js';
import { profileNameOf, persistentId } from '../../data/players.js';
import { describePositions } from '../../data/positions.js';
import { formatGameDate } from '../../data/snapshot.js';
import { openPlayerPicker } from '../components/playerPicker.js';
import { openAttributeInfo } from '../components/attributeInfoSheet.js';
import { RadarCompareChart } from '../components/radarChart.js';
import { RadarAttributePicker } from '../components/radarAttributePicker.js';
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

/** Bar under the name: starts at the centre, one eighth of that side per point. */
const barEl = (lead) => h('span', { class: 'cmp-bar', 'aria-hidden': 'true' },
  h('span', { class: 'cmp-bar-fill', style: `--w:${Math.min(lead.gap, BAR_POINTS) / BAR_POINTS}` }));
const gapEl = (lead, side) => h('span', { class: `cmp-gap cmp-gap-${side}`, 'aria-hidden': 'true' },
  lead && lead.side === side ? `+${lead.gap}` : '');
const leadClass = (lead) => (lead ? ` lead-${lead.side} lead-s${lead.gap >= 4 ? 3 : lead.gap >= 2 ? 2 : 1}` : '');

/** `acc.net` collects the signed leads (left positive) for the group's summary. */
function row(def, block, L, R, acc) {
  const get = (res) => (res ? intOrNull(res.player[block]?.[def.key]) : null);
  const l = get(L), r = get(R);
  const lead = L && R ? leadOf(def.key, l, r) : null;
  const btn = h('button', {
    type: 'button', class: 'cmp-attr', 'aria-haspopup': 'dialog',
    onclick: () => openAttributeInfo(def, btn),
  }, def.label, lead ? h('span', { class: 'sr-only' }, `, ${(lead.side === 'left' ? L : R).name} leads by ${lead.gap}`) : null);
  if (lead && acc) acc.net += lead.side === 'left' ? lead.gap : -lead.gap;
  const mid = h('div', { class: 'cmp-mid' }, gapEl(lead, 'left'), btn, gapEl(lead, 'right'), lead ? barEl(lead) : null);
  return h('li', { class: `cmp-row${leadClass(lead)}`, 'data-key': def.key },
    valueCell(l, def, L), mid, valueCell(r, def, R));
}

/** Net of the group's leads, e.g. +3 and +2 left with +4 right → +1 left. */
function summaryRow(acc, title, L, R) {
  const lead = acc.net === 0 ? null : { side: acc.net > 0 ? 'left' : 'right', gap: Math.abs(acc.net) };
  const said = lead ? `Net advantage in ${title}: ${(lead.side === 'left' ? L : R).name} by ${lead.gap}` : `Net advantage in ${title}: level`;
  return h('ul', { class: 'cmp-list cmp-sum-list' },
    h('li', { class: `cmp-row cmp-sum${leadClass(lead)}`, 'aria-label': said },
      h('span', { class: 'cmp-val' }),
      h('div', { class: 'cmp-mid', 'aria-hidden': 'true' }, gapEl(lead, 'left'),
        h('span', { class: 'cmp-sum-label' }, lead ? 'Net advantage' : 'Net advantage · level'), gapEl(lead, 'right'), lead ? barEl(lead) : null),
      h('span', { class: 'cmp-val' })));
}

function group(key, title, open, body) {
  const d = h('details', { class: 'group cmp-group', open: openState.has(key) ? openState.get(key) : open },
    h('summary', {}, h('span', {}, title)), ...body);
  d.addEventListener('toggle', () => openState.set(key, d.open));
  return d;
}

const MODES = [
  { id: 'all', label: 'All attributes' },
  { id: 'selected', label: 'Selected attributes' },
  { id: 'role', label: 'Position / role' },
];

/** Every attribute group (profile order) with a Net advantage footer when both are selected. */
function allTable(L, R, present) {
  const allGK = present.every((x) => isNaturalGoalkeeper(x.player));
  const anyGK = present.some((x) => isNaturalGoalkeeper(x.player));
  const order = allGK ? ['goalkeeping', 'mental', 'physical', 'technical'] : ['technical', 'mental', 'physical', 'goalkeeping'];
  const both = !!(L && R);
  const groups = order.map((k) => ATTRIBUTE_GROUPS.find((g) => g.key === k)).map((g) => {
    const open = g.key === 'goalkeeping' ? anyGK : !(g.key === 'technical' && allGK);
    const acc = { net: 0 };
    const list = h('ul', { class: 'cmp-list' }, g.attrs.map((a) => row(a, 'attributes', L, R, acc)));
    return group(g.key, g.label, open, [list, both ? summaryRow(acc, g.label, L, R) : null]);
  });
  const acc = { net: 0 };
  const hiddenTitle = 'Hidden attributes & personality';
  groups.push(group('hidden', hiddenTitle, true, [
    h('p', { class: 'sub-head' }, 'Hidden attributes'),
    h('ul', { class: 'cmp-list' }, HIDDEN_ATTRS.map((a) => row(a, 'attributes', L, R, acc))),
    h('p', { class: 'sub-head' }, 'Personality values'),
    h('ul', { class: 'cmp-list' }, PERSONALITY_ATTRS.map((a) => row(a, 'personality', L, R, acc))),
    both ? summaryRow(acc, hiddenTitle, L, R) : null,
  ]));
  return groups;
}

/** The picked attributes, in pick order, with one Net advantage footer. */
function selectedTable(keys, L, R) {
  const acc = { net: 0 };
  const title = 'Selected attributes';
  const list = h('ul', { class: 'cmp-list' }, keys.map((k) => row(SELECTABLE[k], SELECTABLE[k].source, L, R, acc)));
  return [group('selected', title, true, [list, L && R ? summaryRow(acc, title, L, R) : null])];
}

const fmt1 = (v) => v.toFixed(1);
const seriesFor = (side, res, axes, fmt) => ({
  side, name: res.name,
  values: axes.map((a) => a.value),
  display: axes.map((a) => (a.value === null ? null : fmt(a.value))),
});

/**
 * Radar content for the current mode: a chart, or a short message when it
 * can't be drawn (mixed goalkeeper/outfield overview, fewer than 3 attributes).
 * Returns { subtitle, body: Node[] }.
 */
function radarContent(mode, keys, L, R, present, switchToSelected) {
  if (mode === 'all') {
    const gk = present.map((x) => isNaturalGoalkeeper(x.player));
    if (gk.length === 2 && gk[0] !== gk[1]) {
      return { subtitle: 'Overview', body: [h('div', { class: 'empty radar-empty cmp-radar-msg' },
        h('p', { class: 'empty-title' }, 'Different overview axes'),
        h('p', { class: 'empty-text' }, 'Goalkeeper and outfield overviews use different axes. Switch to Selected attributes to compare the same attributes for both.'),
        h('button', { type: 'button', class: 'btn btn-secondary cmp-radar-switch', onclick: switchToSelected }, 'Use Selected attributes'))] };
    }
    const o = overviewFor(present[0].player);
    const sides = [['left', L], ['right', R]].filter(([, res]) => res);
    const series = sides.map(([side, res]) => seriesFor(side, res, o.axes.map((a) => computeAxis(a, res.player)), fmt1));
    return { subtitle: o.title, body: [RadarCompareChart({ labels: o.axes.map((a) => a.label), series, ariaLabel: `${o.title}: ${series.map((x) => x.name).join(' and ')}` })] };
  }
  // selected
  if (keys.length < MIN_SELECTED) {
    return { subtitle: 'Selected attributes', body: [h('p', { class: 'muted small cmp-radar-note' },
      `The radar needs at least ${MIN_SELECTED} attributes (${keys.length} selected).`)] };
  }
  const sides = [['left', L], ['right', R]].filter(([, res]) => res);
  const series = sides.map(([side, res]) => seriesFor(side, res, computeSelected(res.player, keys), String));
  return { subtitle: 'Selected attributes', body: [RadarCompareChart({ labels: keys.map((k) => SELECTABLE[k].label.replace(/\s*\(Tendency\)$/, '')), series, ariaLabel: `Selected attributes: ${series.map((x) => x.name).join(' and ')}` })] };
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

  const present = [L, R].filter(Boolean);
  const page = (...kids) => ({
    title: 'Comparison',
    subtitle: model ? formatGameDate(model.gameDate) : '',
    back: '#/',
    body: h('div', { class: 'stack cmp' }, header, ...kids),
  });

  if (!present.length) {
    return page(h('div', { class: 'empty cmp-empty' },
      h('p', { class: 'empty-title' }, 'Select two players to compare'),
      h('p', { class: 'empty-text' }, 'Choose a player for each column from your squads or shortlists to see their attributes side by side.')));
  }

  // Mode and selected attributes are kept in the store (not re-rendered by it),
  // so picking an attribute updates the radar and table here, in place.
  let mode = sel.mode;
  let keys = [...sel.selected];
  const pickerSlot = h('div', { class: 'cmp-picker' });
  const content = h('div', { class: 'cmp-content' });

  const modeSelect = h('select', {
    class: 'select select-sm cmp-mode', id: 'cmp-mode',
    onchange: (e) => setMode(e.target.value),
  }, MODES.map((m) => h('option', { value: m.id, selected: m.id === mode }, m.label)));
  const controls = h('div', { class: 'cmp-controls' }, h('label', { class: 'cmp-mode-label', for: 'cmp-mode' }, 'Compare by'), modeSelect);

  function setMode(next) {
    mode = next;
    modeSelect.value = next;
    setCompareView({ mode });
    drawPicker();
    drawContent();
  }

  function drawPicker() {
    pickerSlot.replaceChildren(...(mode === 'selected' ? [RadarAttributePicker({
      selected: keys,
      onChange: (next) => { keys = [...next]; setCompareView({ selected: keys }); drawContent(); },
    })] : []));
  }

  function drawContent() {
    if (mode === 'role') {
      content.replaceChildren(h('div', { class: 'empty radar-empty' }, h('p', { class: 'empty-title' }, 'Role comparison coming soon')));
      return;
    }
    if (mode === 'selected' && !keys.length) {
      content.replaceChildren(h('div', { class: 'empty cmp-empty' },
        h('p', { class: 'empty-title' }, 'Choose attributes to compare'),
        h('p', { class: 'empty-text' }, `Pick up to ${MAX_SELECTED} attributes, including hidden and personality values.`)));
      return;
    }
    const radar = radarContent(mode, keys, L, R, present, () => setMode('selected'));
    const radarBox = group('radar', 'Radar', true, [h('div', { class: 'cmp-radar-body' }, radar.body)]);
    radarBox.classList.add('cmp-radar');
    radarBox.querySelector('summary > span').append(h('span', { class: 'cmp-radar-sub' }, radar.subtitle));
    const tables = mode === 'selected' ? selectedTable(keys, L, R) : allTable(L, R, present);
    const label = L && R ? `Attributes: ${L.name} (left) and ${R.name} (right)` : `Attributes: ${present[0].name} (${L ? 'left' : 'right'})`;
    content.replaceChildren(radarBox, h('section', { class: 'cmp-table', 'aria-label': label }, tables));
  }

  drawPicker();
  drawContent();
  return page(controls, pickerSlot, content);
}
