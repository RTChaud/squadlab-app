// My Club: dashboard for the active career's club, from the latest snapshot
// and the career's stored snapshots. Route: #/club (opened from Home's banner).
// One squad selector drives every section; selections are remembered.

import { h, icon } from '../dom.js';
import { getModel, getCareer, getCareerMeta, getCareerMetrics, getPrefSync, setPref } from '../../store.js';
import { formatGameDate } from '../../data/snapshot.js';
import { formatMoneyDisplay } from '../../data/money.js';
import { formatPositions } from '../../data/positions.js';
import { resolveNation, loadNations } from '../../data/nations.js';
import { clubIdentity, FALLBACK_CREST } from '../../data/clubIdentity.js';
import { openSheet } from '../components/sheet.js';
import { DevChart } from '../components/devChart.js';
import { FamiliarityPitch } from '../components/familiarityPitch.js';
import {
  SQUADS, PERIODS, SQUAD_LABEL, clubPlayers, inSquad, squadStats, distribution, DISTRIBUTIONS,
  periodEndpoints, developmentSummary, squadEvolution, nationalities, contractOutlook, wageConcentration,
  positionCoverage, membershipChanges, daysBetween, monthsBetween, COVER_MIN,
} from '../../data/clubDashboard.js';

const PREF = 'club';
const HERE = '/club';
const plural = (n, w, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v, dp = 1) => (isNum(v) ? (Number.isInteger(v) ? String(v) : v.toFixed(dp)) : '—');
const money = (v) => (isNum(v) ? formatMoneyDisplay(v) : '—');
// Small non-zero averages keep two decimals so +0.04 never reads as +0.0.
const signed = (v, dp = 1) => { if (!isNum(v)) return '—'; const d = !Number.isInteger(v) && Math.abs(v) < 0.1 ? 2 : dp; return v > 0 ? `+${num(v, d)}` : v < 0 ? `−${num(Math.abs(v), d)}` : '0'; };
const pct = (v) => (isNum(v) ? `${(v * 100).toFixed(v * 100 >= 10 || v === 0 ? 0 : 1)}%` : '—');
const playerHref = (pid) => `#/player/${encodeURIComponent(pid)}?from=${encodeURIComponent(HERE)}`;
const SECTIONS = ['nations', 'contracts', 'wages', 'positions'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthYear = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** "1 year 2 months", "3 months", "1 year", or "less than a month". */
function tenure(from, to) {
  const m = monthsBetween(from, to);
  const y = Math.floor(m / 12), r = m % 12;
  const parts = [y ? plural(y, 'year') : null, r ? plural(r, 'month') : null].filter(Boolean);
  return parts.length ? parts.join(' ') : 'less than a month';
}

function readPrefs() {
  const p = getPrefSync(PREF, null) || {};
  return {
    squad: SQUADS.some((x) => x.id === p.squad) ? p.squad : 'all',
    period: PERIODS.some((x) => x.id === p.period) ? p.period : 'overall',
    dist: Object.hasOwn(DISTRIBUTIONS, p.dist) ? p.dist : 'age',
    open: Object.fromEntries(SECTIONS.map((k) => [k, typeof p.open?.[k] === 'boolean' ? p.open[k] : true])),
  };
}

// ---- Small building blocks -----------------------------------------------------------------

/** A player's name as a link to his profile (when he has a persistent ID). */
const who = (r, extra = null) => (r.pid
  ? h('a', { class: 'cl-player', href: playerHref(r.pid) }, r.name, extra)
  : h('span', { class: 'cl-player' }, r.name, extra));

/** Bottom sheet listing players, each a link. `right(r)` → value text. */
function playerSheet(title, rows, right, sub = null) {
  const s = openSheet({
    title,
    content: h('div', { class: 'cl-sheet' },
      sub ? h('p', { class: 'sheet-text muted' }, sub) : null,
      rows.length
        ? h('ul', { class: 'cl-sheet-list' }, rows.map((r) => h('li', {},
          h(r.pid ? 'a' : 'span', { class: 'cl-sheet-row', href: r.pid ? playerHref(r.pid) : null, onclick: () => s.close() },
            h('span', { class: 'cl-sheet-name' }, r.name, r.squad ? h('span', { class: 'cl-sheet-sq' }, SQUAD_LABEL[r.squad]) : null),
            h('span', { class: 'cl-sheet-val' }, right(r))))))
        : h('p', { class: 'sheet-text muted' }, 'No players.')),
    actions: [{ label: 'Close', kind: 'secondary', onClick: (close) => close() }],
  });
}

/** Record holders: the first `max` names, then "+N more" opening the full list. */
function holders(list, title, valueText, max = 3) {
  if (!list.length) return h('span', { class: 'muted' }, '—');
  const shown = list.slice(0, max);
  return h('span', { class: 'cl-holders' },
    shown.flatMap((r, i) => [i ? ', ' : null, who(r)]),
    list.length > max ? h('button', { type: 'button', class: 'cl-more', onclick: () => playerSheet(title, list, () => valueText) }, ` +${list.length - max} more`) : null);
}

const section = (key, title, open, onToggle, ...body) => {
  const d = h('details', { class: 'card cl-section', 'data-section': key, open },
    h('summary', { class: 'cl-sum' }, h('span', {}, title), icon('chevron', 'cl-chev')), h('div', { class: 'cl-body' }, ...body));
  d.addEventListener('toggle', () => onToggle(key, d.open));
  return d;
};
const block = (key, title, ...body) => h('section', { class: 'card cl-block', 'data-section': key, 'aria-label': title }, h('h2', { class: 'cl-h' }, title), ...body);
const note = (text) => h('p', { class: 'cl-note' }, text);

// ---- Sections --------------------------------------------------------------------------------

function header(model, meta) {
  const name = model.club?.name || '—';
  const crest = h('img', { class: 'club-crest-img', src: FALLBACK_CREST, alt: '', width: 48, height: 48, decoding: 'async' });
  const watermark = h('img', { class: 'club-watermark', src: FALLBACK_CREST, alt: '', 'aria-hidden': 'true', decoding: 'async' });
  const el = h('section', { class: 'club-banner cl-hero fallback-crest', 'aria-label': name },
    h('span', { class: 'club-banner-deco', 'aria-hidden': 'true' }, watermark),
    h('span', { class: 'club-crest' }, crest),
    h('div', { class: 'club-text' },
      h('h1', { class: 'club-name cl-name' }, name),
      h('p', { class: 'cl-date' }, formatGameDate(model.gameDate)),
      meta.managerSince ? h('p', { class: 'cl-since' }, `Manager since ${formatGameDate(meta.managerSince)} (${tenure(meta.managerSince, model.gameDate)})`) : null));
  clubIdentity(model.club).then((id) => {
    const [a, b] = id.colours;
    if (a) { el.style.setProperty('--club-a', a); el.style.setProperty('--club-b', b || a); el.classList.add('has-colours'); }
    if (!id.crestIsFallback) {
      crest.addEventListener('error', () => { crest.src = FALLBACK_CREST; watermark.src = FALLBACK_CREST; el.classList.add('fallback-crest'); }, { once: true });
      crest.src = id.crest; watermark.src = id.crest; el.classList.remove('fallback-crest');
    }
  });
  return el;
}

function statGroup(title, s, { fmt = (v) => num(v), total = false, minLabel = 'Minimum', maxLabel = 'Maximum', holdersFor = 'both', showMin = true, unit = '', holderMax = 3, minHolders = s.minHolders, maxHolders = s.maxHolders, showCoverage = true } = {}) {
  const cell = (label, value) => h('div', { class: 'cl-stat' }, h('span', { class: 'cl-stat-label' }, label), h('span', { class: 'cl-stat-value' }, value));
  const cells = [
    showMin ? cell(minLabel, fmt(s.min)) : null,
    cell(maxLabel, fmt(s.max)),
    cell('Average', fmt(s.mean)),
    cell('Median', fmt(s.median)),
    total ? cell('Total', fmt(s.sum)) : null,
  ].filter(Boolean);
  return h('div', { class: 'cl-group', 'data-group': title },
    h('p', { class: 'cl-group-title' }, title),
    h('div', { class: `cl-stats n${cells.length}${total ? ' with-total' : ''}` }, cells),
    s.known ? h('div', { class: 'cl-records' },
      holdersFor === 'both' ? h('p', { class: 'cl-record', 'data-record': 'min' }, h('span', { class: 'cl-record-label' }, `${minLabel} ${fmt(s.min)}${unit}`), holders(minHolders, `${title}: ${minLabel.toLowerCase()}`, fmt(s.min), holderMax)) : null,
      h('p', { class: 'cl-record', 'data-record': 'max' }, h('span', { class: 'cl-record-label' }, `${maxLabel} ${fmt(s.max)}${unit}`), holders(maxHolders, `${title}: ${maxLabel.toLowerCase()}`, fmt(s.max), holderMax))) : null,
    showCoverage && s.known < s.count ? h('p', { class: 'cl-cover' }, `${title} known for ${s.known} of ${s.count} players`) : null);
}

/** Birth date as a sortable string, or null. */
const dob = (r) => (typeof r.p.birth_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.p.birth_date) ? r.p.birth_date : null);
/** Players sharing the youngest/oldest age, the actual youngest/oldest (by birth date) first. */
const byBirth = (list, youngestFirst) => [...list].sort((a, b) => {
  const x = dob(a), y = dob(b);
  if (x && y && x !== y) return youngestFirst ? y.localeCompare(x) : x.localeCompare(y);
  if (!x !== !y) return x ? -1 : 1;
  return a.name.localeCompare(b.name);
});

