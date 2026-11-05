// Development graphs: plain SVG, no libraries, works offline.
//
// Rules: real observations only — no interpolation, no estimated months, no
// extrapolation. Dates are placed on a true time axis so irregular gaps stay
// irregular. A missing value (or a snapshot the player is absent from) breaks
// the line. CA and attributes never share an axis: each gets its own panel
// with a fixed scale (CA 1–200, attributes 1–20).

import { h } from '../dom.js';
import { formatGameDate } from '../../data/snapshot.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  kids.flat().forEach((c) => c && el.append(c));
  return el;
};

const dayNum = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const shortDate = (iso) => {
  const [y, m] = iso.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${String(y).slice(2)}`;
};

/** Marker shape path centred on (x, y). */
export function markerPath(shape, x, y, r = 4.5) {
  switch (shape) {
    case 'square': return `M${x - r},${y - r}h${2 * r}v${2 * r}h${-2 * r}z`;
    case 'triangle': return `M${x},${y - r * 1.15}L${x + r * 1.1},${y + r * 0.85}L${x - r * 1.1},${y + r * 0.85}z`;
    case 'diamond': return `M${x},${y - r * 1.25}L${x + r * 1.1},${y}L${x},${y + r * 1.25}L${x - r * 1.1},${y}z`;
    case 'down': return `M${x},${y + r * 1.15}L${x + r * 1.1},${y - r * 0.85}L${x - r * 1.1},${y - r * 0.85}z`;
    default: return `M${x - r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
  }
}

/** Small inline legend swatch (line + marker) for a series. */
export function swatch(series) {
  return s('svg', { class: 'swatch', viewBox: '0 0 22 12', width: 22, height: 12, 'aria-hidden': 'true' },
    s('line', { x1: 1, y1: 6, x2: 21, y2: 6, stroke: series.color, 'stroke-width': 2 }),
    s('path', { d: markerPath(series.shape, 11, 6, 3.6), fill: series.color }));
}

/**
 * @param {object} o
 *   points   [{ gameDate, present, values: { [seriesKey]: number|null } }] (chronological)
 *   panels   [{ key, title, min, max, ticks, series: [{ key, label, color, shape }] }]
 *   width    px
 */
export function DevChart(o) {
  const M = { l: 34, r: 14, t: 10, b: 26 };
  const W = Math.max(280, Math.floor(o.width));
  const iw = W - M.l - M.r;
  const pts = o.points;
  const d0 = dayNum(pts[0].gameDate), d1 = dayNum(pts[pts.length - 1].gameDate);
  const span = d1 - d0;
  const xOf = (iso) => (span === 0 ? M.l + iw / 2 : M.l + ((dayNum(iso) - d0) / span) * iw);

  // Date labels at real observation dates (first, last, a couple between).
  const tickIdx = (() => {
    const idx = pts.length <= 4 ? pts.map((_, i) => i) : [0, Math.round((pts.length - 1) / 3), Math.round((2 * (pts.length - 1)) / 3), pts.length - 1];
    const out = [];
    for (const i of idx) {
      if (out.length && xOf(pts[i].gameDate) - xOf(pts[out[out.length - 1]].gameDate) < 46) {
        if (i === pts.length - 1) out[out.length - 1] = i; // always keep the last date
        continue;
      }
      out.push(i);
    }
    return out;
  })();

  let active = pts.length - 1;
  for (let i = pts.length - 1; i >= 0; i--) if (pts[i].present) { active = i; break; }

  const readout = h('div', { class: 'readout', 'aria-live': 'polite' });
  const guides = [];
  const panelEls = o.panels.map((panel) => {
    const H = panel.height || 190;
    const ih = H - M.t - M.b;
    const yOf = (v) => M.t + ih - ((v - panel.min) / (panel.max - panel.min)) * ih;
    const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `${panel.title} over time` });

    // grid + y labels
    for (const t of panel.ticks) {
      svg.append(s('line', { x1: M.l, x2: W - M.r, y1: yOf(t), y2: yOf(t), class: 'grid' }));
      svg.append(s('text', { x: M.l - 6, y: yOf(t) + 4, class: 'ylab', 'text-anchor': 'end' }, document.createTextNode(String(t))));
    }
    // x labels
    for (const i of tickIdx) {
      const x = xOf(pts[i].gameDate);
      const anchor = x < M.l + 20 ? 'start' : x > W - M.r - 20 ? 'end' : 'middle';
      svg.append(s('text', { x, y: H - 7, class: 'xlab', 'text-anchor': anchor }, document.createTextNode(shortDate(pts[i].gameDate))));
    }

    const guide = s('line', { y1: M.t, y2: M.t + ih, class: 'guide' });
    svg.append(guide);
    guides.push(guide);

    // series: line segments broken at missing values, then markers on top
    for (const se of panel.series) {
      let seg = [];
      const segs = [];
      pts.forEach((p) => {
        const v = p.present ? p.values[se.key] : null;
        if (Number.isFinite(v)) seg.push([xOf(p.gameDate), yOf(v)]);
        else if (seg.length) { segs.push(seg); seg = []; }
      });
      if (seg.length) segs.push(seg);
      for (const sg of segs) {
        if (sg.length > 1) svg.append(s('path', { d: sg.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(''), class: 'line', stroke: se.color }));
      }
      for (const sg of segs) for (const [x, y] of sg) {
        svg.append(s('path', { d: markerPath(se.shape, x, y), fill: se.color, class: 'marker' }));
      }
    }

    // touch / pointer: nearest observation date
    const hit = s('rect', { x: 0, y: 0, width: W, height: H, class: 'hit' });
    const pick = (ev) => {
      const r = svg.getBoundingClientRect();
      const x = ((ev.clientX - r.left) / r.width) * W;
      let best = 0, bd = Infinity;
      pts.forEach((p, i) => { const dd = Math.abs(xOf(p.gameDate) - x); if (dd < bd) { bd = dd; best = i; } });
      setActive(best);
    };
    hit.addEventListener('pointerdown', pick);
    hit.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'mouse' || ev.buttons) pick(ev); });
    svg.append(hit);

    return h('figure', { class: 'chart-panel' },
      h('figcaption', { class: 'chart-title' }, panel.title, h('span', { class: 'chart-scale' }, `scale ${panel.min}–${panel.max}`)),
      svg);
  });

  const allSeries = o.panels.flatMap((p) => p.series);
  function setActive(i) {
    active = i;
    const p = pts[i];
    const x = xOf(p.gameDate);
    guides.forEach((g) => { g.setAttribute('x1', x); g.setAttribute('x2', x); });
    readout.replaceChildren(
      h('span', { class: 'readout-date' }, formatGameDate(p.gameDate)),
      p.present
        ? h('span', { class: 'readout-vals' }, allSeries.map((se) => {
            const v = p.values[se.key];
            return h('span', { class: 'readout-item' }, swatch(se), `${se.label} `, h('strong', {}, Number.isFinite(v) ? v : '—'));
          }))
        : h('span', { class: 'readout-vals muted' }, 'Not in this snapshot'),
    );
  }
  setActive(active);

  return h('div', { class: 'devchart' }, readout, panelEls);
}
