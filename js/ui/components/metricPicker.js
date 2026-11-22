// Compact searchable multi-select for development metrics:
// selected chips (tap × to remove) + an expandable, grouped, searchable list.

import { h, icon } from '../dom.js';
import { ATTRIBUTE_GROUPS } from '../../data/attributes.js';
import { swatch } from './devChart.js';

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/**
 * @param {object} o
 *   selected  { ca: boolean, attrs: [{ key, slot }] }
 *   series    (key) => { label, color, shape }  — current styling per metric
 *   maxAttrs  number
 *   onChange  (nextSelected) => void
 *   change    optional (key) => { from, to, delta, firstDate, lastDate, partial } | null
 *             net change over the graph's date range, shown on every list row
 *   good      optional (key, delta) => true | false | null  (desirability; null = neutral)
 *   dates     optional (firstDate, lastDate) => string  (for a row whose values
 *             cover less than the graph's range)
 */
export function MetricPicker(o) {
  const { selected } = o;
  let query = '';
  let open = false;

  const root = h('div', { class: 'picker' });
  const chips = h('div', { class: 'chips' });
  const panel = h('div', { class: 'picker-panel', hidden: true });
  const search = h('input', {
    type: 'search', class: 'picker-search', placeholder: 'Search attributes', 'aria-label': 'Search metrics',
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    oninput: (e) => { query = e.target.value.trim().toLowerCase(); renderList(); },
  });
  const list = h('div', { class: 'picker-list' });
  const toggle = h('button', { type: 'button', class: 'btn btn-secondary picker-toggle', 'aria-expanded': 'false',
    onclick: () => setOpen(!open) });

  const attrCount = () => selected.attrs.length;
  const isSel = (key) => (key === 'ca' ? selected.ca : selected.attrs.some((a) => a.key === key));

  function change(next) { o.onChange(next); }

  function toggleKey(key) {
    if (key === 'ca') return change({ ...selected, ca: !selected.ca });
    if (isSel(key)) return change({ ...selected, attrs: selected.attrs.filter((a) => a.key !== key) });
    if (attrCount() >= o.maxAttrs) return;
    // Colour follows the metric: take the first free slot, never repaint others.
    const used = new Set(selected.attrs.map((a) => a.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    return change({ ...selected, attrs: [...selected.attrs, { key, slot }] });
  }

  function setOpen(v) {
    open = v;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.replaceChildren(icon(open ? 'check' : 'plus'), open ? 'Done' : 'Add or change metrics');
    if (open) { renderList(); }
  }

  function renderChips() {
    const items = [];
    if (selected.ca) items.push('ca');
    selected.attrs.forEach((a) => items.push(a.key));
    const nodes = [
      ...(items.length ? items.map((key) => {
        const se = o.series(key);
        return h('span', { class: 'chip' }, swatch(se), h('span', {}, se.label),
          h('button', { type: 'button', class: 'chip-x', 'aria-label': `Remove ${se.label}`, onclick: () => toggleKey(key) }, '×'));
      }) : [h('span', { class: 'muted small' }, 'Nothing selected.')]),
    ];
    if (items.length > 1) nodes.push(h('button', { type: 'button', class: 'chip-clear', onclick: () => change({ ca: false, attrs: [] }) }, 'Clear all'));
    chips.replaceChildren(...nodes);
  }

  /** Right-aligned "12 → 14 · +2" (or —), coloured by desirability. */
  function changeCell(key, labelText) {
    if (!o.change) return { cell: null, note: null, title: null };
    const c = o.change(key);
    if (!c) {
      return { cell: h('span', { class: 'opt-change none', 'data-change': '', 'aria-label': `${labelText}: not enough history` }, '—'), note: null, title: 'Fewer than two recorded values in this range' };
    }
    const g = c.delta === 0 ? null : o.good ? o.good(key, c.delta) : c.delta > 0;
    const tone = c.delta === 0 || g === null ? 'flat' : g ? 'good' : 'bad';
    const span = o.dates ? o.dates(c.firstDate, c.lastDate) : `${c.firstDate} – ${c.lastDate}`;
    return {
      cell: h('span', { class: 'opt-change', 'data-change': String(c.delta), 'aria-label': `${labelText}: ${c.from} to ${c.to}, ${signed(c.delta)}${c.partial ? `, ${span}` : ''}` },
        h('span', { class: 'opt-vals' }, `${c.from} → ${c.to}`, h('span', { class: 'opt-sep' }, ' · ')),
        h('b', { class: `opt-delta ${tone}` }, signed(c.delta))),
      note: c.partial ? h('span', { class: 'opt-dates' }, span) : null,
      title: `${c.from} → ${c.to} (${signed(c.delta)}), ${span}`,
    };
  }

  function option(key, labelText) {
    const sel = isSel(key);
    const disabled = !sel && key !== 'ca' && attrCount() >= o.maxAttrs;
    const ch = changeCell(key, labelText);
    return h('label', { class: `opt${disabled ? ' disabled' : ''}`, 'data-key': key, title: ch.title },
      h('input', { type: 'checkbox', checked: sel, disabled, onchange: () => toggleKey(key) }),
      h('span', { class: 'opt-text' }, h('span', { class: 'opt-label' }, labelText), ch.note),
      ch.cell);
  }

  function renderList() {
    const groups = [];
    if (!query || 'ca current ability'.includes(query)) {
      groups.push(h('div', { class: 'opt-group' }, h('p', { class: 'opt-head' }, 'Ability'), option('ca', 'Current Ability (CA)')));
    }
    for (const g of ATTRIBUTE_GROUPS) {
      const attrs = g.attrs.filter((a) => !query || a.label.toLowerCase().includes(query));
      if (!attrs.length) continue;
      groups.push(h('div', { class: 'opt-group' }, h('p', { class: 'opt-head' }, g.label), attrs.map((a) => option(a.key, a.label))));
    }
    const nodes = groups.length ? groups : [h('p', { class: 'muted small' }, 'No matching attributes.')];
    if (attrCount() >= o.maxAttrs) nodes.unshift(h('p', { class: 'picker-note' }, `Up to ${o.maxAttrs} attributes at once, so lines stay readable. Remove one to add another.`));
    list.replaceChildren(...nodes);
  }

  panel.append(search, list);
  root.append(chips, toggle, panel);
  renderChips();
  setOpen(false);

  // Allow the view to refresh chips/list after selection changes without
  // rebuilding (keeps the search text and open state).
  root.update = (next) => {
    o.selected = next;
    Object.assign(selected, next);
    renderChips();
    if (open) renderList();
  };
  // Recalculate the per-row changes (e.g. after the graph's date range changes).
  root.setChange = (fn) => { o.change = fn; if (open) renderList(); };
  return root;
}
