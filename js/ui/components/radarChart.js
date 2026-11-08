// Radar chart: plain SVG (no library, works offline).
//
// Fixed 0–20 radius for every chart, so players stay comparable. Unavailable
// values are never drawn as zero: their axis shows "Unavailable", and if any
// axis is unavailable the shape is left open (no filled polygon), joining
// only neighbouring known values.

import { h } from '../dom.js';
import { RADAR_SCALE } from '../../data/radar.js';
import { SCORE_BAND_EDGES } from '../../data/attributes.js';

const DASH_TXT = '—';
const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  kids.flat().forEach((c) => c && el.append(typeof c === 'string' ? document.createTextNode(c) : c));
  return el;
};

/** Split a label into short lines for the chart (full label shown on tap). */
function wrapLabel(text, max = 12) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 2);
}

/**
 * @param {object} o
 *   axes      [{ label, short?, value (number|null), display (string), marker?, band? ('a1'…'a6' or null = neutral) }]
 *   compact   smaller chart for two side by side (axis labels use `short`)
 *   showBands draw the faint red→green score bands behind the shape (only
 *             where higher means better for every axis)
 *   onSelect  (index) => void — tap on an axis label / point
 *   ariaLabel string
 * Returns { el, setActive(index) } or { el } with a message when < 3 axes have values.
 */
