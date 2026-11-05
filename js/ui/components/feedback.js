// Toast messages and the error / notice sheet.

import { h } from '../dom.js';
import { openSheet } from './sheet.js';

let toastTimer = null;

export function toast(message, kind = 'ok') {
  const el = document.getElementById('toast');
  el.className = `toast show ${kind}`;
  el.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 4200);
}

/** Sheet listing what went wrong (or a notice when `tone` is 'info'). */
export function showError(title, details = [], note = 'Nothing was changed — your existing data is still available.', tone = 'error') {
  openSheet({
    title,
    titleClass: tone === 'error' ? 'danger' : '',
    content: [
      details.length
        ? h('ul', { class: 'sheet-list' }, details.slice(0, 12).map((d) => h('li', {}, d)),
            details.length > 12 ? h('li', {}, `…and ${details.length - 12} more.`) : null)
        : null,
      note ? h('p', { class: 'sheet-note' }, note) : null,
    ],
    actions: [{ label: 'OK', onClick: (close) => close() }],
  });
}

export const showNotice = (title, details = [], note = '') => showError(title, details, note, 'info');
