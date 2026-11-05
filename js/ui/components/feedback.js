// Toast messages and the import error sheet.

import { h } from '../dom.js';

let toastTimer = null;

export function toast(message, kind = 'ok') {
  const el = document.getElementById('toast');
  el.className = `toast show ${kind}`;
  el.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3800);
}

/** Modal-style sheet listing what went wrong. */
export function showError(title, details = [], note = 'Nothing was changed — your previously imported data is still available.') {
  const close = () => sheet.remove();
  const sheet = h('div', { class: 'sheet-backdrop', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'err-title',
    onclick: (e) => { if (e.target === sheet) close(); } },
    h('div', { class: 'sheet' },
      h('h2', { id: 'err-title', class: 'sheet-title' }, title),
      details.length
        ? h('ul', { class: 'sheet-list' }, details.slice(0, 12).map((d) => h('li', {}, d)),
            details.length > 12 ? h('li', {}, `…and ${details.length - 12} more.`) : null)
        : null,
      note ? h('p', { class: 'sheet-note' }, note) : null,
      h('button', { type: 'button', class: 'btn btn-primary btn-block', onclick: close }, 'OK'),
    )
  );
  document.body.append(sheet);
  sheet.querySelector('button').focus();
}