export function RadarChart(o) {
  const n = o.axes.length;
  const known = o.axes.filter((a) => a.value !== null).length;
  if (known < 3) {
    return { el: h('div', { class: 'empty radar-empty' },
      h('p', { class: 'empty-title' }, 'Not enough data to draw this chart'),
      h('p', { class: 'empty-text' }, `${known} of ${n} axes have values; at least 3 are needed.`)), setActive() {} };
  }

  // Compact (two charts side by side): short labels, larger text relative to the drawing.
  const C = !!o.compact;
  const W = C ? 220 : 400, H = C ? 196 : 316, cx = W / 2, cy = C ? 98 : 158, R = C ? 70 : 100, LR = R + (C ? 12 : 20);
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n; // clockwise from the top
  const pt = (i, v) => [cx + Math.cos(ang(i)) * (R * v) / RADAR_SCALE.max, cy + Math.sin(ang(i)) * (R * v) / RADAR_SCALE.max];
  // A small margin around the drawing keeps long single-word labels (e.g.
  // "Communication") and two-line top labels inside the chart.
  const PADX = C ? 4 : 20, PADY = C ? 22 : 6;
  const svg = s('svg', { class: `radar${C ? ' radar-compact' : ''}`, viewBox: `${-PADX} ${-PADY} ${W + 2 * PADX} ${H + 2 * PADY}`, role: 'img', 'aria-label': o.ariaLabel || 'Radar chart' });

  // Score bands: concentric polygon rings at the same score boundaries as the
  // attribute colours, so distance from the centre means the same on every
  // axis and for every player. Very low opacity — context only.
  if (o.showBands) {
    const ringPath = (v) => o.axes.map((_, i) => pt(i, v)).map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('') + 'Z';
    for (const b of SCORE_BAND_EDGES) {
      const d = b.from > 0 ? ringPath(b.to) + ringPath(b.from) : ringPath(b.to);
      svg.append(s('path', { class: `radar-band ${b.cls}`, d, 'fill-rule': 'evenodd' }));
    }
  }

  // grid: rings + spokes (muted)
  for (const ring of RADAR_SCALE.rings) {
    svg.append(s('polygon', { class: 'radar-ring', points: o.axes.map((_, i) => pt(i, ring).join(',')).join(' ') }));
  }
  const spokes = o.axes.map((_, i) => {
    const [x, y] = pt(i, RADAR_SCALE.max);
    const line = s('line', { class: 'radar-spoke', x1: cx, y1: cy, x2: x, y2: y });
    svg.append(line);
    return line;
  });

  // data
  const pts = o.axes.map((a, i) => (a.value === null ? null : pt(i, a.value)));
  if (known === n) {
    svg.append(s('polygon', { class: 'radar-area', points: pts.map((p) => p.join(',')).join(' ') }));
  } else {
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      if (a && b) svg.append(s('line', { class: 'radar-edge', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }));
    }
  }
  pts.forEach((p, i) => p && svg.append(s('circle', { class: `radar-dot ${o.axes[i].band || 'neutral'}`, cx: p[0], cy: p[1], r: C ? 4 : 4.5 })));

  // labels (+ value) and generous tap targets
  let yMin = cy - R, yMax = cy + R;
  const labelEls = o.axes.map((a, i) => {
    const c = Math.cos(ang(i)), sn = Math.sin(ang(i));
    const x = cx + c * LR, y = cy + sn * LR;
    const anchor = Math.abs(c) < 0.25 ? 'middle' : c > 0 ? 'start' : 'end';
    const lines = C ? [a.short || a.label] : wrapLabel(a.label);
    const total = lines.length + 1;
    const lh = C ? 21 : 14;
    const top = sn < -0.5 ? y - (total - 1) * lh : sn > 0.5 ? y + 6 : y - ((total - 1) * lh) / 2;
    if (C) { yMin = Math.min(yMin, top - lh); yMax = Math.max(yMax, top + (total - 1) * lh + 6); }
    const g = s('g', { class: `radar-label${a.value === null ? ' unavailable' : ''}`, 'data-i': i });
    lines.forEach((ln, k) => g.append(s('text', { x, y: top + k * lh, 'text-anchor': anchor, class: 'radar-name' }, ln + (k === lines.length - 1 && a.marker ? ` ${a.marker}` : ''))));
    g.append(s('text', { x, y: top + lines.length * lh, 'text-anchor': anchor, class: `radar-val ${a.value === null ? '' : a.band || 'neutral'}` }, a.value === null ? (C ? DASH_TXT : 'Unavailable') : a.display));
    svg.append(g);
    const hw = C ? 56 : 92;
    const hx = anchor === 'middle' ? x - hw / 2 : anchor === 'start' ? x - 8 : x - hw + 8;
    const hit = s('rect', { class: 'radar-hit', x: hx, y: top - lh, width: hw, height: total * lh + 12, rx: 8 });
    hit.addEventListener('click', () => select(i));
    svg.append(hit);
    if (pts[i]) {
      const dotHit = s('circle', { class: 'radar-hit', cx: pts[i][0], cy: pts[i][1], r: 14 });
      dotHit.addEventListener('click', () => select(i));
      svg.append(dotHit);
    }
    return g;
  });

  // Compact: trim the height to the drawing and its labels.
  if (C) svg.setAttribute('viewBox', `${-PADX} ${yMin - 4} ${W + 2 * PADX} ${yMax - yMin + 8}`);

  function setActive(i) {
    spokes.forEach((sp, k) => sp.classList.toggle('active', k === i));
    labelEls.forEach((g, k) => g.classList.toggle('active', k === i));
  }
  function select(i) { setActive(i); o.onSelect?.(i); }

  return { el: h('div', { class: 'radar-wrap' }, svg), setActive };
}

/**
 * Two players on one radar (Comparison tab). Fixed 1–20 scale, quiet grid, no
 * score bands. Each series keeps its column's style: left = solid line,
 * right = dashed line. Missing values are gaps: a full shape is drawn only when
 * every axis has a value, otherwise only neighbouring known points are joined.
 * A player with fewer than 3 values gets no shape and a note instead.
 *
 * @param {object} o
 *   labels    [string]                                   axis names, clockwise from the top
 *   series    [{ side: 'left'|'right', name, values: [number|null], display: [string|null] }]
 *   ariaLabel string
 */
