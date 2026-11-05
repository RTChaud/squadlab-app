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
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="16" cy="7" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="10" cy="17" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
};

export const icon = (name, cls = 'icon') => h('span', { class: cls, html: icons[name] });
