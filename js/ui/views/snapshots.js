// Snapshots: the active career's timeline (by in-game season, newest first),
// read-only viewing of a past snapshot, comparing two snapshots, milestone
// pins and manual deletion.
// Routes: #/snapshots · #/snapshots/<date> · #/snapshots/compare?from=&to=

import { h, icon } from '../dom.js';
import {
  getHistory, getCareerMetrics, getPins, setPinned, deleteSnapshots, getSnapshotModel, getCareerStorage, getModel,
} from '../../store.js';
import { formatGameDate, resolveTeams, playerSummary } from '../../data/snapshot.js';
import { displayNameOf } from '../../data/players.js';
import { groupBySeason, seasonOf, clubCount, compareSnapshots, SQUAD_LABEL } from '../../data/development.js';
import { openSheet, confirmSheet } from '../components/sheet.js';
import { toast, showError } from '../components/feedback.js';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const pidOf = (key) => key.slice(key.lastIndexOf(':') + 1);
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

function fmtBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1e3))} KB`;
}

// ---- Timeline -------------------------------------------------------------------

let selecting = false;
let selected = new Set();

/** Confirm, then delete these dates. Resolves true when deleted. */
async function confirmDelete(dates) {
  const sorted = [...dates].sort().reverse();
  const ok = await confirmSheet({
    title: `Delete ${plural(sorted.length, 'snapshot')}?`,
    message: h('div', {},
      h('ul', { class: 'sheet-list snap-del-dates' }, sorted.map((d) => h('li', {}, formatGameDate(d)))),
      h('p', { class: 'sheet-text' }, `${sorted.length === 1 ? 'This date’s' : 'These dates’'} observations will disappear from historical graphs, Development and snapshot comparisons. Your other snapshots, player tags and saved lineups are kept.`)),
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return false;
  try {
    await deleteSnapshots(sorted);
    toast(`Deleted ${plural(sorted.length, 'snapshot')}`);
    return true;
  } catch (e) {
    showError('Could not delete', [String(e?.message || e)]);
    return false;
  }
}

function openSnapshotActions(meta, { latest, pinned, count, size }) {
  const date = meta.gameDate;
  const history = getHistory();
  const s = openSheet({
    title: formatGameDate(date),
    content: h('ul', { class: 'sheet-list' },
      h('li', {}, `${seasonOf(date).label} season`),
      count !== null ? h('li', {}, plural(count, 'club player')) : null,
      latest ? h('li', {}, 'Latest snapshot') : null,
      pinned ? h('li', {}, 'Pinned milestone') : null,
      size ? h('li', {}, `${fmtBytes(size)} of JSON data`) : null),
    actions: actions(),
  });
  function actions() {
    const other = latest ? history[1]?.gameDate : history[0].gameDate;
    const isPinned = getPins().has(date);
    return [
      { label: 'View squad', onClick: (close) => { close(); location.hash = `#/snapshots/${date}`; } },
      other ? { label: latest ? 'Compare with previous' : 'Compare with latest', kind: 'secondary',
        onClick: (close) => { close(); const [a, b] = [date, other].sort(); location.hash = `#/snapshots/compare?from=${a}&to=${b}`; } } : null,
      { label: isPinned ? 'Unpin milestone' : 'Pin as milestone', kind: 'secondary',
        onClick: async () => { await setPinned(date, !isPinned); s.setActions(actions()); } },
      latest ? null : { label: isPinned ? 'Unpin to delete' : 'Delete snapshot', kind: 'danger', disabled: isPinned,
        onClick: async (close) => { close(); await confirmDelete([date]); } },
    ].filter(Boolean);
  }
}

