// Comparison: two players side by side. With one player selected, their
// column is filled and the other waits for a selection.
//
// One "Compare by" selector drives both the radar and the attribute table:
//   All attributes      — overlaid Player overview radar (outfield or goalkeeper)
//                         + every attribute group, each with a Net advantage footer
//   Selected attributes — up to 8 picked attributes (shared picker) in the same
//                         order on the radar and in the table, one footer
//   Position / role     — tap a position on the shared familiarity grid (both
//                         players' values per tile; tap again to close), then
//                         In Possession and Out of Possession one after the other:
//                         role dropdown (sorted by score), Role attributes /100,
//                         overlaid radar and the role's attributes with Net advantage
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
import { openRoleInfo } from '../components/roleControls.js';
import { FamiliarityPitch } from '../components/familiarityPitch.js';
import {
  PHASES, loadRoleCatalogue, positionByCode, rolesFor, roleScore, roleValue, fmtScore,
} from '../../data/roles.js';
import { formatPositions } from '../../data/positions.js';
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

// ---- Position / role ------------------------------------------------------------------
// One position (tapped on the shared grid) and, for each phase, one role applied
// to both players. The last role per position + phase is remembered. The role's
// attributes drive that phase's radar, table and Net advantage; the Role
// attributes /100 score is shown per player.

/** Score row: verdict only when both players have a score (full precision). */
function scoreRow(L, R, sL, sR) {
  const both = !!(L && R);
  const decided = both && sL.value !== null && sR.value !== null;
  const diff = decided ? sL.value - sR.value : 0;
  const lead = decided && diff !== 0 ? { side: diff > 0 ? 'left' : 'right', gap: Math.abs(diff) } : null;
  const cell = (res, s) => h('span', { class: 'cmp-val' }, res
    ? h('span', { class: `role-cmp-score${s.value === null ? ' none' : ''}` }, s.value === null ? DASH : fmtScore(s.value))
    : null);
  const verdict = !both ? null : !decided ? 'undecided' : lead ? null : 'level';
  const gap = (side) => h('span', { class: `cmp-gap cmp-gap-${side}`, 'aria-hidden': 'true' }, lead && lead.side === side ? `+${fmtScore(lead.gap)}` : '');
  const said = !both ? `Role attributes out of 100: ${(L || R).name} ${(L ? sL : sR).value === null ? 'unavailable' : fmtScore((L ? sL : sR).value)}`
    : `Role attributes out of 100: ${L.name} ${sL.value === null ? 'unavailable' : fmtScore(sL.value)}, ${R.name} ${sR.value === null ? 'unavailable' : fmtScore(sR.value)}${lead ? `; ${(lead.side === 'left' ? L : R).name} leads by ${fmtScore(lead.gap)}` : decided ? '; level' : '; verdict undecided'}`;
  return h('li', { class: `cmp-row role-score-row${lead ? ` lead-${lead.side} lead-s2` : ''}`, 'aria-label': said },
    cell(L, sL),
    h('div', { class: 'cmp-mid', 'aria-hidden': 'true' }, gap('left'),
      h('span', { class: 'role-row-label' }, 'Role attributes', h('span', { class: 'role-row-sub' }, verdict === 'undecided' ? 'out of 100 · undecided' : verdict === 'level' ? 'out of 100 · level' : 'out of 100')),
      gap('right')),
    cell(R, sR));
}

