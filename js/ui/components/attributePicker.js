// Searchable, grouped attribute chooser in a sheet (technical, mental,
// physical, goalkeeping, hidden, personality). Used for filter conditions and
// for adding attribute / change columns. Resolves the chosen key or null.

import { h } from '../dom.js';
import { openSheet } from './sheet.js';
import { ATTRIBUTE_CHOICES } from '../../data/listView.js';
import { normalizeSearch } from '../../data/players.js';

/**
 * @param {object} o  title, exclude (Set of keys already used), excludeNote
 */
export function pickAttribute(o = {}) {
  return new Promise((resolve) => {
    let result = null;
    const exclude = o.exclude || new Set();
    const list = h('div', { class: 'picker-list attr-pick-list', role: 'listbox', 'aria-label': 'Attributes' });
    const search = h('input', {
      type: 'search', class: 'picker-search', placeholder: 'Search attributes', 'aria-label': 'Search attributes',
      autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search',
      oninput: () => render(),
      onkeydown: (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        list.querySelector('button.opt:not([disabled])')?.click();
      },
    });

    function render() {
      const q = normalizeSearch(search.value.trim());
      const groups = ATTRIBUTE_CHOICES.map((g) => {
        const attrs = g.attrs.filter((a) => !q || normalizeSearch(`${a.label} ${a.short} ${g.label}`).includes(q));
        if (!attrs.length) return null;
        return h('div', { class: 'opt-group', role: 'group', 'aria-label': g.label },
          h('p', { class: 'opt-head' }, g.label),
          attrs.map((a) => {
            const used = exclude.has(a.key);
            return h('button', {
              type: 'button', class: `opt opt-btn${used ? ' disabled' : ''}`, disabled: used, role: 'option',
              onclick: () => { result = a.key; sheet.close(); },
            }, h('span', {}, a.label), used ? h('span', { class: 'muted small' }, o.excludeNote || 'Added') : null);
          }));
      }).filter(Boolean);
      list.replaceChildren(...(groups.length ? groups : [h('p', { class: 'muted small' }, 'No matching attributes.')]));
    }

    const sheet = openSheet({
      title: o.title || 'Choose attribute',
      content: [search, list],
      actions: [{ label: 'Cancel', kind: 'secondary', onClick: (close) => close() }],
      onClose: () => resolve(result),
    });
    render();
    setTimeout(() => search.focus(), 60);
  });
}