export async function SnapshotsView() {
  const history = getHistory();
  const metrics = await getCareerMetrics();
  const counts = new Map(metrics.map((m) => [m.gameDate, clubCount(m)]));
  const latestDate = history[0]?.gameDate;
  const body = h('div', { class: 'stack snaps' });
  const storageEl = h('div', { class: 'snap-storage' }, h('p', { class: 'snap-storage-line muted' }, 'Measuring storage…'));
  let sizes = new Map();

  selected = new Set([...selected].filter((d) => history.some((m) => m.gameDate === d)));

  const draw = () => {
    const pins = getPins();
    const deletable = (d) => d !== latestDate && !pins.has(d);
    for (const d of [...selected]) if (!deletable(d)) selected.delete(d);

    const rowFor = (m) => {
      const d = m.gameDate, latest = d === latestDate, pinned = pins.has(d);
      const badges = h('span', { class: 'snap-badges' },
        latest ? h('span', { class: 'snap-badge latest' }, 'Latest') : null,
        pinned ? h('span', { class: 'snap-badge pinned' }, icon('pin', 'snap-pin'), 'Pinned') : null);
      const main = h('span', { class: 'snap-main' },
        h('span', { class: 'snap-date' }, formatGameDate(d)),
        h('span', { class: 'snap-meta' }, counts.has(d) ? plural(counts.get(d), 'club player') : '—'));
      if (selecting) {
        const can = deletable(d);
        return h('li', {}, h('label', { class: `snap-row selectable${can ? '' : ' locked'}` },
          h('input', { type: 'checkbox', class: 'snap-check', disabled: !can, checked: selected.has(d), 'data-date': d,
            onchange: (e) => { if (e.target.checked) selected.add(d); else selected.delete(d); draw(); } }),
          main, badges));
      }
      return h('li', {}, h('button', {
        type: 'button', class: 'snap-row', 'data-date': d,
        onclick: () => openSnapshotActions(m, { latest, pinned, count: counts.get(d) ?? null, size: sizes.get(d) ?? null }),
      }, main, badges, icon('chevron', 'snap-chevron')));
    };

    const groups = groupBySeason(history);
    const toolbar = history.length > 1 ? h('div', { class: 'snap-toolbar' },
      selecting ? null : h('a', { class: 'btn btn-secondary snap-tool', href: '#/snapshots/compare' }, icon('compare'), 'Compare'),
      h('button', { type: 'button', class: 'btn btn-secondary snap-tool', onclick: () => { selecting = !selecting; selected.clear(); draw(); } },
        selecting ? 'Cancel' : 'Select')) : null;

    body.classList.toggle('selecting', selecting);
    body.replaceChildren(
      h('div', { class: 'card snap-summary' },
        h('p', { class: 'snap-summary-main' }, plural(history.length, 'snapshot'),
          history.length > 1 ? h('span', { class: 'muted' }, ` · ${formatGameDate(history[history.length - 1].gameDate)} – ${formatGameDate(latestDate)}`) : null),
        storageEl),
      toolbar,
      ...groups.map((g) => h('section', { class: 'snap-season', 'aria-label': `${g.label} season` },
        h('p', { class: 'list-head' }, `${g.label} season`),
        h('ul', { class: 'snap-list' }, g.items.map(rowFor)))),
      selecting ? h('div', { class: 'snap-selectbar' },
        h('span', { class: 'snap-selcount' }, selected.size ? `${selected.size} selected` : 'Select snapshots to delete'),
        h('button', { type: 'button', class: 'btn btn-danger', disabled: !selected.size,
          onclick: async () => { if (await confirmDelete([...selected])) { selecting = false; selected.clear(); } } },
        'Delete')) : null,
    );
  };
  draw();

  // Storage is filled in once measured (a snapshot stored before sizes were
  // recorded is measured once, then remembered).
  // Only the career's stored snapshot data is shown: the browser's own figure
  // for the whole app is too coarse to read alongside it.
  getCareerStorage().then((st) => {
    if (!st || !storageEl.isConnected) return;
    sizes = new Map(st.snapshots.map((x) => [x.gameDate, x.bytes]));
    storageEl.replaceChildren(st.careerBytes !== null
      ? h('p', { class: 'snap-storage-line' }, h('span', {}, 'Snapshot data'), h('b', {}, `≈ ${fmtBytes(st.careerBytes)}`), h('span', { class: 'snap-est' }, 'estimate'))
      : null);
  }).catch(() => { if (storageEl.isConnected) storageEl.replaceChildren(); });

  return { title: 'Snapshots', back: '#/', body };
}

// ---- Viewing one snapshot (read-only) ------------------------------------------------

function readOnlyList(players) {
  const rows = players.map(playerSummary).map((s, i) => ({ s, p: players[i] }))
    .sort((a, b) => (b.s.ca ?? -1) - (a.s.ca ?? -1) || a.s.positions.sortKey - b.s.positions.sortKey);
  return h('div', { class: 'card snapview-list' },
    h('div', { class: 'snapview-head' }, h('span', {}, 'Player'), h('span', {}, 'Pos'), h('span', { class: 'num' }, 'Age'), h('span', { class: 'num' }, 'CA'), h('span', { class: 'num' }, 'PA')),
    h('ul', { class: 'snapview-rows' }, rows.map(({ s, p }) => h('li', { class: 'snapview-row' },
      h('span', { class: 'snapview-name' }, displayNameOf(p)),
      h('span', { class: 'snapview-pos' }, s.positions.natural || '—'),
      h('span', { class: 'num muted' }, s.age ?? '—'),
      h('span', { class: 'num' }, s.ca ?? '—'),
      h('span', { class: 'num accent' }, s.pa ?? '—')))));
}