/** Role dropdown for one phase: options sorted by the players' average score (highest first). */
function rolePick(cat, pos, phase, role, L, R, onPick) {
  const sides = [L, R].filter(Boolean);
  const scoresOf = (r) => sides.map((res) => roleScore(r, res.player).value);
  const avg = (r) => { const v = scoresOf(r).filter((x) => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : -1; };
  const roles = [...rolesFor(cat, pos, phase.id)].sort((a, b) => avg(b) - avg(a) || a.name.localeCompare(b.name));
  const select = h('select', {
    class: 'role-pick-select', 'data-phase-select': phase.id, 'aria-label': `${phase.label} role`,
    onchange: (e) => onPick(e.target.value || null),
  },
    h('option', { value: '', selected: !role }, 'Choose a role'),
    roles.map((r) => h('option', { value: r.id, selected: role?.id === r.id }, `${r.name} · ${scoresOf(r).map(fmtScore).join(' / ')}`)));
  return h('div', { class: `role-pick${role ? '' : ' role-pick-none'}` },
    h('span', { class: 'role-pick-name' }, role ? role.name : 'Choose a role'),
    h('span', { class: 'role-pick-chev', 'aria-hidden': 'true' }),
    select);
}

function phaseBody(role, phase, L, R) {
  const sL = L ? roleScore(role, L.player) : null;
  const sR = R ? roleScore(role, R.player) : null;
  const summary = h('ul', { class: 'cmp-list role-cmp-summary' }, scoreRow(L, R, sL, sR));

  // Radar: the role's attributes, same order for both players.
  const sides = [['left', L], ['right', R]].filter(([, res]) => res);
  const series = sides.map(([side, res]) => {
    const values = role.attrs.map((a) => roleValue(res.player, a));
    return { side, name: res.name, values, display: values.map((x) => (x === null ? null : String(x))) };
  });
  const radar = RadarCompareChart({ labels: role.attrs.map((a) => a.label), series, ariaLabel: `${phase.label}, ${role.name}: ${series.map((x) => x.name).join(' and ')}` });
  const radarBox = group(`role-radar:${phase.id}`, 'Radar', true, [h('div', { class: 'cmp-radar-body' }, radar)]);
  radarBox.classList.add('cmp-radar');
  radarBox.querySelector('summary > span').append(h('span', { class: 'cmp-radar-sub' }, role.name));

  // Table: only this role's attributes; tendencies stay neutral (no lead, not in the net).
  const acc = { net: 0 };
  const title = `${phase.label}: ${role.name}`;
  const rows = role.attrs.map((a) => row({ key: a.key, label: a.label }, a.block, L, R, acc));
  const table = group(`role-table:${phase.id}`, 'Key attributes', true, [
    h('ul', { class: 'cmp-list' }, rows),
    L && R ? summaryRow(acc, title, L, R) : null,
  ]);
  return [summary, radarBox, h('section', { class: 'cmp-table', 'aria-label': `${title} attributes` }, table)];
}

/** Position grid + both phases, one after the other. */
function roleMode(cat, L, R) {
  let pos = getCompare().rolePos;
  const panel = h('div', { class: 'cmp-roles', 'aria-live': 'polite' });
  const pitch = FamiliarityPitch(null, {
    pair: [L, R],
    selected: pos,
    onSelect: (code) => {
      pos = code === pos ? null : code; // tapping the selected tile again closes the roles
      pitch.setSelected(pos);
      setCompareView({ rolePos: pos });
      draw();
    },
  });

  /** The remembered role for this position + phase, if the catalogue still lists it. */
  function savedRole(phase) {
    const id = getCompare().roleByPos?.[pos]?.[phase];
    return id ? rolesFor(cat, pos, phase).find((r) => r.id === id) || null : null;
  }
  function saveRole(phase, id) {
    const byPos = { ...getCompare().roleByPos };
    byPos[pos] = { ...byPos[pos], [phase]: id };
    if (!id) delete byPos[pos][phase];
    setCompareView({ roleByPos: byPos });
  }

  function phaseSection(phase) {
    const el = h('section', { class: 'cmp-phase', 'data-phase': phase.id });
    const drawPhase = () => {
      const role = savedRole(phase.id);
      el.replaceChildren(h('h3', { class: 'cmp-phase-title' }, phase.label),
        rolePick(cat, pos, phase, role, L, R, (id) => { saveRole(phase.id, id); drawPhase(); }),
        ...(role ? phaseBody(role, phase, L, R) : []));
    };
    drawPhase();
    return el;
  }

  function draw() {
    if (!pos) { panel.replaceChildren(h('p', { class: 'muted small role-hint' }, 'Tap a position to explore roles.')); return; }
    const position = positionByCode(cat, pos);
    if (!position) {
      panel.replaceChildren(h('p', { class: 'muted small role-hint' }, `The role catalogue has no roles for ${formatPositions([pos])}.`));
      return;
    }
    const info = h('button', {
      type: 'button', class: 'info-btn', 'aria-label': 'Role descriptions', 'aria-haspopup': 'dialog',
      onclick: () => openRoleInfo(position, Object.fromEntries(PHASES.map((ph) => [ph.id, savedRole(ph.id)]))),
    }, 'i');
    panel.replaceChildren(h('div', { class: 'role-x-head' }, h('h3', { class: 'cmp-roles-head' }, 'Roles · ', h('span', { class: 'role-x-pos' }, position.short)), info),
      ...PHASES.map(phaseSection));
  }
  draw();
  return [pitch, panel];
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
  const cat = await loadRoleCatalogue();
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
      content.replaceChildren(...(cat.error
        ? [h('div', { class: 'empty radar-empty' }, h('p', { class: 'empty-title' }, cat.error))]
        : roleMode(cat, L, R)));
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
