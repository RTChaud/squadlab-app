// Role explorer on the player profile, under the Position familiarity grid.
//
// Tap a position tile → two columns for that position: In Possession (left)
// and Out of Possession (right), each with a role dropdown (every option shows
// the player's Role attributes /100) and the chosen role's score. A phase
// switch shows one phase's radar, key attributes and score breakdown at full
// width underneath. Familiarity stays on the tiles, separate from the score.
//
// Remembered per player: the selected position, the phase shown, and the last
// valid role for every position + phase (so M (C) → DM → M (C) restores the
// M (C) choices). Role ids are checked against the active catalogue.

import { h, DASH } from '../dom.js';
import { getRadarPrefs, saveRoleExplorer } from '../../store.js';
import { attrBand, attributeDirection } from '../../data/attributes.js';
import { formatPositions } from '../../data/positions.js';
import {
  PHASES, loadRoleCatalogue, positionByCode, rolesFor, roleScore, roleValue, fmtScore, scoreBreakdown,
} from '../../data/roles.js';
import { FamiliarityPitch } from './familiarityPitch.js';
import { openRoleInfo } from './roleControls.js';
import { openAttributeInfo } from './attributeInfoSheet.js';
import { chartBlock } from './radarSection.js';

/** Radar, key attributes (badges + tap-to-read) and the score breakdown for one role. */
function roleDetails(p, role, score) {
  const axes = role.attrs.map((a) => {
    const value = roleValue(p, a);
    const direction = a.tendency ? 'neutral' : (a.mapped ? attributeDirection(a.key) : 'positive');
    return { label: a.label, value, display: value === null ? null : String(value), direction,
      note: a.tendency ? 'Tendency — shown, not scored.' : null };
  });
  const known = axes.filter((a) => a.value !== null).length;
  const chart = known >= 3
    ? chartBlock(axes, {
      title: `${role.name} key attributes`,
      describe: (a) => [h('span', { class: 'ro-title' }, a.label, ' ', h('b', {}, a.value === null ? 'Unavailable' : a.display)), a.note ? h('span', { class: 'ro-note' }, a.note) : null],
    })
    : [h('p', { class: 'muted small role-chart-note' }, `Not enough recorded values to draw this role (${known} of ${axes.length}).`)];
  const list = h('ul', { class: 'attr-list role-attrs' }, role.attrs.map((a) => {
    const value = roleValue(p, a);
    const band = a.tendency ? null : attrBand(value, a.mapped ? attributeDirection(a.key) : 'positive');
    const btn = h('button', { type: 'button', class: 'attr-name', 'aria-haspopup': 'dialog', onclick: () => openAttributeInfo({ key: a.key, label: a.label }, btn) },
      a.label, a.tier === 'supporting' ? h('span', { class: 'muted' }, ' · supporting') : null, a.tendency ? h('span', { class: 'muted' }, ' †') : null);
    return h('li', { class: 'attr' }, h('span', { class: 'attr-mark', 'aria-hidden': 'true' }), btn,
      h('span', { class: `attr-val ${band || 'none'}` }, value ?? DASH));
  }));
  const breakdown = h('div', { class: 'role-breakdown' }, scoreBreakdown(score).map((t) => h('p', {}, t)));
  return [...chart.filter(Boolean), list, breakdown];
}

/**
 * @param p player record (the profile's snapshot)
 * @param playerKey persistent player key (preferences)
 * Returns { pitch, panel } — the selectable grid and the role panel beneath it.
 */
