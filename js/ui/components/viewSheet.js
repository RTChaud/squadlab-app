// View menu for the Squad, Shortlists and Tags tables: saved views, columns and the
// development baseline. Column and baseline changes apply straight away; a
// saved view is only overwritten by "Save changes".

import { h } from '../dom.js';
import { openSheet, confirmSheet } from './sheet.js';
import { promptSheet } from './promptSheet.js';
import { pickAttribute } from './attributePicker.js';
import { columnDef, INFO_COLUMNS, DEFAULT_COLUMNS, DEFAULT_VIEW_ID } from '../../data/listView.js';
import { formatGameDate } from '../../data/snapshot.js';

/**
 * @param {object} api
 *   state() → { config, viewId, modified, views: [{id,name}] }, section, latestDate, earlierDates
 *   setConfig(config), applyView(id), saveAs(name) (throws on bad name), saveChanges(), rename(id, name), remove(id)
 */
export function openViewSheet(api) {
  const body = h('div', { class: 'view-form' });
  let sheet;

  const sec = (title, ...children) => h('section', { class: 'fsec' }, h('h3', { class: 'fsec-title' }, title), ...children);

  async function askName(title, value, run) {
    // Re-ask until the name is valid or the user cancels.
    let v = value;
    for (;;) {
      const name = await promptSheet({ title, label: 'View name', value: v, confirmLabel: 'Save' });
      if (name === null) return false;
      try { await run(name); return true; } catch (e) { v = name; await confirmSheet({ title: 'Can’t use that name', message: e.message, confirmLabel: 'Try again', cancelLabel: 'Close' }); }
    }
  }

  function viewsSection(st) {
    const active = st.viewId === DEFAULT_VIEW_ID ? null : st.views.find((v) => v.id === st.viewId);
    const select = h('select', {
      class: 'select', id: 'view-select', 'aria-label': 'Saved view',
      onchange: (e) => { api.applyView(e.target.value); render(); },
    },
      h('option', { value: DEFAULT_VIEW_ID, selected: st.viewId === DEFAULT_VIEW_ID }, 'Default'),
      st.views.map((v) => h('option', { value: v.id, selected: v.id === st.viewId }, v.name)));
    const btn = (label, onclick, cls = 'tool-btn') => h('button', { type: 'button', class: cls, onclick }, label);
    return sec('Saved views',
      h('div', { class: 'frow' }, select),
      h('div', { class: 'tool-row' },
        active && st.modified ? btn('Save changes', async () => { await api.saveChanges(); render(); }, 'tool-btn tool-btn-accent') : null,
        btn('Save as new view…', async () => { await askName('Save view', '', (n) => api.saveAs(n)); render(); }),
        active ? btn('Rename…', async () => { await askName('Rename view', active.name, (n) => api.rename(active.id, n)); render(); }) : null,
        active ? btn('Delete…', async () => {
          const ok = await confirmSheet({ title: `Delete “${active.name}”?`, message: 'The saved view is removed for Squad, Shortlists and Tags. Your players and other data are not affected.', confirmLabel: 'Delete view', danger: true });
          if (ok) { await api.remove(active.id); render(); }
        }) : null,
        st.viewId !== DEFAULT_VIEW_ID || st.modified ? btn('Back to Default', () => { api.applyView(DEFAULT_VIEW_ID); render(); }) : null));
  }

  function columnsSection(st) {
    const cols = st.config.columns;
    const set = (next) => { api.setConfig({ ...st.config, columns: next }); render(); };
    const move = (i, d) => { const n = [...cols]; [n[i], n[i + d]] = [n[i + d], n[i]]; set(n); };
    const rows = cols.map((id, i) => {
      const c = columnDef(id);
      return h('li', { class: 'col-row' },
        h('span', { class: 'col-name' }, c.label),
        h('button', { type: 'button', class: 'col-btn', 'aria-label': `Move ${c.label} earlier`, disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
        h('button', { type: 'button', class: 'col-btn', 'aria-label': `Move ${c.label} later`, disabled: i === cols.length - 1, onclick: () => move(i, 1) }, '↓'),
        c.locked ? h('span', { class: 'col-btn-spacer' })
          : h('button', { type: 'button', class: 'col-btn', 'aria-label': `Hide ${c.label}`, onclick: () => set(cols.filter((x) => x !== id)) }, '×'));
    });
    const unused = [...INFO_COLUMNS, columnDef('d:ca')].filter((c) => !cols.includes(c.id));
    const addSel = h('select', {
      class: 'select select-sm', 'aria-label': 'Add a column',
      onchange: (e) => { if (e.target.value) set([...cols, e.target.value]); },
    }, h('option', { value: '' }, unused.length ? 'Add column…' : 'All info columns shown'),
      unused.map((c) => h('option', { value: c.id }, c.label)));
    const addAttr = (prefix, title) => async () => {
      const used = new Set(cols.filter((id) => id.startsWith(prefix)).map((id) => id.slice(2)));
      const key = await pickAttribute({ title, exclude: used, excludeNote: 'Shown' });
      if (key) set([...cols, `${prefix}${key}`]);
    };
    return sec('Columns',
      h('ol', { class: 'col-list' }, rows),
      h('div', { class: 'tool-row' },
        addSel,
        h('button', { type: 'button', class: 'tool-btn', onclick: addAttr('a:', 'Add attribute column') }, '+ Attribute'),
        h('button', { type: 'button', class: 'tool-btn', onclick: addAttr('d:', 'Add attribute change') }, '+ Change')),
      h('button', {
        type: 'button', class: 'chip-clear col-restore', onclick: () => set([...DEFAULT_COLUMNS[api.section]]),
      }, 'Restore default columns'));
  }

  function baselineSection(st) {
    const dates = api.earlierDates; // chronological, before the latest snapshot
    const missing = st.config.baseline !== 'first' && !dates.includes(st.config.baseline);
    const sel = h('select', {
      class: 'select', id: 'baseline-select', 'aria-label': 'Compare changes with',
      onchange: (e) => { api.setConfig({ ...st.config, baseline: e.target.value }); render(); },
    },
      h('option', { value: 'first', selected: st.config.baseline === 'first' }, 'First recorded'),
      missing ? h('option', { value: st.config.baseline, selected: true }, `${formatGameDate(st.config.baseline)} (no longer available)`) : null,
      dates.map((d) => h('option', { value: d, selected: d === st.config.baseline }, formatGameDate(d))));
    return sec('Change columns',
      h('div', { class: 'frow' }, h('label', { class: 'muted small', for: 'baseline-select' }, 'Compare with'), sel),
      h('p', { class: 'fhint' }, st.config.baseline === 'first'
        ? `Latest (${formatGameDate(api.latestDate)}) against each player’s first recorded snapshot.`
        : `Latest (${formatGameDate(api.latestDate)}) against ${formatGameDate(st.config.baseline)}. Players or values missing on that date show a dash.`));
  }

  function render() {
    const st = api.state();
    const scroll = sheet?.el.scrollTop ?? 0;
    body.replaceChildren(viewsSection(st), columnsSection(st), baselineSection(st));
    if (sheet) sheet.el.scrollTop = scroll;
  }

  sheet = openSheet({ title: 'View', titleClass: 'sheet-title-sm', content: body, actions: [{ label: 'Done', onClick: (close) => close() }] });
  sheet.el.classList.add('sheet-tall');
  render();
}
