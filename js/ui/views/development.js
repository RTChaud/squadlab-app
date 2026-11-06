// Development screen: historical graphs of CA and/or football attributes for
// one player, across every stored snapshot of the active career.

import { h } from '../dom.js';
import { getPlayerProfile, getPlayerHistory, getPref, setPref } from '../../store.js';
import { formatGameDate } from '../../data/snapshot.js';
import { ATTR_BY_KEY } from '../../data/attributes.js';
import { backTarget } from '../../router.js';
import { DevChart } from '../components/devChart.js';
import { MetricPicker } from '../components/metricPicker.js';

const MAX_ATTRS = 5;
const CA_SERIES = { key: 'ca', label: 'CA', color: '#f7861e', shape: 'circle' };
// Validated for the dark surface; marker shapes are the secondary encoding.
const ATTR_COLORS = ['#3987e5', '#199e70', '#c98500', '#d55181', '#9085e9'];
const ATTR_SHAPES = ['square', 'triangle', 'diamond', 'down', 'circle'];
const PREF_KEY = 'development.metrics';
const DEFAULT_SELECTION = { ca: true, attrs: [] };

function sanitize(sel) {
  if (!sel || typeof sel !== 'object') return { ...DEFAULT_SELECTION };
  const attrs = (Array.isArray(sel.attrs) ? sel.attrs : [])
    .filter((a) => a && ATTR_BY_KEY[a.key] && Number.isInteger(a.slot) && a.slot >= 0 && a.slot < MAX_ATTRS)
    .slice(0, MAX_ATTRS);
  return { ca: !!sel.ca, attrs };
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

let resizeHandler = null;

export async function DevelopmentView({ pid, query }) {
  const back = backTarget(query, `#/player/${encodeURIComponent(pid)}`);
  const [profile, history, savedSel] = await Promise.all([getPlayerProfile(pid), getPlayerHistory(pid), getPref(PREF_KEY, null)]);
  if (!profile || !profile.player) {
    return { title: 'Development', back, body: h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, 'Player not found')) };
  }
  const p = profile.player;
  const name = (p.common_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.name || 'Player').trim();

  let selected = sanitize(savedSel);
  const seriesFor = (key) => {
    if (key === 'ca') return CA_SERIES;
    const slot = selected.attrs.find((a) => a.key === key)?.slot ?? 0;
    return { key, label: ATTR_BY_KEY[key]?.label ?? key, color: ATTR_COLORS[slot], shape: ATTR_SHAPES[slot] };
  };

  // Observation window: first to last snapshot that contains this player.
  const presentIdx = history.map((x, i) => (x.present ? i : -1)).filter((i) => i >= 0);
  const span = presentIdx.length ? history.slice(presentIdx[0], presentIdx[presentIdx.length - 1] + 1) : [];
  const points = span.map((x) => ({ gameDate: x.gameDate, present: x.present, club: x.club, values: { ca: x.ca, ...x.attrs } }));
  const observations = presentIdx.length;

  const chartArea = h('div', { class: 'chart-area' });
  const picker = MetricPicker({
    selected: { ...selected, attrs: [...selected.attrs] },
    series: seriesFor,
    maxAttrs: MAX_ATTRS,
    onChange: (next) => {
      selected = sanitize(next);
      setPref(PREF_KEY, selected);
      picker.update({ ...selected, attrs: [...selected.attrs] });
      drawCharts();
    },
  });

  function drawCharts() {
    const notes = [];
    if (!points.length) {
      chartArea.replaceChildren(h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, 'No recorded history for this player')));
      return;
    }
    const keys = [...(selected.ca ? ['ca'] : []), ...selected.attrs.map((a) => a.key)];
    if (!keys.length) {
      chartArea.replaceChildren(h('div', { class: 'empty' },
        h('p', { class: 'empty-title' }, 'Choose what to plot'),
        h('p', { class: 'empty-text' }, 'Select CA, one or more attributes, or both.')));
      return;
    }
    const hasData = (k) => points.some((x) => x.present && Number.isFinite(x.values[k]));
    const missing = keys.filter((k) => !hasData(k));
    missing.forEach((k) => notes.push(`No recorded values for ${seriesFor(k).label} — nothing to plot.`));

    const panels = [];
    if (selected.ca && hasData('ca')) {
      panels.push({ key: 'ca', title: 'Current Ability (CA)', min: 1, max: 200, ticks: [1, 50, 100, 150, 200], height: 170, series: [CA_SERIES] });
    }
    const attrSeries = selected.attrs.filter((a) => hasData(a.key)).map((a) => seriesFor(a.key));
    if (attrSeries.length) {
      panels.push({ key: 'attrs', title: 'Attributes', min: 1, max: 20, ticks: [1, 5, 10, 15, 20], height: 210, series: attrSeries });
    }

    if (points.some((x) => !x.present)) notes.push('Gaps mark snapshots in which this player was not recorded.');

    const width = chartArea.clientWidth || Math.min(document.documentElement.clientWidth - 32, 728);
    chartArea.replaceChildren(...[
      notes.length ? h('div', { class: 'dev-notes' }, notes.map((n) => h('p', {}, n))) : null,
      panels.length ? DevChart({ points, panels, width }) : null,
      panels.length ? table(points, panels.flatMap((pp) => pp.series)) : null,
    ].filter(Boolean));
  }

  const clubs = [...new Set(points.filter((x) => x.present && x.club).map((x) => x.club))];
  const summary = points.length
    ? `${plural(observations, 'snapshot')}${observations > 1 ? ` · ${formatGameDate(points[0].gameDate)} – ${formatGameDate(points[points.length - 1].gameDate)}` : ` · ${formatGameDate(points[0].gameDate)}`}${clubs.length > 1 ? ` · ${clubs.join(' → ')}` : ''}`
    : '';

  // Draw once the view is in the page (so the width can be measured), and on resize.
  requestAnimationFrame(drawCharts);
  if (resizeHandler) window.removeEventListener('resize', resizeHandler);
  let last = 0;
  resizeHandler = () => {
    if (!chartArea.isConnected) { window.removeEventListener('resize', resizeHandler); resizeHandler = null; return; }
    if (Math.abs(chartArea.clientWidth - last) > 8) { last = chartArea.clientWidth; drawCharts(); }
  };
  window.addEventListener('resize', resizeHandler);

  return {
    title: name,
    subtitle: 'Development',
    back,
    body: h('div', { class: 'stack dev' },
      summary ? h('p', { class: 'dev-summary' }, summary) : null,
      profile.current ? null : h('p', { class: 'dev-summary muted' }, `Not in the latest snapshot; last recorded ${formatGameDate(profile.model.gameDate)}.`),
      picker,
      chartArea,
    ),
  };
}

function table(points, series) {
  return h('details', { class: 'group dev-table' },
    h('summary', {}, h('span', {}, 'Values as a table')),
    h('div', { class: 'table-scroll' },
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Date'), series.map((se) => h('th', {}, se.label)))),
        h('tbody', {}, points.map((x) => h('tr', {},
          h('td', {}, formatGameDate(x.gameDate)),
          series.map((se) => h('td', { class: 'num' }, x.present && Number.isFinite(x.values[se.key]) ? x.values[se.key] : '—'))))),
      )));
}
