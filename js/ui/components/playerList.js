// Shared player list used by Squad, Shortlists and Tags.
// Takes player records (one underlying object per player) and renders
// First name / Last name / Position / Age / CA / PA, plus the optional
// "Squad slot" field. Missing values show "—".
//
// Squad slot is derived from the three default lineups (see data/lineups.js)
// and can be shown via the column toggle and sorted by even when hidden.

import { h, orDash } from '../dom.js';
import { playerSummary } from '../../data/snapshot.js';
import { linkWithFrom } from '../../router.js';
import { squadSlotsFor, playerKeyOf, getPrefSync, setPref } from '../../store.js';
import { hierarchyRank } from '../../data/lineups.js';

/** Optional columns the user can switch on (stored as a preference). */
const OPTIONAL_COLUMNS = [{ key: 'slot', label: 'Squad slot', pref: 'list.showSquadSlot' }];

/** Everything the list can be sorted by, including hidden optional fields. */
const SORT_OPTIONS = [
  { key: 'name', label: 'Name', defaultDir: 'asc' },
  { key: 'pos', label: 'Position', defaultDir: 'asc' },
  { key: 'age', label: 'Age', defaultDir: 'asc' },
  { key: 'ca', label: 'CA', defaultDir: 'desc' },
  { key: 'pa', label: 'PA', defaultDir: 'desc' },
  { key: 'slot', label: 'Squad slot', defaultDir: 'asc' },
];

// Sort choice is shared across lists for the session.
let sort = { key: 'ca', dir: 'desc' };

const collator = new Intl.Collator('en-GB', { sensitivity: 'base' });

function compare(a, b, key) {
  switch (key) {
    case 'name':
      return collator.compare(a.lastName || '', b.lastName || '') ||
             collator.compare(a.firstName || '', b.firstName || '');
    case 'pos':
      return a.positions.sortKey - b.positions.sortKey;
    case 'slot':
      // Numerical hierarchy rank (tier, then GK…ST order) — not label text.
      return a.slotRank === b.slotRank ? 0 : a.slotRank < b.slotRank ? -1 : 1;
    default:
      return (a[key] ?? -1) - (b[key] ?? -1);
  }
}

function sorted(rows) {
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    // Unavailable values always sink to the bottom, whatever the direction.
    if (sort.key === 'ca' || sort.key === 'pa' || sort.key === 'age') {
      const an = a[sort.key] === null, bn = b[sort.key] === null;
      if (an !== bn) return an ? 1 : -1;
    }
    // Players without a default-lineup slot always come after assigned ones.
    if (sort.key === 'slot') {
      const an = a.slotRank === Infinity, bn = b.slotRank === Infinity;
      if (an !== bn) return an ? 1 : -1;
    }
    return compare(a, b, sort.key) * dir || compare(a, b, 'name');
  });
}

function rowEl(r, from, showSlot) {
  const inner = [
    h('div', { class: 'pname' },
      h('span', { class: 'pfirst' }, orDash(r.firstName)),
      h('span', { class: 'plast' }, orDash(r.lastName)),
      r.note ? h('span', { class: 'pnote' }, r.note) : null,
      // Squad slot wraps under the name so the table never gets wider.
      showSlot ? h('span', { class: `pslot-line${r.slotLabel ? '' : ' none'}` },
        h('span', { class: 'pslot-k' }, 'Squad slot '), r.slotLabel || '—') : null,
    ),
    h('div', { class: 'ppos' },
      r.positions.natural ? h('span', {}, r.positions.natural) : h('span', { class: 'dash' }, '—'),
      r.positions.accomplished ? h('span', { class: 'ppos-alt' }, r.positions.accomplished) : null,
    ),
    h('div', { class: 'pnum page' + (r.age === null ? ' dash' : '') }, orDash(r.age)),
    h('div', { class: 'pnum' + (r.ca === null ? ' dash' : '') }, orDash(r.ca)),
    h('div', { class: 'pnum pa' + (r.pa === null ? ' dash' : '') }, orDash(r.pa)),
  ];
  // Rows open the shared player profile, remembering which list we came from.
  return h('li', { dataset: { uid: r.uid } },
    r.pid
      ? h('a', { class: 'prow', href: linkWithFrom(`/player/${encodeURIComponent(r.pid)}`, from) }, inner)
      : h('div', { class: 'prow' }, inner));
}

/**
 * @param {object[]} players  player records from the snapshot
 * @param {object}   opts     { emptyTitle, emptyText, from (route path to return to),
 *                              rowNote(player) → optional small note under the name }
 */
export function PlayerList(players, opts = {}) {
  const rows = players.map((p) => {
    const slots = squadSlotsFor(playerKeyOf(p));
    return {
      ...playerSummary(p),
      note: opts.rowNote ? opts.rowNote(p) : null,
      slotLabel: slots.map((x) => x.label).join(' · '),
      slotRank: hierarchyRank(slots),
    };
  });
  const wrap = h('section', { class: 'plist-wrap' });

  if (rows.length === 0) {
    wrap.append(
      h('div', { class: 'empty' },
        h('p', { class: 'empty-title' }, opts.emptyTitle || 'No players'),
        opts.emptyText ? h('p', { class: 'empty-text' }, opts.emptyText) : null,
      )
    );
    return wrap;
  }

  const list = h('ol', { class: 'plist' });
  const head = h('div', { class: 'phead', role: 'row' });
  const tools = h('div', { class: 'plist-tools' });
  const slotCol = OPTIONAL_COLUMNS[0];
  let showSlot = !!getPrefSync(slotCol.pref, false);

  const renderTools = () => {
    const sortSel = h('select', { class: 'select select-sm', 'aria-label': 'Sort by',
      onchange: (e) => {
        const o = SORT_OPTIONS.find((x) => x.key === e.target.value);
        sort = { key: o.key, dir: o.defaultDir };
        render();
      } },
      SORT_OPTIONS.map((o) => h('option', { value: o.key, selected: o.key === sort.key }, `Sort: ${o.label}`)));
    const dirBtn = h('button', { type: 'button', class: 'tool-btn', 'aria-label': sort.dir === 'asc' ? 'Ascending' : 'Descending',
      onclick: () => { sort = { ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' }; render(); } }, sort.dir === 'asc' ? '▲' : '▼');
    const colBtn = h('button', { type: 'button', class: `tool-btn tool-toggle${showSlot ? ' on' : ''}`, 'aria-pressed': String(showSlot),
      onclick: () => { showSlot = !showSlot; setPref(slotCol.pref, showSlot); render(); } },
      h('span', { class: 'tool-check', 'aria-hidden': 'true' }, showSlot ? '✓' : ''), slotCol.label);
    tools.replaceChildren(sortSel, dirBtn, colBtn);
  };

  const render = () => {
    renderTools();
    head.replaceChildren(
      ...SORT_OPTIONS.filter((c) => c.key !== 'slot').map((c) => {
        const active = sort.key === c.key;
        return h('button', {
          type: 'button',
          class: `phead-btn col-${c.key}${active ? ' active' : ''}`,
          'aria-sort': active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none',
          onclick: () => {
            sort = active ? { key: c.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.defaultDir };
            render();
          },
        }, c.key === 'pos' ? 'Pos' : c.label, active ? h('span', { class: 'sort-arrow' }, sort.dir === 'asc' ? '▲' : '▼') : null);
      })
    );
    list.replaceChildren(...sorted(rows).map((r) => rowEl(r, opts.from, showSlot)));
  };
  render();

  wrap.append(tools, head, list);
  return wrap;
}