function headline(rows) {
  const st = squadStats(rows);
  return block('stats', 'Squad statistics',
    h('p', { class: 'cl-count' }, h('b', {}, String(st.count)), ` ${st.count === 1 ? 'player' : 'players'}`),
    h('div', { class: 'cl-groups' },
      statGroup('CA', st.ca),
      statGroup('PA', st.pa),
      statGroup('Development headroom', st.headroom, { holdersFor: 'max', showMin: false }),
      statGroup('Monthly salary', st.salary, { fmt: money, total: true, showCoverage: false }),
      statGroup('Age', st.age, { minLabel: 'Youngest', maxLabel: 'Oldest', holderMax: 1,
        minHolders: byBirth(st.age.minHolders, true), maxHolders: byBirth(st.age.maxHolders, false) })));
}

function periodLine(ep, periodId) {
  const p = PERIODS.find((x) => x.id === periodId);
  const days = daysBetween(ep.start.gameDate, ep.end.gameDate);
  const tag = ep.coverage === 'shorter'
    ? h('span', { class: 'cl-tag warn' }, `Shorter than ${p.short}: history starts ${formatGameDate(ep.start.gameDate)}`)
    : ep.coverage === 'longer' ? h('span', { class: 'cl-tag' }, `Nearest earlier snapshot: ${plural(days, 'day')}`) : null;
  return h('div', { class: 'cl-period' },
    h('p', { class: 'cl-dates' }, `${formatGameDate(ep.start.gameDate)} → ${formatGameDate(ep.end.gameDate)}`, h('span', { class: 'muted' }, ` · ${plural(days, 'day')}`)),
    tag);
}

