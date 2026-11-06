// Bottom sheet for one player's tags: chips with × to remove, and an add
// panel to search existing tags or create a new one. Changes save at once.
// Tag names are always inserted as text (never HTML).

import { h, icon } from '../dom.js';
import { listTags, tagsForPlayer, addTagToPlayer, removeTagFromPlayer } from '../../store.js';
import { normalizeTagName } from '../../data/tags.js';
import { openSheet } from './sheet.js';
import { toast } from './feedback.js';

export function openTagSheet({ playerKey, playerName }) {
  let adding = false;
  let query = '';
  let busy = false;

  const chipsEl = h('div', { class: 'tag-chips' });
  const addBtn = h('button', { type: 'button', class: 'btn btn-secondary tag-add', onclick: () => setAdding(!adding) });
  const input = h('input', {
    type: 'text', class: 'picker-search', placeholder: 'Search or create a tag',
    'aria-label': 'Tag name', autocomplete: 'off', autocapitalize: 'sentences', spellcheck: 'false', enterkeyhint: 'done',
    oninput: (e) => { query = e.target.value; renderOptions(); },
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); submitTyped(); } },
  });
  const optionsEl = h('div', { class: 'tag-options' });
  const addPanel = h('div', { class: 'picker-panel', hidden: true }, input, optionsEl);

  async function run(fn) {
    if (busy) return;
    busy = true;
    try { await fn(); } catch (e) { toast(String(e?.message || e), 'info'); } finally { busy = false; }
    render();
  }

  const assign = (name) => run(async () => {
    const r = await addTagToPlayer(playerKey, name);
    if (!r.already) toast(r.created ? `Created “${r.tag.name}”` : `Added “${r.tag.name}”`);
    query = '';
    input.value = '';
    input.focus();
  });

  const remove = (tag) => run(async () => {
    const r = await removeTagFromPlayer(playerKey, tag.id);
    toast(r.deletedTag ? `Removed “${tag.name}” (no players left, tag deleted)` : `Removed “${tag.name}”`, 'info');
  });

  function submitTyped() {
    const name = normalizeTagName(query);
    if (!name) return;
    assign(name); // reuses an existing tag case-insensitively, else creates it
  }

  function setAdding(v) {
    adding = v;
    addPanel.hidden = !adding;
    addBtn.replaceChildren(icon(adding ? 'check' : 'plus'), adding ? 'Done adding' : 'Add tag');
    if (adding) { renderOptions(); setTimeout(() => input.focus(), 50); }
  }

  function renderChips() {
    const mine = tagsForPlayer(playerKey);
    chipsEl.replaceChildren(...(mine.length
      ? mine.map((t) => h('span', { class: 'chip tag-chip' },
          h('span', {}, t.name),
          h('button', { type: 'button', class: 'chip-x', 'aria-label': `Remove tag ${t.name}`, onclick: () => remove(t) }, '×')))
      : [h('p', { class: 'muted small' }, 'No tags yet.')]));
  }

  function renderOptions() {
    const name = normalizeTagName(query);
    const q = name.toLowerCase();
    const mineIds = new Set(tagsForPlayer(playerKey).map((t) => t.id));
    const all = listTags();
    const exact = all.find((t) => t.name.toLowerCase() === q) || null;
    const choices = all.filter((t) => !mineIds.has(t.id) && (!q || t.name.toLowerCase().includes(q)));

    const nodes = [];
    if (name && !exact) {
      nodes.push(h('button', { type: 'button', class: 'opt tag-create', onclick: () => assign(name) },
        icon('plus'), h('span', {}, 'Create “', h('strong', {}, name), '”')));
    }
    if (exact && mineIds.has(exact.id)) {
      nodes.push(h('p', { class: 'muted small tag-note' }, `“${exact.name}” is already added.`));
    }
    for (const t of choices) {
      nodes.push(h('button', { type: 'button', class: 'opt', onclick: () => assign(t.name) },
        h('span', { class: 'tag-opt-name' }, t.name), h('span', { class: 'muted' }, String(t.count))));
    }
    if (!nodes.length) {
      nodes.push(h('p', { class: 'muted small tag-note' }, all.length ? 'Type a name to create a new tag.' : 'No tags yet — type a name to create the first one.'));
    }
    optionsEl.replaceChildren(...nodes);
  }

  function render() {
    renderChips();
    if (adding) renderOptions();
  }

  render();
  setAdding(false);

  openSheet({
    title: `Tags · ${playerName}`,
    content: [chipsEl, addBtn, addPanel],
    actions: [{ label: 'Close', kind: 'secondary', onClick: (close) => close() }],
  });
}
