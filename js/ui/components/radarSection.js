// Radar section of the player profile: view dropdown + chart + details.
// Views: Player overview (default), Selected attributes, Position/role profile
// (role catalogue + shared Role attributes /100 score: data/roles.js).
// Definitions/calculations live in data/radar.js; drawing in radarChart.js.

import { h, DASH } from '../dom.js';
import { getRadarPrefs, saveRadarSelection, saveRadarRole } from '../../store.js';
import { scoreBand, attrBand, attributeDirection } from '../../data/attributes.js';
import {
  PHASES, loadRoleCatalogue, validateSelection, positionByCode, familiarityAt, roleScore, roleValue,
  fmtScore, scoreBreakdown,
} from '../../data/roles.js';
import { RoleSelectors, rolePrompt, famChip, openRoleInfo } from './roleControls.js';
import { openAttributeInfo } from './attributeInfoSheet.js';
import {
  computeOverview, computeSelected, definitionText, overviewFor, MIN_SELECTED, MAX_SELECTED,
} from '../../data/radar.js';
import { RadarChart } from './radarChart.js';
import { RadarAttributePicker } from './radarAttributePicker.js';
import { openSheet } from './sheet.js';

const VIEWS = [
  { id: 'overview', label: 'Player overview' },
  { id: 'selected', label: 'Selected attributes' },
  { id: 'role', label: 'Position/role profile' },
];

// Keep the chosen view while the same page re-renders (e.g. after editing
// tags); any navigation resets it, so opening a player starts on the overview.
let session = { hash: null, view: 'overview' };
window.addEventListener('hashchange', () => { session = { hash: null, view: 'overview' }; });

const fmt1 = (v) => v.toFixed(1);

function infoSheet(p) {
  const o = overviewFor(p);
  openSheet({
    title: 'About this radar',
    content: [
      h('p', { class: 'sheet-text' }, 'The overview is a SquadLab calculation from the agreed attribute weights. It is not FM’s own polygon or role rating.'),
      h('p', { class: 'sheet-text' }, 'It covers a selection of attributes only (every attribute is still in the tables below) and is not an overall player rating — the shape’s area is not a score.'),
      h('p', { class: 'sheet-text' }, 'All charts use the same fixed 1–20 scale. If an input is missing, that axis shows “Unavailable” instead of a guess.'),
      h('p', { class: 'sheet-sub' }, o.title),
      h('ul', { class: 'sheet-list radar-defs' }, o.axes.map((a) => h('li', {}, h('b', {}, a.label), ` — ${definitionText(a)}`))),
    ],
    actions: [{ label: 'Close', kind: 'secondary', onClick: (close) => close() }],
  });
}

/**
 * Chart + tap readout (shown once an axis is tapped). A visually hidden list
 * gives screen readers every plotted value.
 */
function chartBlock(axes, { title, describe }) {
  const readout = h('div', { class: 'radar-readout', 'aria-live': 'polite', hidden: true });
  const coloured = axes.map((a) => ({ ...a, band: scoreBand(a.value, a.direction || 'positive') }));
  // Bands assume "higher is better" on every axis, so they are hidden as soon
  // as any axis is a tendency, context-dependent or reversed.
  const showBands = axes.every((a) => (a.direction || 'positive') === 'positive');
  const chart = RadarChart({
    axes: coloured.map((a) => ({ label: a.label, value: a.value, display: a.display, marker: a.note ? '†' : '', band: a.band })),
    ariaLabel: title,
    showBands,
    onSelect: (i) => { readout.hidden = false; readout.replaceChildren(...describe(axes[i]).filter(Boolean)); },
  });
  const srList = h('ul', { class: 'sr-only' }, axes.map((a) =>
    h('li', {}, `${a.label}: ${a.value === null ? 'Unavailable' : a.display}${a.formula ? ` (${a.formula})` : ''}${a.note ? ` — ${a.note}` : ''}`)));
  const hasNotes = axes.some((a) => a.note);
  return [chart.el, srList, readout, hasNotes ? h('p', { class: 'muted small radar-foot' }, '† Higher isn’t necessarily better for this attribute.') : null];
}