function developmentBlock(metrics, rows, prefs, squad, setPeriod) {
  const ep = periodEndpoints(metrics, prefs.period);
  const seg = h('div', { class: 'seg seg-fill cl-periods', role: 'group', 'aria-label': 'Period' },
    PERIODS.map((p) => h('button', { type: 'button', class: `seg-btn${p.id === prefs.period ? ' on' : ''}`, 'aria-pressed': String(p.id === prefs.period), onclick: () => setPeriod(p.id) }, p.label)));
  if (ep.insufficient) {
    return block('development', 'Development', seg,
      h('div', { class: 'empty cl-empty' }, h('p', { class: 'empty-title' }, 'Not enough history'),
        h('p', { class: 'empty-text' }, 'Only one snapshot is stored. Development appears once a second in-game date is imported.')));
  }
  const cohort = rows.filter((r) => r.pid).map((r) => r.pid);
  const d = developmentSummary(ep.start, ep.end, cohort);
  const squadName = SQUADS.find((x) => x.id === squad).label;
  const cohortNote = squad === 'all'
    ? 'Current club players, compared with their own record on the start date.'
    : `Current ${squadName} players, including any who were in another club squad on the start date.`;
  const body = d.compared
    ? [
      h('div', { class: 'cl-stats n3 cl-dev-stats' },
        h('div', { class: 'cl-stat' }, h('span', { class: 'cl-stat-label' }, 'Net CA change'), h('span', { class: `cl-stat-value ${d.total > 0 ? 'up' : d.total < 0 ? 'down' : ''}` }, signed(d.total, 0))),
        h('div', { class: 'cl-stat' }, h('span', { class: 'cl-stat-label' }, 'Average'), h('span', { class: 'cl-stat-value' }, signed(d.mean))),
        h('div', { class: 'cl-stat' }, h('span', { class: 'cl-stat-label' }, 'Median'), h('span', { class: 'cl-stat-value' }, signed(d.median)))),
      h('div', { class: 'cl-records' },
        h('p', { class: 'cl-record', 'data-record': 'gain' }, h('span', { class: 'cl-record-label' }, d.gain ? `Biggest gain ${signed(d.gain.value, 0)}` : 'Biggest gain'), d.gain ? holders(d.gain.holders, 'Biggest CA gain', signed(d.gain.value, 0)) : h('span', { class: 'muted' }, 'No CA gains')),
        h('p', { class: 'cl-record', 'data-record': 'decline' }, h('span', { class: 'cl-record-label' }, d.decline ? `Biggest decline ${signed(d.decline.value, 0)}` : 'Biggest decline'), d.decline ? holders(d.decline.holders, 'Biggest CA decline', signed(d.decline.value, 0)) : h('span', { class: 'muted' }, 'No CA declines'))),
      h('div', { class: 'cl-trio' },
        h('button', { type: 'button', class: 'cl-trio-item up', onclick: () => playerSheet('Improving CA', d.rows.filter((x) => x.change > 0), (x) => `${x.from} → ${x.to} · ${signed(x.change, 0)}`) }, h('b', {}, String(d.improving)), 'Improving'),
        h('button', { type: 'button', class: 'cl-trio-item', onclick: () => playerSheet('Unchanged CA', d.rows.filter((x) => x.change === 0), (x) => `${x.to}`) }, h('b', {}, String(d.unchanged)), 'Unchanged'),
        h('button', { type: 'button', class: 'cl-trio-item down', onclick: () => playerSheet('Declining CA', d.rows.filter((x) => x.change < 0).reverse(), (x) => `${x.from} → ${x.to} · ${signed(x.change, 0)}`) }, h('b', {}, String(d.declining)), 'Declining')),
      h('div', { class: 'cl-attrs' },
        h('p', { class: 'cl-group-title' }, 'Attribute points (Technical, Mental, Physical)'),
        h('p', { class: 'cl-attrs-net' }, h('b', { class: d.attrs.net > 0 ? 'up' : d.attrs.net < 0 ? 'down' : '' }, signed(d.attrs.net, 0)), ' net attribute points · not CA'),
        h('div', { class: 'cl-attr-groups' }, d.attrs.groups.map((g) => h('span', { class: 'cl-attr-group' }, `${g.label} `, h('b', {}, signed(g.net, 0))))),
        d.attrs.compared < d.attrs.expected ? h('p', { class: 'cl-cover' }, `Incomplete coverage: ${d.attrs.compared} of ${d.attrs.expected} attribute values recorded at both dates; missing values are left out.`) : null),
    ]
    : [h('div', { class: 'empty cl-empty' }, h('p', { class: 'empty-title' }, 'No comparable players'),
      h('p', { class: 'empty-text' }, `None of these players were recorded at the club with a CA on ${formatGameDate(ep.start.gameDate)}.`))];
  return block('development', 'Development', seg, periodLine(ep, prefs.period),
    note(cohortNote),
    ...body);
}

