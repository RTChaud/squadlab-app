// Bottom sheet (dialog on wider screens) + a promise-based confirm built on it.

import { h } from '../dom.js';
import { BackupExporter } from './backupExport.js';

let openCount = 0;
const stack = []; // open sheets, newest last — Escape closes only the top one

// iOS keeps fixed elements sized to the whole screen when the keyboard opens,
// so a sheet would slide under the keyboard and its top off-screen. While a
// sheet is open, fit the backdrop to the visible area (the visual viewport).
function fitToViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const keyboard = window.innerHeight - vv.height > 120;
  for (const b of document.querySelectorAll('.sheet-backdrop')) {
    b.style.top = `${vv.offsetTop}px`;
    b.style.height = `${vv.height}px`;
    b.style.bottom = 'auto';
    b.classList.toggle('kb-open', keyboard);
  }
  if (keyboard) requestAnimationFrame(keepFieldVisible);
}

// With the keyboard up the sheet is short: keep the field being typed in clear
// of the sheet's edges and of a sticky action bar (Apply / Clear all).
function keepFieldVisible() {
  const el = document.activeElement;
  const sheet = el?.closest?.('.sheet');
  if (!sheet || !el.matches('input, textarea, select')) return;
  const box = sheet.getBoundingClientRect();
  const bar = sheet.querySelector('.sheet-actions');
  const sticky = bar && !bar.hidden && getComputedStyle(bar).position === 'sticky';
  const bottom = sticky ? bar.getBoundingClientRect().top : box.bottom;
  const top = box.top + (sheet.querySelector('.cp-top') && sheet.contains(el) && !el.closest('.cp-top') ? sheet.querySelector('.cp-top').getBoundingClientRect().height : 0);
  const r = el.getBoundingClientRect();
  const gap = 12;
  if (r.bottom > bottom - gap) sheet.scrollTop += r.bottom - (bottom - gap);
  else if (r.top < top + gap) sheet.scrollTop -= (top + gap) - r.top;
}
const onFocusIn = () => { if (document.querySelector('.sheet-backdrop.kb-open')) requestAnimationFrame(keepFieldVisible); };

function watchViewport(on) {
  const vv = window.visualViewport;
  if (!vv) return;
  const fn = on ? 'addEventListener' : 'removeEventListener';
  vv[fn]('resize', fitToViewport);
  vv[fn]('scroll', fitToViewport);
  document[fn]('focusin', onFocusIn);
}

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
    if (--openCount === 0) { document.body.classList.remove('sheet-open'); watchViewport(false); }
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
  if (openCount++ === 0) watchViewport(true);
  fitToViewport();
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
