// Radar chart: plain SVG (no library, works offline).
//
// Fixed 0–20 radius for every chart, so players stay comparable. Unavailable
// values are never drawn as zero: their axis shows "Unavailable", and if any
// axis is unavailable the shape is left open (no filled polygon), joining
// only neighbouring known values.

import { h } from '../dom.js';
import { RADAR_SCALE } from '../../data/radar.js';

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
 *   axes      [{ label, value (number|null), display (string) , marker? }]
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

  const W = 400, H = 340, cx = W / 2, cy = 168, R = 100, LR = R + 20;
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n; // clockwise from the top
  const pt = (i, v) => [cx + Math.cos(ang(i)) * (R * v) / RADAR_SCALE.max, cy + Math.sin(ang(i)) * (R * v) / RADAR_SCALE.max];
  const svg = s('svg', { class: 'radar', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': o.ariaLabel || 'Radar chart' });

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
  for (const ring of RADAR_SCALE.rings) {
    const [x, y] = pt(0, ring);
    svg.append(s('text', { class: 'radar-tick', x: x + 4, y: y + 3 }, String(ring)));
  }

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
  pts.forEach((p) => p && svg.append(s('circle', { class: 'radar-dot', cx: p[0], cy: p[1], r: 4 })));

  // labels (+ value) and generous tap targets
  const labelEls = o.axes.map((a, i) => {
    const c = Math.cos(ang(i)), sn = Math.sin(ang(i));
    const x = cx + c * LR, y = cy + sn * LR;
    const anchor = Math.abs(c) < 0.25 ? 'middle' : c > 0 ? 'start' : 'end';
    const lines = wrapLabel(a.label);
    const total = lines.length + 1;
    const lh = 14;
    const top = sn < -0.5 ? y - (total - 1) * lh : sn > 0.5 ? y + 6 : y - ((total - 1) * lh) / 2;
    const g = s('g', { class: `radar-label${a.value === null ? ' unavailable' : ''}`, 'data-i': i });
    lines.forEach((ln, k) => g.append(s('text', { x, y: top + k * lh, 'text-anchor': anchor, class: 'radar-name' }, ln + (k === lines.length - 1 && a.marker ? ` ${a.marker}` : ''))));
    g.append(s('text', { x, y: top + lines.length * lh, 'text-anchor': anchor, class: 'radar-val' }, a.value === null ? 'Unavailable' : a.display));
    svg.append(g);
    const hx = anchor === 'middle' ? x - 46 : anchor === 'start' ? x - 8 : x - 84;
    const hit = s('rect', { class: 'radar-hit', x: hx, y: top - 14, width: 92, height: total * lh + 12, rx: 8 });
    hit.addEventListener('click', () => select(i));
    svg.append(hit);
    if (pts[i]) {
      const dotHit = s('circle', { class: 'radar-hit', cx: pts[i][0], cy: pts[i][1], r: 14 });
      dotHit.addEventListener('click', () => select(i));
      svg.append(dotHit);
    }
    return g;
  });

  function setActive(i) {
    spokes.forEach((sp, k) => sp.classList.toggle('active', k === i));
    labelEls.forEach((g, k) => g.classList.toggle('active', k === i));
  }
  function select(i) { setActive(i); o.onSelect?.(i); }

  return { el: h('div', { class: 'radar-wrap' }, svg), setActive };
}