function overviewView(p) {
  const o = computeOverview(p);
  const axes = o.axes.map((a) => ({ ...a, display: a.value === null ? null : fmt1(a.value) }));
  return chartBlock(axes, {
    title: o.title,
    describe: (a) => [
      h('span', { class: 'ro-title' }, a.label, ' ', h('b', {}, a.value === null ? 'Unavailable' : a.display)),
      h('span', { class: 'ro-formula' }, a.formula),
      a.missing.length ? h('span', { class: 'ro-note' }, `Missing: ${a.missing.join(', ')}`) : null,
    ],
  });
}

function selectedView(p, playerKey) {
  let selected = [...getRadarPrefs(playerKey).selected];
  const chartArea = h('div', { class: 'radar-chart-area' });
  const picker = RadarAttributePicker({
    selected,
    onChange: (next) => { selected = next; saveRadarSelection(playerKey, selected); drawChart(); },
  });

  function drawChart() {
    if (selected.length < MIN_SELECTED) {
      chartArea.replaceChildren(h('div', { class: 'empty radar-empty' },
        h('p', { class: 'empty-title' }, `Select at least ${MIN_SELECTED} attributes`),
        h('p', { class: 'empty-text' }, `${selected.length} selected · choose up to ${MAX_SELECTED}. Axes follow the order you pick them in.`)));
      return;
    }
    const axes = computeSelected(p, selected).map((a) => ({ ...a, display: a.value === null ? null : String(a.value) }));
    chartArea.replaceChildren(...chartBlock(axes, {
      title: 'Selected attributes',
      describe: (a) => [
        h('span', { class: 'ro-title' }, `${a.label} (${a.group})`, ' ', h('b', {}, a.value === null ? 'Unavailable' : a.display)),
        a.note ? h('span', { class: 'ro-note' }, a.note) : null,
      ],
    }).filter(Boolean));
  }

  drawChart();
  return [h('div', { class: 'radar-selected' }, picker, chartArea)];
}

// ---- Position/role profile ---------------------------------------------------------
// Two stacked phases, each with its own position + role. Any position can be
// explored, whatever the player's familiarity. Selections are remembered per
// player and checked against the active catalogue when shown.

function rolePhase(p, playerKey, cat, phase) {
  const saved = getRadarPrefs(playerKey).roles?.[phase.id];
  const v = validateSelection(cat, phase.id, saved);
  let sel = { position: v.position, role: v.role };
  let cleared = v.cleared;
  if (cleared) saveRadarRole(playerKey, phase.id, sel); // drop what the catalogue no longer has

  const el = h('section', { class: 'role-phase', 'data-phase': phase.id });
  function draw() {
    const selectors = RoleSelectors({
      cat, phase: phase.id, sel,
      onChange: (next, { clearedRole }) => {
        sel = next;
        cleared = clearedRole ? { reason: 'role', roleName: clearedRole.name } : null;
        saveRadarRole(playerKey, phase.id, sel);
        draw();
      },
    });
    const role = sel.role ? cat.roles.get(sel.role) : null;
    el.replaceChildren(h('h4', { class: 'role-phase-title' }, phase.label), selectors,
      ...(role ? roleBody(p, cat, role) : [rolePrompt(cat, phase.label, sel, cleared)]).filter(Boolean));
  }
  draw();
  return el;
}

