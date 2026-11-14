// Development: the active career's club players ranked by CA gained.
// Route: #/development. Rows open the player's development graph.

import { h, icon } from '../dom.js';
import { getCareerMetrics, getPrefSync, setPref } from '../../store.js';
import { formatGameDate } from '../../data/snapshot.js';
import { WINDOWS, SQUAD_FILTERS, SQUAD_LABEL, developmentBoard, filterBySquad } from '../../data/development.js';

const PREF_KEY = 'devBoard';
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const pidOf = (key) => key.slice(key.lastIndexOf(':') + 1);

/** "13 Jul → 1 Aug 2026" (year once when both dates share it). */
function dateRange(a, b) {
  const fa = formatGameDate(a), fb = formatGameDate(b);
  return a.slice(0, 4) === b.slice(0, 4) ? `${fa.replace(/\s\d{4}$/, '')} → ${fb}` : `${fa} → ${fb}`;
}

function readPrefs() {
  const p = getPrefSync(PREF_KEY, null) || {};
  return {
    window: WINDOWS.some((w) => w.id === p.window) ? p.window : 'overall',
    squad: SQUAD_FILTERS.some((f) => f.id === p.squad) ? p.squad : 'all',
  };
}

function row(r, rank) {
  const href = `#/player/${encodeURIComponent(pidOf(r.key))}/development?from=${encodeURIComponent('/development')}`;
  const ok = r.status === 'ok';
  const tags = [
    r.note === 'joined' ? h('span', { class: 'dev-tag' }, 'Since joining') : null,
    r.note === 'coverage' ? h('span', { class: 'dev-tag' }, 'Shorter coverage') : null,
  ];
  const dates = ok ? dateRange(r.start.gameDate, r.end.gameDate) : `${formatGameDate(r.end.gameDate)} only`;
  return h('li', {},
    h('a', { class: `dev-row${ok ? '' : ' insufficient'}`, href, 'data-key': r.key },
      h('span', { class: 'dev-rank' }, ok ? String(rank) : ''),
      h('span', { class: 'dev-main' },
        h('span', { class: 'dev-name' }, r.name || '—'),
        h('span', { class: 'dev-meta' }, r.squad ? SQUAD_LABEL[r.squad] : 'Club', ok ? null : ' · Not enough history'),
        h('span', { class: 'dev-meta dev-dates' }, dates),
        tags.some(Boolean) ? h('span', { class: 'dev-tags' }, tags) : null),
      h('span', { class: 'dev-nums' },
        ok ? h('span', { class: `dev-change ${r.change > 0 ? 'up' : r.change < 0 ? 'down' : 'flat'}` }, signed(r.change)) : h('span', { class: 'dev-change flat' }, '—'),
        h('span', { class: 'dev-ca' }, ok ? `${r.start.ca} → ${r.end.ca}` : (r.end.ca ?? '—'))),
      icon('chevron', 'dev-chevron')));
}

export async function DevBoardView() {
  const metrics = await getCareerMetrics();
  const prefs = readPrefs();
  const body = h('div', { class: 'stack devboard' });

  const draw = () => {
    const board = developmentBoard(metrics, prefs.window);
    const rows = filterBySquad(board.rows, prefs.squad);
    const ranked = rows.filter((r) => r.status === 'ok');
    const short = rows.filter((r) => r.status !== 'ok');
    const counts = Object.fromEntries(SQUAD_FILTERS.map((f) => [f.id, filterBySquad(board.rows, f.id).length]));

    const seg = h('div', { class: 'seg seg-fill', role: 'group', 'aria-label': 'Time' },
      WINDOWS.map((w) => h('button', {
        type: 'button', class: `seg-btn${w.id === prefs.window ? ' on' : ''}`, 'aria-pressed': String(w.id === prefs.window),
        onclick: () => { prefs.window = w.id; setPref(PREF_KEY, { ...prefs }); draw(); },
      }, w.label)));

    const squadSelect = h('select', {
      class: 'select', id: 'devboard-squad', 'aria-label': 'Squad',
      onchange: (e) => { prefs.squad = e.target.value; setPref(PREF_KEY, { ...prefs }); draw(); },
    }, SQUAD_FILTERS.map((f) => h('option', { value: f.id, selected: f.id === prefs.squad }, `${f.label} (${counts[f.id]})`)));

    const range = board.latestDate
      ? `To ${formatGameDate(board.latestDate)}${board.cutoff ? ` · from ${formatGameDate(board.cutoff)}` : ''}`
      : '';

    body.replaceChildren(
      seg,
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'devboard-squad' }, 'Squad'), squadSelect),
      range ? h('p', { class: 'dev-range' }, range) : null,
      rows.length
        ? h('ol', { class: 'dev-list' }, ranked.map((r, i) => row(r, i + 1)), short.map((r) => row(r, null)))
        : h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, 'No club players in this squad')));
  };
  draw();

  return { title: 'Development', back: '#/', body };
}
