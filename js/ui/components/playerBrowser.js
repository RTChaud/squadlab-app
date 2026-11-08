// Shared Squad / Shortlists / Tags browser: Search, Filters and View around the
// player table. Each screen passes in its selected source's players; this
// component never adds players from elsewhere.
//
// Remembered per section (Squad, Shortlists, Tags): the configuration (filters,
// columns, sort, change baseline) and active saved view — stored with the
// career, so it is in backups. Search text and horizontal scroll are kept for
// the session so Back from a profile restores them; vertical scroll is
// restored by the app shell.

import { h, icon } from '../dom.js';
import {
  getModel, getCareer, playerKeyOf, squadSlotsFor, tagsForPlayer, listTags, tagById,
  getListSection, getListPrefs, setListSection, createListView, updateListView, renameListView, deleteListView,
  getCareerMetrics,
} from '../../store.js';
import { resolveTeams, formatGameDate as fmt } from '../../data/snapshot.js';
import { resolveNation, loadNations } from '../../data/nations.js';
import {
  buildRow, matchesSearch, matchesFilters, filterChips, activeFilterCount, sortRows, sortableKeys,
  columnDef, defaultConfig, sanitizeConfig, sameConfig, emptyFilters, buildDevContext, DEFAULT_VIEW_ID,
} from '../../data/listView.js';
import { PlayerTable } from './playerTable.js';
import { openFilterSheet } from './filterSheet.js';
import { openViewSheet } from './viewSheet.js';

const session = {}; // section → { search, scrollX, source }

/** Start a section's next visit with an empty search (e.g. Tactic → Shortlists → All). */
export function clearBrowserSearch(section) {
  if (session[section]) { session[section].search = ''; session[section].scrollX = 0; }
}

/**
 * Row context shared by the browser and anything that must count rows the same
 * way (Tactic's match count). `older`: Map player → game date for members only
 * found in an earlier snapshot.
 */
export function browserRowContext(model, older = new Map()) {
  const careerId = getCareer()?.careerId;
  const teamByUid = new Map();
  for (const t of resolveTeams(model)) for (const p of t.players) if (!teamByUid.has(p.uid)) teamByUid.set(p.uid, { key: t.key, label: t.label, short: t.short });
  return {
    keyOf: playerKeyOf,
    slotsOf: squadSlotsFor,
    tagsOf: (key) => (key ? tagsForPlayer(key) : []),
    // Squad membership comes from the latest snapshot, so older records have none.
    teamOf: (p) => (older.has(p) ? null : teamByUid.get(p.uid) || null),
    // Contract dates are measured from the row's own snapshot.
    gameDateOf: (p) => (older.has(p) ? older.get(p) : model.gameDate),
    nationsOf: (p) => [p.nation_id, ...(Array.isArray(p.second_nation_ids) ? p.second_nation_ids : [])]
      .filter(Number.isInteger).map((id) => resolveNation(id, careerId)).filter(Boolean),
  };
}

/**
 * @param {object} o
 *   section 'squad' | 'shortlists' | 'tags', source (stable id of the selected squad/list/tag),
 *   sourceName, players (members; latest snapshot unless listed in `older`),
 *   older (Map player → game date, for members only found in an earlier snapshot),
 *   from (route to return to), emptyTitle, emptyText
 */
