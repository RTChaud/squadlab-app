// Tiny DOM helper: h('div', { class: 'x', onclick: fn }, child, 'text', …)

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v; // only ever used with static strings
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const DASH = '—';
export const orDash = (v) => (v === null || v === undefined || v === '' ? DASH : v);

// Inline SVG icons (static markup).
export const icons = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 0l-4.5 4.5M12 4l4.5 4.5M5 14v4a2 2 0 002 2h10a2 2 0 002-2v-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  squad: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="17" cy="9" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16.5 14c2.6.2 4.5 2 4.5 4.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="4.5" cy="6" r="1.4" fill="currentColor"/><circle cx="4.5" cy="12" r="1.4" fill="currentColor"/><circle cx="4.5" cy="18" r="1.4" fill="currentColor"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 14v4a2 2 0 002 2h10a2 2 0 002-2v-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  restore: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 102.4-5.7M4 4v4h4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 8v4l3 2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  data: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="2.8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 6v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12v6c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-6" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9.5 17h-19z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.2" fill="currentColor"/></svg>',
  chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v16h16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.5 15l3.5-4 3 2.5 5-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  contract: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3h8l4 4v13a1 1 0 01-1 1h-11a1 1 0 01-1-1V4a1 1 0 011-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M14 3v4.5h4.5M8.5 12h7M8.5 15.5h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12.6V4.5a1 1 0 011-1h8.1a1 1 0 01.7.3l7.4 7.4a1 1 0 010 1.4l-8.1 8.1a1 1 0 01-1.4 0L3.8 13.3a1 1 0 01-.3-.7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="8.2" cy="8.2" r="1.6" fill="currentColor"/></svg>',
  pitch: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 12h16" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 3v3h6V3M9 21v-3h6v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  tactic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.8 3.8l4.4 4.4M8.2 3.8L3.8 8.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="5.8" cy="18" r="2.4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.6 18c5.6 0 9.4-2.6 9.4-8.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14.9 11.9L18 8.8l3.1 3.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.5 4.5h4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="0.1 3.2"/></svg>',
  compare: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="7" height="16" rx="1.6" fill="none" stroke="currentColor" stroke-width="2"/><rect x="13.5" y="4" width="7" height="16" rx="1.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 9h2M6 13h2M16 9h2M16 13h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  columns: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.5 5v14M14.5 5v14" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15 15l5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="16" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="10" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
};

export const icon = (name, cls = 'icon') => h('span', { class: cls, html: icons[name] });