function bars(dist, kind, title) {
  const max = Math.max(1, ...dist.bands.map((b) => b.rows.length), kind === 'salary' ? 0 : dist.unknown.length);
  const valueText = (r) => {
    const v = DISTRIBUTIONS[kind].valueOf(r);
    return DISTRIBUTIONS[kind].money ? money(v) : num(v);
  };
  const bar = (label, rows, detail, cls = '') => h('li', {}, h('button', {
    type: 'button', class: `cl-bar ${cls}`, 'data-band': label, disabled: !rows.length,
    'aria-label': `${label}: ${plural(rows.length, 'player')}`,
    onclick: () => playerSheet(`${title}: ${detail}`, [...rows].sort((a, b) => (DISTRIBUTIONS[kind].valueOf(b) ?? -1) - (DISTRIBUTIONS[kind].valueOf(a) ?? -1) || a.name.localeCompare(b.name)), valueText),
  },
  h('span', { class: 'cl-bar-label' }, label),
  h('span', { class: 'cl-bar-track' }, h('span', { class: 'cl-bar-fill', style: `width:${(rows.length / max) * 100}%` })),
  h('span', { class: 'cl-bar-count' }, String(rows.length))));
  return h('ul', { class: 'cl-bars' },
    dist.bands.map((b) => bar(b.label, b.rows, b.detail)),
    dist.unknown.length && kind !== 'salary' ? bar('Unknown', dist.unknown, 'unknown', 'unknown') : null);
}