function roleBody(p, cat, role) {
  const pos = positionByCode(cat, role.position);
  const fam = familiarityAt(p, role.position);
  const score = roleScore(role, p);
  const summary = h('div', { class: 'role-summary' },
    h('div', { class: 'role-stat' }, h('span', { class: 'role-stat-label' }, `Familiarity · ${pos.short}`), famChip(fam)),
    h('div', { class: 'role-stat' }, h('span', { class: 'role-stat-label' }, 'Role attributes'),
      h('span', { class: `role-score${score.value === null ? ' none' : ''}` }, score.value === null ? 'Unavailable' : `${fmtScore(score.value)}/100`)));
  const axes = role.attrs.map((a) => {
    const value = roleValue(p, a);
    const direction = a.tendency ? 'neutral' : (a.mapped ? attributeDirection(a.key) : 'positive');
    return { label: a.label, value, display: value === null ? null : String(value), direction,
      note: a.tendency ? 'Tendency — shown, not scored.' : null, group: a.tier === 'supporting' ? 'Supporting' : 'Key attribute' };
  });
  const chart = axes.filter((a) => a.value !== null).length >= 3
    ? chartBlock(axes, {
      title: `${role.name} key attributes`,
      describe: (a) => [h('span', { class: 'ro-title' }, a.label, ' ', h('b', {}, a.value === null ? 'Unavailable' : a.display)), a.note ? h('span', { class: 'ro-note' }, a.note) : null],
    })
    : [h('p', { class: 'muted small role-chart-note' }, `Not enough recorded values to draw this role (${axes.filter((a) => a.value !== null).length} of ${axes.length}).`)];
  const list = h('ul', { class: 'attr-list role-attrs' }, role.attrs.map((a) => {
    const value = roleValue(p, a);
    const band = a.tendency ? null : attrBand(value, a.mapped ? attributeDirection(a.key) : 'positive');
    const btn = h('button', { type: 'button', class: 'attr-name', 'aria-haspopup': 'dialog', onclick: () => openAttributeInfo({ key: a.key, label: a.label }, btn) },
      a.label, a.tier === 'supporting' ? h('span', { class: 'muted' }, ' · supporting') : null, a.tendency ? h('span', { class: 'muted' }, ' †') : null);
    return h('li', { class: 'attr' }, h('span', { class: 'attr-mark', 'aria-hidden': 'true' }), btn,
      h('span', { class: `attr-val ${band || 'none'}` }, value ?? DASH));
  }));
  const breakdown = h('div', { class: 'role-breakdown' }, scoreBreakdown(score).map((t) => h('p', {}, t)));
  return [summary, ...chart.filter(Boolean), list, breakdown];
}

function roleView(p, playerKey) {
  const wrap = h('div', { class: 'role-view' }, h('p', { class: 'muted small' }, 'Loading roles…'));
  loadRoleCatalogue().then((cat) => {
    if (cat.error) { wrap.replaceChildren(h('div', { class: 'empty radar-empty' }, h('p', { class: 'empty-title' }, cat.error))); return; }
    wrap.replaceChildren(...PHASES.map((ph) => rolePhase(p, playerKey, cat, ph)));
  });
  return [wrap];
}

/** @param p player record (same snapshot as the rest of the profile) */
export function RadarSection(p, playerKey) {
  if (session.hash !== location.hash) session = { hash: location.hash, view: 'overview' };
  const body = h('div', { class: 'radar-body' });
  const info = h('button', {
    type: 'button', class: 'info-btn', 'aria-label': 'About this radar',
    onclick: () => (session.view === 'role' ? loadRoleCatalogue().then(openRoleInfo) : infoSheet(p)),
  }, 'i');
  const select = h('select', { class: 'select select-sm radar-view', 'aria-label': 'Radar view',
    onchange: (e) => { session.view = e.target.value; render(); } },
    VIEWS.map((v) => h('option', { value: v.id, selected: v.id === session.view }, v.label)));

  function render() {
    info.setAttribute('aria-label', session.view === 'role' ? 'About Role attributes /100 and the role catalogue' : 'About this radar');
    const content = session.view === 'selected' ? selectedView(p, playerKey)
      : session.view === 'role' ? roleView(p, playerKey) : overviewView(p);
    body.replaceChildren(...content.filter(Boolean));
  }
  render();

  return h('section', { class: 'psection radar-section' },
    h('div', { class: 'radar-head' }, h('h3', {}, 'Radar'), select, info),
    body);
}
