// Horizontally scrollable player table for Squad and Shortlists.
//
// - Name is pinned on the left while the other columns scroll.
// - The heading row sticks under the page header and follows the body's
//   horizontal scroll (it lives outside the scroller so it can stick).
// - Tapping a row (or the name link) opens the profile; the position cell is
//   its own button that shows the full familiarity list and never navigates.

import { h, DASH } from '../dom.js';
import { openSheet } from './sheet.js';
import { FamiliarityPitch } from './familiarityPitch.js';
import { attrBand, attributeDirection } from '../../data/attributes.js';
import { DEFAULT_LINEUPS } from '../../data/lineups.js';
import { columnDef, attrValue, devChange, NAME_MIN_REM, NAME_WIDE_REM, NAME_FIT_REM, ATTR_CHOICE } from '../../data/listView.js';
import { linkWithFrom } from '../../router.js';

const TIER_NAME = Object.fromEntries(DEFAULT_LINEUPS.map((d) => [d.tier, d.name]));

// Wrap between positions, never inside one ("ST (C)" stays on one line).
const keepTogether = (text) => text.replace(/ \(/g, ' (');
const num = (v, cls = '') => h('div', { class: `tc num ${cls}${v === null ? ' dash' : ''}` }, v === null ? DASH : String(v));

/** Same pitch diagram as the profile, in a sheet (never navigates). */
function openPositions(row) {
  openSheet({
    title: row.name.main,
    titleClass: 'sheet-title-sm',
    content: [h('p', { class: 'muted small pos-sheet-sub' }, 'Position familiarity'), FamiliarityPitch(row.p)],
    actions: [{ label: 'Close', kind: 'secondary', onClick: (close) => close() }],
  });
}

function cell(row, col, ctx) {
  switch (col.id) {
    case 'xi':
      return h('div', { class: 'tc xi-cell' }, row.slots.length
        ? row.slots.map((x) => h('span', { class: `xi t${x.tier}`, title: `${TIER_NAME[x.tier]} · ${x.slot}`, 'aria-label': `${TIER_NAME[x.tier]} ${x.slot}` }, x.slot))
        : h('span', { class: 'sr-only' }, 'Not assigned'));
    case 'name': {
      const n = row.name;
      const label = n.common || !n.last ? [h('span', { class: 'plast' }, n.main)]
        : [h('span', { class: 'pfirst' }, n.first || ''), h('span', { class: 'plast' }, n.last)];
      return h('div', { class: 'tc name-cell' },
        row.pid ? h('a', { class: 'pname-link', href: ctx.href(row) }, label) : h('span', { class: 'pname-link' }, label));
    }
    case 'pos': {
      const nat = row.positions.natural;
      return h('div', { class: 'tc pos-cell' },
        h('button', {
          type: 'button', class: 'pos-btn',
          'aria-label': `${nat || 'No natural position'}${row.extraPositions ? `, plus ${row.extraPositions} more` : ''}. Show position familiarity`,
          onclick: (e) => { e.stopPropagation(); openPositions(row); },
        },
          h('span', { class: nat ? 'pos-nat-text' : 'dash' }, nat ? keepTogether(nat) : DASH),
          row.extraPositions ? h('span', { class: 'pos-more' }, `+${row.extraPositions}`) : null));
    }
    case 'age': return num(row.age, 'muted-num');
    case 'ca': return num(row.ca);
    case 'pa': return num(row.pa, 'pa');
    case 'squad': return h('div', { class: `tc text${row.team ? '' : ' dash'}` }, row.team ? row.team.short : DASH);
    case 'club': return h('div', { class: `tc text clip${row.club ? '' : ' dash'}`, title: row.club || '' }, row.club || DASH);
    case 'nat': {
      if (!row.nations.length) return h('div', { class: 'tc dash' }, DASH);
      const names = row.nations.map((n) => n.name).join(', ');
      return h('div', { class: 'tc nat-cell', title: names, 'aria-label': names },
        row.nations.map((n) => (n.flag ? h('span', { class: 'tflag', 'aria-hidden': 'true' }, n.flag) : h('span', { class: 'tflag-text' }, n.name.slice(0, 3)))));
    }
    case 'foot': return h('div', { class: `tc text${row.foot ? '' : ' dash'}` }, row.foot || DASH);
    default: {
      if (col.dev) {
        const c = devChange(row, col, ctx.dev);
        return h('div', { class: `tc num delta d-${c.tone}`, title: c.title, 'aria-label': c.label }, c.text);
      }
      if (col.attr) {
        const v = attrValue(row.p, col.attr);
        const band = attrBand(v, attributeDirection(col.attr));
        return h('div', { class: 'tc num' },
          v === null ? h('span', { class: 'dash', 'aria-label': `${ATTR_CHOICE[col.attr].label} unavailable` }, DASH)
            : h('span', { class: `tval attr-val ${band || 'none'}`, 'aria-label': `${ATTR_CHOICE[col.attr].label} ${v}` }, String(v)));
      }
      return h('div', { class: 'tc' });
    }
  }
}

/**
 * @param {object} o
 *   rows (already filtered + sorted), columns [ids], sort { key, dir },
 *   onSort(colId), from (route to return to), dev (change context),
 *   scrollX, onScrollX(x)
 */
export function PlayerTable(o) {
  const cols = o.columns.map(columnDef);
  // Default columns fit an iPhone with a compact Name; once extra columns make
  // the table scroll anyway, Name gets more room so long names stay readable.
  const othersRem = cols.reduce((sum, c) => sum + (c.width ?? 0), 0);
  const nameRem = othersRem > NAME_FIT_REM ? NAME_WIDE_REM : NAME_MIN_REM;
  const fixedRem = othersRem + nameRem;
  const template = cols.map((c) => (c.id === 'name' ? `minmax(${nameRem}rem, 1fr)` : `${c.width}rem`)).join(' ');
  const minWidth = `calc(${fixedRem}rem + ${cols.length - 1} * var(--tgap) + 2 * var(--tpad))`;
  const gridStyle = `grid-template-columns:${template}; min-width:${minWidth}`;
  const ctx = { dev: o.dev, href: (row) => linkWithFrom(`/player/${encodeURIComponent(row.pid)}`, o.from) };

  const headRow = h('div', { class: 'trow thead-row', role: 'row', style: gridStyle }, cols.map((c) => {
    const active = o.sort.key === c.id;
    return h('button', {
      type: 'button', role: 'columnheader',
      class: `th${c.num ? ' num' : ''}${c.id === 'name' ? ' name-cell' : ''}${active ? ' active' : ''}`,
      'aria-sort': active ? (o.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none',
      'aria-label': `Sort by ${c.label}`, title: c.label,
      onclick: () => o.onSort(c.id),
    }, h('span', { class: 'th-text' }, c.head), active ? h('span', { class: 'sort-arrow' }, o.sort.dir === 'asc' ? '▲' : '▼') : null);
  }));
  const head = h('div', { class: 'thead', role: 'rowgroup' }, headRow);

  const body = h('div', { class: 'tbody', role: 'rowgroup' }, o.rows.map((row) => h('div', {
    class: `trow${row.pid ? ' link' : ''}`, role: 'row', style: gridStyle, dataset: { pid: row.pid || '' },
    onclick: (e) => {
      if (!row.pid || e.target.closest('button, a')) return; // controls handle themselves
      location.hash = ctx.href(row).slice(1);
    },
  }, cols.map((c) => cell(row, c, ctx)))));

  const scroller = h('div', { class: 'tscroll' }, body);
  const table = h('div', { class: 'ptable', role: 'table', 'aria-label': 'Players', 'aria-rowcount': String(o.rows.length + 1) }, head, scroller);

  // Keep heading and body aligned; remember the position for Back.
  let syncing = false;
  const sync = (from, to) => {
    if (syncing) return;
    syncing = true;
    to.scrollLeft = from.scrollLeft;
    table.classList.toggle('scrolled-x', from.scrollLeft > 2);
    o.onScrollX?.(from.scrollLeft);
    requestAnimationFrame(() => { syncing = false; });
  };
  scroller.addEventListener('scroll', () => sync(scroller, head), { passive: true });
  head.addEventListener('scroll', () => sync(head, scroller), { passive: true });

  table.restoreScrollX = (x) => {
    if (!x) return;
    scroller.scrollLeft = x;
    head.scrollLeft = scroller.scrollLeft;
    table.classList.toggle('scrolled-x', scroller.scrollLeft > 2);
  };
  return table;
}
