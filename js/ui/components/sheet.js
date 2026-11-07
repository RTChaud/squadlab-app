// Bottom sheet (dialog on wider screens) + a promise-based confirm built on it.

import { h } from '../dom.js';
import { BackupExporter } from './backupExport.js';

let openCount = 0;
const stack = []; // open sheets, newest last — Escape closes only the top one

/**
 * @param {object} o
 *   title, titleClass, content (Node|Node[]), actions [{label, kind, onClick, disabled}],
 *   onClose(), dismissible (default true)
 */
export function openSheet(o) {
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    const i = stack.indexOf(close);
    if (i !== -1) stack.splice(i, 1);
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    if (--openCount === 0) document.body.classList.remove('sheet-open');
    o.onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && o.dismissible !== false && stack[stack.length - 1] === close) { e.stopImmediatePropagation(); close(); }
  };

  const actionsEl = h('div', { class: 'sheet-actions' });
  const setActions = (actions = []) => {
    actionsEl.replaceChildren(...actions.map((a) =>
      h('button', {
        type: 'button',
        class: `btn btn-block ${a.kind === 'danger' ? 'btn-danger' : a.kind === 'secondary' ? 'btn-secondary' : a.kind === 'text' ? 'btn-text' : 'btn-primary'}`,
        disabled: !!a.disabled,
        onclick: () => a.onClick?.(close),
      }, a.label)
    ));
    actionsEl.hidden = actions.length === 0;
  };
  setActions(o.actions);

  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title || 'Dialog' },
    h('div', { class: 'sheet-grabber', 'aria-hidden': 'true' }),
    o.title ? h('h2', { class: `sheet-title ${o.titleClass || ''}` }, o.title) : null,
    h('div', { class: 'sheet-content' }, o.content),
    actionsEl,
  );
  const backdrop = h('div', {
    class: 'sheet-backdrop',
    onclick: (e) => { if (e.target === backdrop && o.dismissible !== false) close(); },
  }, sheet);

  document.body.append(backdrop);
  document.body.classList.add('sheet-open');
  openCount++;
  stack.push(close);
  document.addEventListener('keydown', onKey);
  // Move focus into the sheet so keys (e.g. Escape) don't act on the page behind.
  sheet.setAttribute('tabindex', '-1');
  sheet.focus({ preventScroll: true });
  return { close, el: sheet, setActions, actionsEl };
}

/**
 * Ask before doing something. Resolves true (confirmed) or false.
 * @param {object} o
 *   title, message (string|Node), details [strings], confirmLabel, cancelLabel,
 *   danger (bool), offerBackup (bool), ack (string — checkbox text that must be ticked)
 */
export function confirmSheet(o) {
  return new Promise((resolve) => {
    let result = false;
    const ack = o.ack
      ? h('input', { type: 'checkbox', id: 'sheet-ack', onchange: () => update() })
      : null;
    const content = [
      o.message ? (typeof o.message === 'string' ? h('p', { class: 'sheet-text' }, o.message) : o.message) : null,
      o.details?.length ? h('ul', { class: 'sheet-list' }, o.details.map((d) => h('li', {}, d))) : null,
      o.offerBackup ? BackupExporter({ label: 'Export a backup first' }) : null,
      ack ? h('label', { class: 'ack', for: 'sheet-ack' }, ack, h('span', {}, o.ack)) : null,
    ];
    const actions = () => [
      { label: o.confirmLabel || 'Continue', kind: o.danger ? 'danger' : 'primary', disabled: ack && !ack.checked,
        onClick: (close) => { result = true; close(); } },
      { label: o.cancelLabel || 'Cancel', kind: 'secondary', onClick: (close) => close() },
    ];
    const s = openSheet({ title: o.title, titleClass: o.danger ? 'danger' : '', content, actions: actions(), onClose: () => resolve(result) });
    function update() { s.setActions(actions()); }
  });
}
