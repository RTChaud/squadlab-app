// Radar section of the player profile: view dropdown + chart + details.
// Views: Player overview (default), Selected attributes, Position/role profile.
// Definitions/calculations live in data/radar.js; drawing in radarChart.js.

import { h, icon } from '../dom.js';
import { getRadarPrefs, saveRadarSelection } from '../../store.js';
import { scoreBand } from '../../data/attributes.js';
import {
  computeOverview, computeSelected, definitionText, overviewFor,
  SELECTABLE_GROUPS, SELECTABLE, MIN_SELECTED, MAX_SELECTED, interpretationNote,
} from '../../data/radar.js';
import { RadarChart } from './radarChart.js';
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
  let query = '';
  const wrap = h('div', { class: 'radar-selected' });

  const save = () => { saveRadarSelection(playerKey, selected); draw(); };
  const toggle = (k) => {
    if (selected.includes(k)) selected = selected.filter((x) => x !== k);
    else if (selected.length < MAX_SELECTED) selected = [...selected, k]; // appended: axis order = selection order
    save();
  };

  const search = h('input', {
    type: 'search', class: 'picker-search', placeholder: 'Search attributes', 'aria-label': 'Search attributes',
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    oninput: (e) => { query = e.target.value.trim().toLowerCase(); drawList(); },
  });
  const chips = h('div', { class: 'chips' });
  const list = h('div', { class: 'picker-list radar-options' });
  const panel = h('div', { class: 'picker-panel' }, search, list);
  const chartArea = h('div', { class: 'radar-chart-area' });
  let open = selected.length < MIN_SELECTED;
  const toggleBtn = h('button', { type: 'button', class: 'btn btn-secondary picker-toggle', onclick: () => { open = !open; drawPanel(); } });
  function drawPanel() {
    panel.hidden = !open;
    toggleBtn.replaceChildren(icon(open ? 'check' : 'plus'), open ? 'Done' : 'Add or change attributes');
    toggleBtn.setAttribute('aria-expanded', String(open));
  }
  wrap.append(chips, toggleBtn, panel, chartArea);

  function drawChips() {
    const nodes = selected.map((k) => h('span', { class: 'chip' },
      h('span', {}, SELECTABLE[k].label, interpretationNote(k) ? ' †' : ''),
      h('button', { type: 'button', class: 'chip-x', 'aria-label': `Remove ${SELECTABLE[k].label}`, onclick: () => toggle(k) }, '×')));
    nodes.push(h('span', { class: `chip-count${selected.length >= MAX_SELECTED ? ' full' : ''}` }, `${selected.length} / ${MAX_SELECTED}`));
    chips.replaceChildren(...nodes);
  }

  function drawList() {
    const keepScroll = list.scrollTop;
    const full = selected.length >= MAX_SELECTED;
    const groups = SELECTABLE_GROUPS.map((g) => {
      const attrs = g.attrs.filter((a) => !query || a.label.toLowerCase().includes(query));
      if (!attrs.length) return null;
      return h('div', { class: 'opt-group' }, h('p', { class: 'opt-head' }, g.label), attrs.map((a) => {
        const on = selected.includes(a.key);
        const disabled = !on && full;
        return h('label', { class: `opt${disabled ? ' disabled' : ''}` },
          h('input', { type: 'checkbox', checked: on, disabled, onchange: () => toggle(a.key) }),
          h('span', {}, a.label, interpretationNote(a.key) ? h('span', { class: 'muted' }, ' †') : null));
      }));
    }).filter(Boolean);
    list.replaceChildren(...[
      full ? h('p', { class: 'picker-note' }, `Maximum of ${MAX_SELECTED} reached — remove one to add another.`) : null,
      ...(groups.length ? groups : [h('p', { class: 'muted small' }, 'No matching attributes.')]),
    ].filter(Boolean));
    list.scrollTop = keepScroll;
  }

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

  function draw() { drawChips(); drawList(); drawChart(); }
  drawPanel();
  draw();
  return [wrap];
}

function roleView() {
  // Future: separate In Possession / Out of Possession position + role
  // selectors, one radar per phase (stacked), key attributes as axes with
  // primary/supporting distinction and familiarity alongside — driven by
  // ROLE_PROFILES in data/radar.js. Nothing is shown until those exist.
  return [h('div', { class: 'empty radar-empty' }, h('p', { class: 'empty-title' }, 'Role profiles coming soon.'))];
}

/** @param p player record (same snapshot as the rest of the profile) */
export function RadarSection(p, playerKey) {
  if (session.hash !== location.hash) session = { hash: location.hash, view: 'overview' };
  const body = h('div', { class: 'radar-body' });
  const info = h('button', { type: 'button', class: 'info-btn', 'aria-label': 'About this radar', onclick: () => infoSheet(p) }, 'i');
  const select = h('select', { class: 'select select-sm radar-view', 'aria-label': 'Radar view',
    onchange: (e) => { session.view = e.target.value; render(); } },
    VIEWS.map((v) => h('option', { value: v.id, selected: v.id === session.view }, v.label)));

  function render() {
    info.hidden = session.view === 'role';
    const content = session.view === 'selected' ? selectedView(p, playerKey)
      : session.view === 'role' ? roleView() : overviewView(p);
    body.replaceChildren(...content.filter(Boolean));
  }
  render();

  return h('section', { class: 'psection radar-section' },
    h('div', { class: 'radar-head' }, h('h3', {}, 'Radar'), select, info),
    body);
}
