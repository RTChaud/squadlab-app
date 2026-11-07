// Searchable attribute picker for radars (up to MAX_SELECTED): selected chips
// (tap × to remove), a "Add or change attributes" toggle and a grouped,
// searchable checkbox list — technical, mental, physical, goalkeeping, hidden
// and personality. Order = the order attributes were picked in.
// Used by the player profile radar and the Comparison tab.

import { h, icon } from '../dom.js';
import { SELECTABLE_GROUPS, SELECTABLE, MAX_SELECTED, MIN_SELECTED, interpretationNote } from '../../data/radar.js';

/**
 * @param {object} o
 *   selected   [attribute keys] (initial)
 *   onChange   (nextKeys) => void — called on every pick or removal
 *   startOpen  boolean (default: fewer than MIN_SELECTED selected)
 */
export function RadarAttributePicker(o) {
  let selected = [...(o.selected || [])];
  let query = '';
  let open = o.startOpen ?? selected.length < MIN_SELECTED;

  const toggle = (k) => {
    if (selected.includes(k)) selected = selected.filter((x) => x !== k);
    else if (selected.length < MAX_SELECTED) selected = [...selected, k]; // appended: axis order = selection order
    else return;
    drawChips(); drawList();
    o.onChange(selected);
  };

  const search = h('input', {
    type: 'search', class: 'picker-search', placeholder: 'Search attributes', 'aria-label': 'Search attributes',
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    oninput: (e) => { query = e.target.value.trim().toLowerCase(); drawList(); },
  });
  const chips = h('div', { class: 'chips' });
  const list = h('div', { class: 'picker-list radar-options' });
  const panel = h('div', { class: 'picker-panel' }, search, list);
  const toggleBtn = h('button', { type: 'button', class: 'btn btn-secondary picker-toggle', onclick: () => { open = !open; drawPanel(); } });

  function drawPanel() {
    panel.hidden = !open;
    toggleBtn.replaceChildren(icon(open ? 'check' : 'plus'), open ? 'Done' : 'Add or change attributes');
    toggleBtn.setAttribute('aria-expanded', String(open));
  }

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

  drawPanel();
  drawChips();
  drawList();
  return h('div', { class: 'radar-picker' }, chips, toggleBtn, panel);
}
