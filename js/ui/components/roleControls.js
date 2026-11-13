// Shared by the profile's role explorer and Comparison: the info sheet with
// the chosen roles' descriptions (from the role catalogue).

import { h } from '../dom.js';
import { openSheet } from './sheet.js';
import { PHASES } from '../../data/roles.js';

/**
 * Role descriptions for one position.
 * @param position  catalogue position ({ short, label })
 * @param roles     { [phaseId]: role | null } — the role chosen in each phase
 */
export function openRoleInfo(position, roles) {
  openSheet({
    title: `Roles · ${position.short}`,
    content: PHASES.map((ph) => {
      const role = roles[ph.id];
      return h('div', { class: 'role-desc', 'data-phase': ph.id },
        h('p', { class: 'sheet-sub' }, ph.label),
        role
          ? [h('p', { class: 'role-desc-name' }, role.name), role.description ? h('p', { class: 'sheet-text' }, role.description) : null].filter(Boolean)
          : h('p', { class: 'sheet-text muted' }, 'No role chosen.'));
    }),
    actions: [{ label: 'Close', kind: 'secondary', onClick: (close) => close() }],
  });
}