export function RoleExplorer(p, playerKey) {
  const prefs = () => getRadarPrefs(playerKey);
  let pos = prefs().rolePos;
  let tab = prefs().roleTab;
  let cat = null;

  const panel = h('div', { class: 'role-explorer', 'aria-live': 'polite' });
  const pitch = FamiliarityPitch(p, {
    selected: pos,
    onSelect: (code) => {
      pos = code;
      pitch.setSelected(code);
      saveRoleExplorer(playerKey, { rolePos: code });
      draw();
    },
  });

  /** The saved role for this position + phase if the catalogue still lists it. */
  function savedRole(phase) {
    const id = prefs().roleByPos?.[pos]?.[phase];
    if (!id) return null;
    const role = rolesFor(cat, pos, phase).find((r) => r.id === id) || null;
    if (!role) saveRoleExplorer(playerKey, { role: { position: pos, phase, id: null } }); // gone from the catalogue
    return role;
  }

  function column(phase, role, scores) {
    const roles = rolesFor(cat, pos, phase.id);
    const s = role ? scores.get(role.id) : null;
    const select = h('select', {
      class: 'role-pick-select', 'data-phase-select': phase.id, 'aria-label': `${phase.label} role`,
      onchange: (e) => {
        const id = e.target.value || null;
        tab = phase.id;
        saveRoleExplorer(playerKey, { role: { position: pos, phase: phase.id, id }, roleTab: tab });
        draw(true);
      },
    },
      h('option', { value: '', selected: !role }, 'Choose a role'),
      roles.map((r) => h('option', { value: r.id, selected: role?.id === r.id }, `${r.name} · ${fmtScore(scores.get(r.id).value)}`)));
    return h('div', { class: `role-col${tab === phase.id ? ' active' : ''}`, 'data-phase': phase.id },
      h('p', { class: 'role-col-phase' }, phase.label),
      // The visible face wraps long names; the native select sits on top (transparent).
      h('div', { class: `role-pick${role ? '' : ' role-pick-none'}` },
        h('span', { class: 'role-pick-name' }, role ? role.name : 'Choose a role'),
        h('span', { class: 'role-pick-chev', 'aria-hidden': 'true' }),
        select),
      h('div', { class: 'role-col-score' },
        h('span', { class: `role-col-num${!s || s.value === null ? ' none' : ''}` }, s && s.value !== null ? fmtScore(s.value) : DASH),
        h('span', { class: 'role-col-unit' }, s && s.value === null ? 'Role attributes · unavailable' : 'Role attributes /100')));
  }

  function draw(reveal = false) {
    if (!cat) { panel.replaceChildren(h('p', { class: 'muted small role-hint' }, 'Loading roles…')); return; }
    if (cat.error) { panel.replaceChildren(h('p', { class: 'muted small role-hint' }, cat.error)); return; }
    if (!pos) { panel.replaceChildren(h('p', { class: 'muted small role-hint' }, 'Tap a position to explore roles.')); return; }
    const position = positionByCode(cat, pos);
    if (!position) {
      panel.replaceChildren(h('p', { class: 'muted small role-hint' }, `The role catalogue has no roles for ${formatPositions([pos])}.`));
      return;
    }
    const roles = Object.fromEntries(PHASES.map((ph) => [ph.id, savedRole(ph.id)]));
    const scores = new Map(PHASES.flatMap((ph) => rolesFor(cat, pos, ph.id)).map((r) => [r.id, roleScore(r, p)]));

    const head = h('div', { class: 'role-x-head' },
      h('h4', {}, 'Roles · ', h('span', { class: 'role-x-pos' }, position.short)),
      h('button', { type: 'button', class: 'info-btn', 'aria-label': 'About Role attributes /100 and the role catalogue', onclick: () => openRoleInfo(cat) }, 'i'));
    const cols = h('div', { class: 'role-cols' }, PHASES.map((ph) => column(ph, roles[ph.id], scores)));

    const tabs = h('div', { class: 'role-tabs', role: 'tablist', 'aria-label': 'Phase details' }, PHASES.map((ph) =>
      h('button', {
        type: 'button', role: 'tab', class: `role-tab${tab === ph.id ? ' active' : ''}`, 'data-tab': ph.id,
        'aria-selected': String(tab === ph.id), 'aria-controls': 'role-details',
        onclick: () => { if (tab === ph.id) return; tab = ph.id; saveRoleExplorer(playerKey, { roleTab: tab }); draw(); },
      }, ph.label)));

    const active = PHASES.find((ph) => ph.id === tab);
    const role = roles[tab];
    const details = h('div', { class: 'role-details', id: 'role-details', role: 'tabpanel', 'data-phase': tab },
      role
        ? [h('p', { class: 'role-details-title' }, role.name, h('span', { class: 'muted' }, ` · ${active.label}`)), ...roleDetails(p, role, scores.get(role.id))]
        : [h('div', { class: 'empty radar-empty role-prompt' }, h('p', { class: 'empty-title' }, 'Choose a role'),
          h('p', { class: 'empty-text' }, `Pick an ${active.label} role for ${position.label} to see its radar and key attributes.`))]);

    panel.replaceChildren(head, cols, tabs, details);
    if (reveal) requestAnimationFrame(() => details.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  draw();
  loadRoleCatalogue().then((c) => { cat = c; draw(); });
  return { pitch, panel };
}