export async function PlayerBrowser(o) {
  const model = getModel();
  const [metrics] = await Promise.all([getCareerMetrics(), loadNations()]);

  const ses = session[o.section] || (session[o.section] = { search: '', scrollX: 0, source: null });
  const sourceChanged = ses.source !== null && ses.source !== o.source;
  if (sourceChanged) ses.scrollX = 0;
  ses.source = o.source;

  // ---- Rows (built once per render) -------------------------------------------------
  const older = o.older || new Map();
  const rowCtx = browserRowContext(model, older);
  const allRows = o.players.map((p) => {
    const row = buildRow(p, rowCtx);
    if (older.has(p)) row.note = `Last recorded ${fmt(older.get(p))}`;
    return row;
  });

  // ---- State helpers ---------------------------------------------------------------------
  const current = () => getListSection(o.section);
  const config = () => current().config;
  const savedView = (id) => getListPrefs().views.find((v) => v.id === id) || null;
  const referenceConfig = (viewId) => (viewId === DEFAULT_VIEW_ID ? defaultConfig(o.section) : sanitizeConfig(savedView(viewId)?.config, o.section));
  const isModified = () => !sameConfig(config(), referenceConfig(current().viewId));
  const viewName = () => (current().viewId === DEFAULT_VIEW_ID ? 'Default' : savedView(current().viewId)?.name || 'Default');

  function setConfig(next) {
    setListSection(o.section, { config: sanitizeConfig(next, o.section) });
    refresh();
  }

  // ---- Controls ---------------------------------------------------------------------------
  const searchInput = h('input', {
    type: 'search', class: 'bsearch-input', placeholder: 'Search', 'aria-label': `Search ${o.sourceName}`,
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search', value: ses.search,
    oninput: (e) => { ses.search = e.target.value; clearBtn.hidden = !ses.search; refresh(); },
    onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
  });
  searchInput.value = ses.search;
  const clearBtn = h('button', {
    type: 'button', class: 'bsearch-clear', 'aria-label': 'Clear search', hidden: !ses.search,
    onclick: () => { ses.search = ''; searchInput.value = ''; clearBtn.hidden = true; refresh(); searchInput.focus(); },
  }, '×');
  const filtersBtn = h('button', {
    type: 'button', class: 'tool-btn', 'aria-haspopup': 'dialog',
    onclick: () => openFilterSheet({
      filters: config().filters,
      tags: listTags(),
      // Live match count for the draft: the selected squad/list and the current search.
      count: (filters) => allRows.filter((r) => (!ses.search.trim() || matchesSearch(r, ses.search)) && matchesFilters(r, filters)).length,
      onApply: (filters) => setConfig({ ...config(), filters }),
    }),
  });
  const viewBtn = h('button', {
    type: 'button', class: 'tool-btn', 'aria-haspopup': 'dialog',
    onclick: () => openViewSheet(viewApi),
  });
  const tools = h('div', { class: 'btools' },
    h('div', { class: 'bsearch' }, icon('search', 'icon bsearch-icon'), searchInput, clearBtn),
    filtersBtn, viewBtn);

  const chipsEl = h('div', { class: 'bchips' });
  const metaEl = h('div', { class: 'bmeta' });
  const tableHost = h('div', { class: 'btable' });
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });

  // ---- Saved-view API for the View sheet ---------------------------------------------------
  const viewApi = {
    section: o.section,
    latestDate: model.gameDate,
    earlierDates: buildDevContext(metrics, model.gameDate, 'first').earlierDates,
    state: () => ({ config: config(), viewId: current().viewId, modified: isModified(), views: getListPrefs().views }),
    setConfig: (c) => setConfig(c),
    applyView: (id) => {
      // Keeps the selected squad/shortlist; only the configuration changes.
      setListSection(o.section, { viewId: id, config: referenceConfig(id) });
      refresh();
    },
    saveAs: async (name) => {
      const v = await createListView(name, config());
      await setListSection(o.section, { viewId: v.id });
      refresh();
    },
    saveChanges: async () => { await updateListView(current().viewId, config()); refresh(); },
    rename: async (id, name) => { await renameListView(id, name); refresh(); },
    remove: async (id) => { await deleteListView(id); refresh(); },
  };

  // ---- Render the dynamic parts ----------------------------------------------------------------
  let table = null;

  function refresh() {
    const cfg = config();
    const f = cfg.filters;
    const nFilters = activeFilterCount(f);
    filtersBtn.replaceChildren(...[icon('settings'), 'Filters', nFilters ? h('span', { class: 'count-badge' }, String(nFilters)) : null].filter(Boolean));
    filtersBtn.setAttribute('aria-label', nFilters ? `Filters, ${nFilters} active` : 'Filters');
    const modified = isModified();
    const vName = viewName();
    viewBtn.replaceChildren(...[icon('columns'), h('span', { class: 'view-btn-name' }, current().viewId === DEFAULT_VIEW_ID ? 'View' : vName), modified ? h('span', { class: 'mod-dot', 'aria-hidden': 'true' }) : null].filter(Boolean));
    viewBtn.setAttribute('aria-label', `View: ${vName}${modified ? ' (modified)' : ''}`);

    // Results
    const dev = buildDevContext(metrics, model.gameDate, cfg.baseline);
    const filtered = allRows.filter((r) => (!ses.search.trim() || matchesSearch(r, ses.search)) && matchesFilters(r, f));
    const sorted = sortRows(filtered, cfg.sort, dev);
    const total = allRows.length;
    const narrowed = !!ses.search.trim() || nFilters > 0;

    // Chips for active filters
    const chips = filterChips(f, (id) => tagById(id)?.name);
    chipsEl.hidden = !chips.length;
    chipsEl.replaceChildren(...[
      ...chips.map((c) => h('span', { class: `chip fchip${c.tiers ? ' tiers' : ''}${c.role ? ' fchip-role' : ''}` },
        c.tiers ? c.tiers.map((t) => h('span', { class: `xi-dot t${t}`, 'aria-hidden': 'true' })) : null,
        h('span', { class: 'fchip-text' }, c.text),
        h('button', { type: 'button', class: 'chip-x', 'aria-label': `Remove filter: ${c.label}`, onclick: () => setConfig({ ...cfg, filters: c.remove() }) }, '×'))),
      chips.length ? h('button', { type: 'button', class: 'chip-clear', onclick: () => setConfig({ ...cfg, filters: emptyFilters() }) }, 'Clear filters') : null,
    ].filter(Boolean));

    // Count + sort
    const sortKeys = sortableKeys(cfg.columns);
    const sortSel = h('select', {
      class: 'select select-sm', 'aria-label': 'Sort by',
      onchange: (e) => { const c = columnDef(e.target.value); setConfig({ ...cfg, sort: { key: c.id, dir: c.dir } }); },
    }, sortKeys.map((k) => h('option', { value: k, selected: k === cfg.sort.key }, `Sort: ${k === 'xi' ? 'Squad slot' : columnDef(k).label}`)));
    const dirBtn = h('button', {
      type: 'button', class: 'tool-btn', 'aria-label': cfg.sort.dir === 'asc' ? 'Ascending — switch to descending' : 'Descending — switch to ascending',
      onclick: () => setConfig({ ...cfg, sort: { ...cfg.sort, dir: cfg.sort.dir === 'asc' ? 'desc' : 'asc' } }),
    }, cfg.sort.dir === 'asc' ? '▲' : '▼');
    const countText = narrowed ? `${sorted.length} of ${total} player${total === 1 ? '' : 's'}` : `${total} player${total === 1 ? '' : 's'}`;
    const devCols = cfg.columns.filter((id) => columnDef(id)?.dev);
    metaEl.replaceChildren(
      h('div', { class: 'bcount' },
        h('span', { class: 'bcount-n' }, countText),
        devCols.length ? h('span', { class: 'bcount-dev' }, cfg.baseline === 'first'
          ? `Changes: first recorded → ${fmt(model.gameDate)}` : `Changes: ${fmt(cfg.baseline)} → ${fmt(model.gameDate)}`) : null),
      h('div', { class: 'bsort' }, sortSel, dirBtn));
    live.textContent = countText;

    // Table or empty state
    const keepX = ses.scrollX;
    if (!total) {
      table = null;
      tableHost.replaceChildren(h('div', { class: 'empty' },
        h('p', { class: 'empty-title' }, o.emptyTitle || 'No players'),
        o.emptyText ? h('p', { class: 'empty-text' }, o.emptyText) : null));
    } else if (!sorted.length) {
      table = null;
      tableHost.replaceChildren(h('div', { class: 'empty' },
        h('p', { class: 'empty-title' }, 'No players match'),
        h('p', { class: 'empty-text' }, `${ses.search.trim() ? `“${ses.search.trim()}”` : 'The current filters'}${ses.search.trim() && nFilters ? ' with the current filters' : ''} match none of the ${total} players in ${o.sourceName}.`),
        h('div', { class: 'tool-row center' },
          ses.search.trim() ? h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => clearBtn.click() }, 'Clear search') : null,
          nFilters ? h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => setConfig({ ...cfg, filters: emptyFilters() }) }, 'Clear filters') : null)));
    } else {
      table = PlayerTable({
        rows: sorted, columns: cfg.columns, sort: cfg.sort, dev, from: o.from,
        onSort: (id) => {
          const c = columnDef(id);
          const sort = cfg.sort.key === id ? { key: id, dir: cfg.sort.dir === 'asc' ? 'desc' : 'asc' } : { key: id, dir: c.dir };
          setConfig({ ...cfg, sort });
        },
        onScrollX: (x) => { ses.scrollX = x; },
      });
      tableHost.replaceChildren(table);
      if (keepX) requestAnimationFrame(() => table?.restoreScrollX(keepX));
    }
  }

  refresh();
  // A newly selected squad/shortlist starts at the top (filters and view are kept).
  if (sourceChanged) requestAnimationFrame(() => window.scrollTo(0, 0));

  return h('div', { class: 'browser' }, tools, chipsEl, metaEl, live, tableHost);
}
