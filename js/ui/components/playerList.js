// Shared player list used by squads and shortlists.
// Takes player records (one underlying object per player) and renders
// First name / Last name / Position / CA / PA. Missing values show "—".

import { h, orDash } from '../dom.js';
import { playerSummary } from '../../data/snapshot.js';
import { linkWithFrom } from '../../router.js';

const COLUMNS = [
  { key: 'name', label: 'Name', defaultDir: 'asc' },
  { key: 'pos', label: 'Pos', defaultDir: 'asc' },
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
      return collator.compare(a.lastName || '', b.lastName || '') ||
             collator.compare(a.firstName || '', b.firstName || '');
    case 'pos':
      return a.positions.sortKey - b.positions.sortKey;
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
    return compare(a, b, sort.key) * dir || compare(a, b, 'name');
  });
}

function rowEl(r, from) {
  const inner = [
    h('div', { class: 'pname' },
      h('span', { class: 'pfirst' }, orDash(r.firstName)),
      h('span', { class: 'plast' }, orDash(r.lastName)),
      r.note ? h('span', { class: 'pnote' }, r.note) : null,
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
  const rows = players.map((p) => ({ ...playerSummary(p), note: opts.rowNote ? opts.rowNote(p) : null }));
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

  const render = () => {
    head.replaceChildren(
      ...COLUMNS.map((c) => {
        const active = sort.key === c.key;
        return h('button', {
          type: 'button',
          class: `phead-btn col-${c.key}${active ? ' active' : ''}`,
          'aria-sort': active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none',
          onclick: () => {
            sort = active ? { key: c.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.defaultDir };
            render();
          },
        }, c.label, active ? h('span', { class: 'sort-arrow' }, sort.dir === 'asc' ? '▲' : '▼') : null);
      })
    );
    list.replaceChildren(...sorted(rows).map((r) => rowEl(r, opts.from)));
  };
  render();

  wrap.append(head, list);
  return wrap;
}