function distributionBlock(rows, prefs, setDist) {
  const kinds = Object.keys(DISTRIBUTIONS);
  const seg = h('div', { class: 'seg seg-fill', role: 'group', 'aria-label': 'Distribution' },
    kinds.map((k) => h('button', { type: 'button', class: `seg-btn${k === prefs.dist ? ' on' : ''}`, 'aria-pressed': String(k === prefs.dist), onclick: () => setDist(k) }, k === 'salary' ? 'Salary' : DISTRIBUTIONS[k].title)));
  return block('distribution', 'Distributions', seg,
    h('p', { class: 'cl-group-title' }, DISTRIBUTIONS[prefs.dist].title),
    bars(distribution(rows, prefs.dist), prefs.dist, DISTRIBUTIONS[prefs.dist].title));
}

/** "Nice" axis for a range of values. */
function axis(vals, { floor0 = false, pad = 0.08, minSpan = 0 } = {}) {
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (floor0) lo = 0;
  if (hi - lo < minSpan) { const c = (hi + lo) / 2; lo = floor0 ? 0 : c - minSpan / 2; hi = floor0 ? Math.max(hi, minSpan) : c + minSpan / 2; }
  if (lo === hi) { lo -= 1; hi += 1; }
  const span = hi - lo; lo -= floor0 ? 0 : span * pad; hi += span * pad;
  const raw = (hi - lo) / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const min = Math.floor(lo / step) * step, max = Math.ceil(hi / step) * step;
  const ticks = []; for (let t = min; t <= max + step / 2; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return { min, max, ticks };
}
const shortMoneyTick = (v) => (v >= 1e6 ? `£${(v / 1e6).toFixed(v % 1e6 ? 1 : 0)}m` : v >= 1e3 ? `£${Math.round(v / 1e3)}k` : `£${v}`);

function evolutionBlock(metrics, squad) {
  const ev = squadEvolution(metrics, squad);
  if (ev.length < 2) {
    return block('evolution', 'Squad evolution', h('div', { class: 'empty cl-empty' }, h('p', { class: 'empty-title' }, 'Not enough history'), h('p', { class: 'empty-text' }, 'Trends appear once a second snapshot is stored.')));
  }
  const points = ev.map((e) => ({ gameDate: e.gameDate, present: true, values: { ca: e.avgCa, pa: e.avgPa, age: e.avgAge, salary: e.salary, count: e.count } }));
  const vals = (k) => points.map((p) => p.values[k]).filter(isNum);
  const panel = (key, title, series, opts = {}) => {
    const v = series.flatMap((se) => vals(se.key));
    return v.length ? { key, title, height: 150, ...axis(v, opts), series, format: opts.format } : null;
  };
  const f1 = (v) => v.toFixed(1);
  const panels = [
    panel('ability', 'Average CA and PA', [
      { key: 'ca', label: 'Avg CA', color: '#f7861e', shape: 'circle', format: f1 },
      { key: 'pa', label: 'Avg PA', color: '#8ab4ff', shape: 'square', format: f1 }], { minSpan: 20 }),
    panel('age', 'Average age', [{ key: 'age', label: 'Avg age', color: '#c9a0ff', shape: 'diamond', format: f1 }], { minSpan: 2 }),
    panel('salary', 'Total monthly salary', [{ key: 'salary', label: 'Salary', color: '#7fd892', shape: 'triangle', format: (v) => money(v) }], { floor0: true, format: shortMoneyTick }),
    panel('count', 'Players', [{ key: 'count', label: 'Players', color: '#e6e6e6', shape: 'circle' }], { floor0: true, minSpan: 10 }),
  ].filter(Boolean);
  const width = Math.min(document.querySelector('.view')?.clientWidth || 360, 720) - 30;
  return block('evolution', 'Squad evolution',
    note('Changing-squad trends: signings, departures and promotions move these figures without any player developing.'),
    DevChart({ points, panels, width, marginLeft: 44, perPanel: true }));
}

function nationsSection(rows, careerId, open, onToggle) {
  const n = nationalities(rows, (id) => resolveNation(id, careerId));
  const row = (cls, flag, name, count, share, onclick, attrs = {}) => h('li', {}, h('button', { type: 'button', class: `cl-row ${cls}`, onclick, ...attrs },
    h('span', { class: 'cl-flag', 'aria-hidden': 'true' }, flag),
    h('span', { class: 'cl-row-main' }, name),
    h('span', { class: 'cl-row-num' }, String(count)),
    h('span', { class: 'cl-row-pct' }, pct(share))));
  return section('nations', 'Nationalities', open, onToggle,
    h('ul', { class: 'cl-list' },
      n.rows.map((x) => row('', x.flag || '·', x.name, x.count, x.share, () => playerSheet(x.name, x.players, () => ''), { 'data-nation': x.name })),
      n.others.count ? row('others', '·', 'Others', n.others.count, n.others.share,
        () => playerSheet('Others', n.others.players, (r) => othersOf(r, careerId, n.others.nations)), { 'data-nation': 'Others' }) : null));
}

/** For the Others list: which of the grouped nationalities this player holds. */
function othersOf(r, careerId, nations) {
  const ids = [r.p.nation_id, ...(Array.isArray(r.p.second_nation_ids) ? r.p.second_nation_ids : [])].filter((id) => Number.isInteger(id) && id > 0);
  return [...new Set(ids.map((id) => resolveNation(id, careerId)?.name).filter((x) => x && nations.includes(x)))].join(', ');
}

function contractsSection(rows, model, open, onToggle) {
  const c = contractOutlook(rows, model.gameDate, model.raw);
  const endText = (r) => `${formatGameDate(r.end)} · ${money(r.salary)}`;
  const line = (label, list, salary, salaryKnown, sheetTitle, cls = '') => h('li', {}, h('button', {
    type: 'button', class: `cl-row ${cls}`, disabled: !list.length, onclick: () => playerSheet(sheetTitle, list, endText, 'Ordered by expiry date.'),
  },
  h('span', { class: 'cl-row-main' }, label, salary !== undefined ? h('span', { class: 'cl-row-sub' }, list.length ? `${money(salary)} a month${salaryKnown < list.length ? ` · salary known for ${salaryKnown} of ${list.length}` : ''}` : '') : null),
  h('span', { class: 'cl-row-num' }, String(list.length))));
  return section('contracts', 'Contract outlook', open, onToggle,
    h('ul', { class: 'cl-list' },
      c.windows.map((w) => line(`Expiring within ${w.months} months`, w.rows, w.salary, w.salaryKnown, `Contracts expiring by ${formatGameDate(w.limit)}`)),
      c.expired.length ? line('Already expired', c.expired, undefined, 0, 'Expired contracts', 'warn') : null,
      c.unknown.length ? h('li', {}, h('button', { type: 'button', class: 'cl-row unknown', onclick: () => playerSheet('Expiry unknown', c.unknown, () => '—') }, h('span', { class: 'cl-row-main' }, 'Expiry unknown'), h('span', { class: 'cl-row-num' }, String(c.unknown.length)))) : null,
      c.otherClub.length ? h('li', {}, h('button', { type: 'button', class: 'cl-row unknown', onclick: () => playerSheet('Contract with another club', c.otherClub, (r) => r.p.contract?.club_name || '—', 'Players on loan here keep their parent club’s contract.') }, h('span', { class: 'cl-row-main' }, 'Contract with another club', h('span', { class: 'cl-row-sub' }, 'On loan here')), h('span', { class: 'cl-row-num' }, String(c.otherClub.length)))) : null));
}

function wagesSection(rows, open, onToggle) {
  const w = wageConcentration(rows);
  return section('wages', 'Wage concentration', open, onToggle,
    w.top.length ? h('ol', { class: 'cl-list cl-top' }, w.top.map((r) => h('li', {}, h(r.pid ? 'a' : 'span', { class: 'cl-row', href: r.pid ? playerHref(r.pid) : null },
      h('span', { class: 'cl-row-main' }, r.name, r.squad ? h('span', { class: 'cl-row-sub' }, SQUAD_LABEL[r.squad]) : null),
      h('span', { class: 'cl-row-val' }, money(r.salary)))))) : h('p', { class: 'muted small' }, 'No salaries recorded.'),
    w.top.length ? h('div', { class: 'cl-stats n2' },
      h('div', { class: 'cl-stat', 'data-stat': 'top' }, h('span', { class: 'cl-stat-label' }, `Top ${w.top.length} combined`),
        h('span', { class: 'cl-stat-value' }, money(w.topSum), w.share === null ? null : [' ', h('span', { class: 'cl-stat-pct' }, `(${pct(w.share)})`)])),
      h('div', { class: 'cl-stat', 'data-stat': 'bill' }, h('span', { class: 'cl-stat-label' }, 'Wage bill'), h('span', { class: 'cl-stat-value' }, money(w.total)))) : null);
}

function positionsSection(rows, open, onToggle) {
  const pc = positionCoverage(rows);
  const by = Object.fromEntries(pc.positions.map((p) => [p.code, p.rows]));
  return section('positions', 'Position coverage', open, onToggle,
    FamiliarityPitch(null, {
      counts: Object.fromEntries(pc.positions.map((p) => [p.code, p.rows.length])),
      onSelect: (code) => playerSheet(`${formatPositions([code.toUpperCase()])}: familiarity ${COVER_MIN}+`, by[code] || [], (r) => `Familiarity ${r.fam}`),
    }));
}

function changesSection(metrics, prefs, squad) {
  const ep = periodEndpoints(metrics, prefs.period);
  if (ep.insufficient) {
    return block('changes', 'Snapshot changes', h('p', { class: 'muted small' }, 'Changes appear once a second snapshot is stored.'));
  }
  const ch = membershipChanges(ep.start, ep.end, squad, metrics);
  const squadName = SQUADS.find((x) => x.id === squad).label;
  const pidOf = (key) => key.slice(key.lastIndexOf(':') + 1);
  const list = (key, title, items, meta) => h('div', { class: 'cl-change', 'data-change': key },
    h('p', { class: 'cl-group-title' }, title, h('span', { class: 'group-count' }, String(items.length))),
    items.length ? h('ul', { class: 'cl-list' }, items.map((x) => h('li', {}, h('a', { class: 'cl-row', href: playerHref(pidOf(x.key)) },
      h('span', { class: 'cl-row-main' }, (x.after || x.before).name, meta(x) ? h('span', { class: 'cl-row-sub' }, meta(x)) : null),
      h('span', { class: 'cl-row-when' }, monthYear(x.date)))))) : h('p', { class: 'muted small' }, 'None.'));
  const sq = (r) => (r?.squad ? SQUAD_LABEL[r.squad] : 'Club');
  return block('changes', 'Snapshot changes',
    h('p', { class: 'cl-dates' }, `${formatGameDate(ep.start.gameDate)} → ${formatGameDate(ep.end.gameDate)}`),
    list('in', 'Transfers in', ch.joinedClub, (x) => (x.before?.club ? `from ${x.before.club}` : null)),
    list('out', 'Transfers out', ch.leftClub, (x) => (x.after?.club ? `to ${x.after.club}` : null)),
    squad !== 'all' ? list('moved-in', `Moved into ${squadName} from another club squad`, ch.movedIn, (x) => `from ${sq(x.before)}`) : null,
    squad !== 'all' ? list('moved-out', `Moved from ${squadName} to another club squad`, ch.movedOut, (x) => `now ${sq(x.after)}`) : null);
}

// ---- View ---------------------------------------------------------------------------------

export async function ClubView() {
  const model = getModel();
  if (!model) return { title: 'My Club', back: '#/', body: h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, 'No data yet')) };
  const [metrics] = await Promise.all([getCareerMetrics(), loadNations()]);
  const careerId = getCareer().careerId;
  const all = clubPlayers(model.raw);
  const prefs = readPrefs();
  const body = h('div', { class: 'stack club-dash' });
  const save = () => setPref(PREF, { ...prefs, open: { ...prefs.open } });
  const onToggle = (key, isOpen) => { prefs.open[key] = isOpen; save(); };

  const draw = () => {
    const rows = inSquad(all, prefs.squad);
    const counts = Object.fromEntries(SQUADS.map((x) => [x.id, inSquad(all, x.id).length]));
    const select = h('select', { class: 'select', id: 'club-squad', 'aria-label': 'Squad',
      onchange: (e) => { prefs.squad = e.target.value; save(); draw(); } },
    SQUADS.map((x) => h('option', { value: x.id, selected: x.id === prefs.squad }, `${x.label} (${counts[x.id]})`)));
    // Each section is built on its own: one that fails shows why, the rest still appear.
    const safe = (title, fn) => {
      try { return fn(); } catch (e) {
        console.error(e);
        return h('section', { class: 'card cl-block cl-failed', 'aria-label': title }, h('h2', { class: 'cl-h' }, title),
          h('p', { class: 'cl-cover' }, `This section couldn’t be shown: ${String(e?.message || e)}`));
      }
    };
    body.replaceChildren(
      safe('My Club', () => header(model, getCareerMeta())),
      h('div', { class: 'field cl-squad' }, h('label', { class: 'field-label', for: 'club-squad' }, 'Squad'), select),
      safe('Squad statistics', () => headline(rows)),
      safe('Development', () => developmentBlock(metrics, rows, prefs, prefs.squad, (id) => { prefs.period = id; save(); draw(); })),
      safe('Distributions', () => distributionBlock(rows, prefs, (k) => { prefs.dist = k; save(); draw(); })),
      safe('Squad evolution', () => evolutionBlock(metrics, prefs.squad)),
      safe('Nationalities', () => nationsSection(rows, careerId, prefs.open.nations, onToggle)),
      safe('Contract outlook', () => contractsSection(rows, model, prefs.open.contracts, onToggle)),
      safe('Wage concentration', () => wagesSection(rows, prefs.open.wages, onToggle)),
      safe('Position coverage', () => positionsSection(rows, prefs.open.positions, onToggle)),
      safe('Snapshot changes', () => changesSection(metrics, prefs, prefs.squad)));
  };
  draw();
  return { title: 'My Club', back: '#/', body };
}