export function RadarCompareChart(o) {
  const n = o.labels.length;
  const W = 400, H = 316, cx = W / 2, cy = 158, R = 100, LR = R + 20;
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, v) => [cx + Math.cos(ang(i)) * (R * v) / RADAR_SCALE.max, cy + Math.sin(ang(i)) * (R * v) / RADAR_SCALE.max];
  const PADX = 20, PADY = 6;
  const svg = s('svg', { class: 'radar radar-cmp', viewBox: `${-PADX} ${-PADY} ${W + 2 * PADX} ${H + 2 * PADY}`, 'aria-hidden': 'true' });

  for (const ring of RADAR_SCALE.rings) {
    svg.append(s('polygon', { class: 'radar-ring', points: o.labels.map((_, i) => pt(i, ring).join(',')).join(' ') }));
  }
  o.labels.forEach((_, i) => { const [x, y] = pt(i, RADAR_SCALE.max); svg.append(s('line', { class: 'radar-spoke', x1: cx, y1: cy, x2: x, y2: y })); });

  const notes = [];
  for (const se of o.series) {
    const known = se.values.filter((v) => v !== null).length;
    if (known < 3) {
      notes.push(`Not enough values to draw ${se.name}’s shape (${known} of ${n} axes have values).`);
      continue;
    }
    const pts = se.values.map((v, i) => (v === null ? null : pt(i, v)));
    const g = s('g', { class: `rc-series rc-${se.side}`, 'data-side': se.side });
    if (known === n) {
      g.append(s('polygon', { class: 'rc-area', points: pts.map((p) => p.join(',')).join(' ') }));
    } else {
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        if (a && b) g.append(s('line', { class: 'rc-edge', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }));
      }
    }
    pts.forEach((p) => p && g.append(s('circle', { class: 'rc-dot', cx: p[0], cy: p[1], r: 3.2 })));
    svg.append(g);
  }

  // Labels: axis name, then each player's value in their column's colour.
  o.labels.forEach((label, i) => {
    const c = Math.cos(ang(i)), sn = Math.sin(ang(i));
    const x = cx + c * LR, y = cy + sn * LR;
    const anchor = Math.abs(c) < 0.25 ? 'middle' : c > 0 ? 'start' : 'end';
    const lines = wrapLabel(label);
    const total = lines.length + 1, lh = 14;
    const top = sn < -0.5 ? y - (total - 1) * lh : sn > 0.5 ? y + 6 : y - ((total - 1) * lh) / 2;
    const g = s('g', { class: 'radar-label' });
    lines.forEach((ln, k) => g.append(s('text', { x, y: top + k * lh, 'text-anchor': anchor, class: 'radar-name' }, ln)));
    const vals = s('text', { x, y: top + lines.length * lh, 'text-anchor': anchor, class: 'rc-vals' });
    o.series.forEach((se, k) => {
      if (k) vals.append(s('tspan', { class: 'rc-sep' }, ' · '));
      vals.append(s('tspan', { class: `rc-val rc-${se.side}` }, se.display[i] ?? '—'));
    });
    g.append(vals);
    svg.append(g);
  });

  const sample = (side) => s('svg', { class: 'rc-sample', viewBox: '0 0 26 8', 'aria-hidden': 'true' },
    s('line', { class: `rc-sample-line rc-${side}`, x1: 1, y1: 4, x2: 25, y2: 4 }));
  const legend = h('div', { class: 'rc-legend' }, o.series.map((se) =>
    h('span', { class: `rc-key rc-key-${se.side}` }, sample(se.side), h('span', { class: 'rc-key-name' }, se.name))));
  const sr = h('ul', { class: 'sr-only' }, o.labels.map((label, i) =>
    h('li', {}, `${label}: ${o.series.map((se) => `${se.name} ${se.display[i] ?? 'unavailable'}`).join(', ')}`)));

  return h('div', { class: 'radar-wrap rc-wrap', role: 'group', 'aria-label': o.ariaLabel || 'Radar comparison' },
    svg, legend, ...notes.map((t) => h('p', { class: 'rc-note' }, t)), sr);
}
