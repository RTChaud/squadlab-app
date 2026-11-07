// Simple player list used by Tags (Squad and Shortlists use playerBrowser.js).
// Takes player records (one underlying object per player) and renders
// Name / Position / Age / CA / PA. Missing values show "—".
//
// With opts.lineupSlots (the Squad screen) it adds the "XI" column first:
// each slot the player holds in the three default lineups, coloured by tier
// (First XI green, Backup XI orange, Future XI red), and sortable by the
// lineup hierarchy (see data/lineups.js).

import { h, orDash } from '../dom.js';
import { playerSummary } from '../../data/snapshot.js';
import { linkWithFrom } from '../../router.js';
import { squadSlotsFor, playerKeyOf } from '../../store.js';
import { hierarchyRank, DEFAULT_LINEUPS } from '../../data/lineups.js';
import { profileNameOf } from '../../data/players.js';

const TIER_NAME = Object.fromEntries(DEFAULT_LINEUPS.map((d) => [d.tier, d.name]));

/** Everything the list can be sorted by ('slot' only where the XI column exists). */
const SORT_OPTIONS = [
  { key: 'slot', label: 'XI', defaultDir: 'asc', lineupOnly: true },
  { key: 'name', label: 'Name', defaultDir: 'asc' },
  { key: 'pos', label: 'Position', defaultDir: 'asc' },
  { key: 'age', label: 'Age', defaultDir: 'asc' },
  { key: 'ca', label: 'CA', defaultDir: 'desc' },
  { key: 'pa', label: 'PA', defaultDir: 'desc' },
];

// Sort choice is shared across lists for the session.
let sort = { key: 'ca', dir: 'desc' };

const collator = new Intl.Collator('en-GB', { sensitivity: 'base' });

function compare(a, b, key) {
  switch (key) {
    case 'name':
      return collator.compare(a.name.common || a.lastName || '', b.name.common || b.lastName || '') ||
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

function sorted(rows, sort) {
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

// Wrap between positions, never inside one ("ST (C)" stays on one line).
const keepTogether = (text) => text.replace(/ \(/g, '\u00a0(');

function xiCell(r) {
  return h('div', { class: 'pxi' }, r.slots.map((x) =>
    h('span', { class: `xi t${x.tier}`, title: `${TIER_NAME[x.tier]} · ${x.slot}`, 'aria-label': `${TIER_NAME[x.tier]} ${x.slot}` }, x.slot)));
}

function rowEl(r, from, withXI) {
  const inner = [
    withXI ? xiCell(r) : null,
    h('div', { class: 'pname' },
      // Same name rule as the profile: a recorded common name (e.g. "Endrick") on its own.
      r.name.common || !r.name.last ? h('span', { class: 'plast' }, r.name.main)
        : [h('span', { class: 'pfirst' }, orDash(r.name.first)), h('span', { class: 'plast' }, r.name.last)],
      r.note ? h('span', { class: 'pnote' }, r.note) : null,
    ),
    h('div', { class: 'ppos' },
      r.positions.natural ? h('span', {}, keepTogether(r.positions.natural)) : h('span', { class: 'dash' }, '—'),
      r.positions.accomplished ? h('span', { class: 'ppos-alt' }, keepTogether(r.positions.accomplished)) : null,
    ),
    h('div', { class: 'pnum page' + (r.age === null ? ' dash' : '') }, orDash(r.age)),
    h('div', { class: 'pnum' + (r.ca === null ? ' dash' : '') }, orDash(r.ca)),
    h('div', { class: 'pnum pa' + (r.pa === null ? ' dash' : '') }, orDash(r.pa)),
  ];
  // Rows open the shared player profile, remembering which list we came from.
  const cls = `prow${withXI ? ' with-xi' : ''}`;
  return h('li', { dataset: { uid: r.uid } },
    r.pid
      ? h('a', { class: cls, href: linkWithFrom(`/player/${encodeURIComponent(r.pid)}`, from) }, inner)
      : h('div', { class: cls }, inner));
}

/**
 * @param {object[]} players  player records from the snapshot
 * @param {object}   opts     { emptyTitle, emptyText, from (route path to return to),
 *                              rowNote(player) → optional small note under the name,
 *                              lineupSlots: true → show/sort the XI column (Squad screen) }
 */
export function PlayerList(players, opts = {}) {
  const rows = players.map((p) => {
    const slots = opts.lineupSlots ? squadSlotsFor(playerKeyOf(p)) : [];
    return {
      ...playerSummary(p),
      name: profileNameOf(p),
      note: opts.rowNote ? opts.rowNote(p) : null,
      slots,
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

  const withXI = !!opts.lineupSlots;
  const options = SORT_OPTIONS.filter((o) => withXI || !o.lineupOnly);
  const list = h('ol', { class: 'plist' });
  const head = h('div', { class: `phead${withXI ? ' with-xi' : ''}`, role: 'row' });
  const tools = h('div', { class: 'plist-tools' });
  // A list without the XI column falls back to CA if XI was the last sort used.
  const effective = () => (options.some((o) => o.key === sort.key) ? sort : { key: 'ca', dir: 'desc' });

  const renderTools = () => {
    const cur = effective();
    const sortSel = h('select', { class: 'select select-sm', 'aria-label': 'Sort by',
      onchange: (e) => {
        const o = options.find((x) => x.key === e.target.value);
        sort = { key: o.key, dir: o.defaultDir };
        render();
      } },
      options.map((o) => h('option', { value: o.key, selected: o.key === cur.key }, `Sort: ${o.label}`)));
    const dirBtn = h('button', { type: 'button', class: 'tool-btn', 'aria-label': cur.dir === 'asc' ? 'Ascending' : 'Descending',
      onclick: () => { sort = { ...cur, dir: cur.dir === 'asc' ? 'desc' : 'asc' }; render(); } }, cur.dir === 'asc' ? '▲' : '▼');
    tools.replaceChildren(sortSel, dirBtn);
  };

  const render = () => {
    renderTools();
    const cur = effective();
    head.replaceChildren(
      ...options.map((c) => {
        const active = cur.key === c.key;
        return h('button', {
          type: 'button',
          class: `phead-btn col-${c.key}${active ? ' active' : ''}`,
          'aria-sort': active ? (cur.dir === 'asc' ? 'ascending' : 'descending') : 'none',
          onclick: () => {
            sort = active ? { key: c.key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.defaultDir };
            render();
          },
        }, c.key === 'pos' ? 'Pos' : c.label, active ? h('span', { class: 'sort-arrow' }, cur.dir === 'asc' ? '▲' : '▼') : null);
      })
    );
    list.replaceChildren(...sorted(rows, cur).map((r) => rowEl(r, opts.from, withXI)));
  };
  render();

  wrap.append(tools, head, list);
  return wrap;
}
