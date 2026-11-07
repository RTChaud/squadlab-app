// Shared pieces for position & role analysis (player profile and Comparison):
// the position + role selectors for one phase, the familiarity chip and the
// information sheet (score explanation + catalogue version and source).

import { h, DASH } from '../dom.js';
import { openSheet } from './sheet.js';
import { famBand } from '../../data/positions.js';
import { positionByCode, rolesFor, roleInfoContent } from '../../data/roles.js';

let uid = 0;

/**
 * Position and role selectors for one phase. Roles are filtered by the chosen
 * position and phase; changing position clears a role that isn't listed there.
 * @param {object} o  cat, phase, sel { position, role }, onChange(nextSel, { clearedRole })
 */
export function RoleSelectors(o) {
  const n = ++uid;
  const pos = o.sel.position;
  const roles = pos ? rolesFor(o.cat, pos, o.phase) : [];
  const posSelect = h('select', {
    class: 'select select-sm', id: `role-pos-${n}`, 'data-role-pos': o.phase,
    onchange: (e) => {
      const position = e.target.value || null;
      const keep = position && o.sel.role && rolesFor(o.cat, position, o.phase).some((r) => r.id === o.sel.role);
      const clearedRole = !keep && o.sel.role ? o.cat.roles.get(o.sel.role) || null : null;
      o.onChange({ position, role: keep ? o.sel.role : null }, { clearedRole });
    },
  },
    h('option', { value: '', selected: !pos }, 'Choose position'),
    o.cat.positions.map((p) => h('option', { value: p.code, selected: p.code === pos }, `${p.label} · ${p.short}`)));
  const roleSelect = h('select', {
    class: 'select select-sm', id: `role-role-${n}`, 'data-role-role': o.phase, disabled: !pos,
    onchange: (e) => o.onChange({ position: pos, role: e.target.value || null }, {}),
  },
    h('option', { value: '', selected: !o.sel.role }, pos ? 'Choose role' : 'Choose a position first'),
    roles.map((r) => h('option', { value: r.id, selected: r.id === o.sel.role }, r.name)));
  return h('div', { class: 'role-sel' },
    h('label', { class: 'role-sel-label', for: `role-pos-${n}` }, 'Position'), posSelect,
    h('label', { class: 'role-sel-label', for: `role-role-${n}` }, 'Role'), roleSelect);
}

/** Prompt shown under the selectors until a role is chosen. */
export function rolePrompt(cat, phaseLabel, sel, cleared) {
  const pos = sel.position ? positionByCode(cat, sel.position) : null;
  let title, text = null;
  if (cleared?.reason === 'position') {
    title = 'Choose a position';
    text = 'The saved position isn’t in the current role catalogue.';
  } else if (!pos) {
    title = `Choose a position and role for ${phaseLabel}`;
  } else {
    title = `Choose a ${pos.label.toLowerCase()} role`;
    if (cleared?.reason === 'role') {
      text = `${cleared.roleName ? `${cleared.roleName} isn’t` : 'The saved role isn’t'} available for ${pos.label} ${phaseLabel.toLowerCase()} in the current role catalogue — choose another.`;
    }
  }
  return h('div', { class: 'empty radar-empty role-prompt' },
    h('p', { class: 'empty-title' }, title), text ? h('p', { class: 'empty-text' }, text) : null);
}

/** Familiarity chip (1–20, familiarity colours). */
export function famChip(v) {
  const band = famBand(v);
  return h('span', { class: `fam-chip ${band ? band.cls : ''}` }, v ?? DASH);
}

/** Information sheet: how Role attributes /100 works + the catalogue in use. */
export function openRoleInfo(cat) {
  const info = roleInfoContent(cat);
  openSheet({
    title: 'Role attributes /100',
    content: [
      ...info.score.map((t) => h('p', { class: 'sheet-text' }, t)),
      h('p', { class: 'sheet-sub' }, 'Role catalogue'),
      h('p', { class: 'role-cat-note' }, ...String(info.catalogue).split('\n').flatMap((line, i) => (i ? [h('br'), line] : [line])),
        info.url ? [h('br'), h('a', { href: info.url, target: '_blank', rel: 'noopener' }, 'Source')] : null),
      info.issues.length ? h('ul', { class: 'sheet-list role-cat-issues' }, info.issues.map((t) => h('li', {}, t))) : null,
    ],
    actions: [{ label: 'Close', kind: 'secondary', onClick: (close) => close() }],
  });
}