export async function SnapshotView({ date, query }) {
  const model = await getSnapshotModel(date);
  const latest = getModel();
  if (!model) {
    return { title: 'Snapshot', back: '#/snapshots', body: h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, 'Snapshot not found')) };
  }
  const teams = resolveTeams(model);
  const seen = new Set();
  const everyone = teams.flatMap((t) => t.players).filter((p) => (seen.has(p.uid) ? false : seen.add(p.uid)));
  const groups = [...teams, { key: 'all', label: 'All', players: everyone, fatal: false }];
  const key = groups.some((g) => g.key === query.get('squad')) ? query.get('squad') : 'first';
  const g = groups.find((x) => x.key === key);
  const isLatest = latest?.gameDate === date;

  const select = h('select', {
    class: 'select', id: 'snapview-squad', 'aria-label': 'Squad',
    onchange: (e) => location.replace(`#/snapshots/${date}?squad=${e.target.value}`),
  }, groups.map((x) => h('option', { value: x.key, selected: x.key === key }, `${x.label} (${x.fatal ? '—' : x.players.length})`)));

  return {
    title: 'Snapshot',
    subtitle: `${model.club?.name ?? '—'} · ${formatGameDate(date)}`,
    back: '#/snapshots',
    body: h('div', { class: 'stack snapview' },
      h('div', { class: 'viewing-banner', role: 'status' },
        icon('snapshots', 'viewing-icon'),
        h('p', {}, h('strong', {}, `Viewing ${formatGameDate(date)}`), h('span', {}, isLatest ? 'Latest snapshot' : 'Read-only')),
        h('a', { class: 'btn btn-primary viewing-back', href: `#/squad/${key === 'all' ? 'all' : key}` }, 'Back to latest')),
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'snapview-squad' }, 'Squad'), select),
      g.fatal ? h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, 'This squad could not be linked in this snapshot'))
        : g.players.length ? readOnlyList(g.players) : h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, 'No players in this squad'))),
  };
}

// ---- Comparing two snapshots -----------------------------------------------------------

export async function SnapshotCompareView({ query }) {
  const dates = getHistory().map((m) => m.gameDate).sort(); // ascending
  if (dates.length < 2) {
    return { title: 'Compare snapshots', back: '#/snapshots', body: h('div', { class: 'empty' },
      h('p', { class: 'empty-title' }, 'Only one snapshot'), h('p', { class: 'empty-text' }, 'Add another snapshot to compare dates.')) };
  }
  let to = dates.includes(query.get('to')) ? query.get('to') : dates[dates.length - 1];
  if (to === dates[0]) to = dates[1];
  let from = dates.includes(query.get('from')) && query.get('from') < to ? query.get('from') : dates[dates.indexOf(to) - 1];

  const metrics = await getCareerMetrics();
  const a = metrics.find((m) => m.gameDate === from), b = metrics.find((m) => m.gameDate === to);
  const cmp = compareSnapshots(a, b);
  const here = `/snapshots/compare?from=${from}&to=${to}`;
  const go = (f, t) => location.replace(`#/snapshots/compare?from=${f}&to=${t}`);
  const link = (key) => `#/player/${encodeURIComponent(pidOf(key))}/development?from=${encodeURIComponent(here)}`;

  const pick = (id, label, value, options, onChange) => h('div', { class: 'field' },
    h('label', { class: 'field-label', for: id }, label),
    h('select', { class: 'select', id, onchange: (e) => onChange(e.target.value) },
      options.map((d) => h('option', { value: d, selected: d === value }, formatGameDate(d)))));

  const person = (key, name, meta, right) => h('li', {}, h('a', { class: 'cmp-row', href: link(key) },
    h('span', { class: 'cmp-main' }, h('span', { class: 'cmp-name' }, name || '—'), h('span', { class: 'cmp-meta' }, meta)),
    right));
  const squadText = (r) => (r?.squad ? SQUAD_LABEL[r.squad] : 'Club');
  const caText = (r) => (Number.isInteger(r?.ca) ? `CA ${r.ca}` : null);

  const section = (title, items, render, empty) => h('section', { class: 'card cmp-section', 'aria-label': title },
    h('p', { class: 'cmp-title' }, title, h('span', { class: 'group-count' }, String(items.length))),
    items.length ? h('ul', { class: 'cmp-list' }, items.map(render)) : h('p', { class: 'muted small' }, empty));

  const gains = cmp.gains.filter((x) => x.change > 0).slice(0, 10);

  return {
    title: 'Compare snapshots',
    back: '#/snapshots',
    body: h('div', { class: 'stack cmp-snaps' },
      h('div', { class: 'cmp-pickers' },
        pick('cmp-from', 'Earlier', from, dates.filter((d) => d < to), (v) => go(v, to)),
        pick('cmp-to', 'Later', to, dates.filter((d) => d > dates[0]), (v) => go(v < from || v === from ? dates[dates.indexOf(v) - 1] : from, v))),
      section('Joined', cmp.joined, (x) => person(x.key, x.after.name,
        [squadText(x.after), caText(x.after), x.before?.club ? `previously ${x.before.club}` : null].filter(Boolean).join(' · ')), 'No players joined.'),
      section('Left', cmp.left, (x) => person(x.key, x.before.name,
        [squadText(x.before), caText(x.before), x.after ? (x.after.club ? `now ${x.after.club}` : null) : 'not recorded later'].filter(Boolean).join(' · ')), 'No players left.'),
      section('Biggest CA gains', gains, (x) => person(x.key, x.after.name, `${squadText(x.after)} · ${x.before.ca} → ${x.after.ca}`,
        h('span', { class: 'dev-change up' }, signed(x.change))), 'No CA gains between these dates.')),
  };
}

