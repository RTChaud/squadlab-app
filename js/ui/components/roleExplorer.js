// Role explorer on the player profile, under the Position familiarity grid.
//
// Tap a position tile (tap it again to close) → two columns for that position: In Possession (left)
// and Out of Possession (right), each with a role dropdown (options sorted by
// the player's Role attributes /100, highest first) and the chosen role's
// score. Underneath, both phases side by side: the role radars, then each
// role's key attributes. Familiarity stays on the tiles,
// separate from the score.
//
// Remembered per player: the selected position and the last
// valid role for every position + phase (so M (C) → DM → M (C) restores the
// M (C) choices). Role ids are checked against the active catalogue.

import { h, DASH } from '../dom.js';
import { getRadarPrefs, saveRoleExplorer } from '../../store.js';
import { attrBand, attributeDirection, scoreBand, ATTRIBUTE_ABBR } from '../../data/attributes.js';
import { formatPositions } from '../../data/positions.js';
import {
  PHASES, loadRoleCatalogue, positionByCode, rolesFor, roleScore, roleValue, fmtScore,
} from '../../data/roles.js';
import { FamiliarityPitch } from './familiarityPitch.js';
import { openRoleInfo } from './roleControls.js';
import { openAttributeInfo } from './attributeInfoSheet.js';
import { RadarChart } from './radarChart.js';

const axisDirection = (a) => (a.tendency ? 'neutral' : (a.mapped ? attributeDirection(a.key) : 'positive'));

/** Compact radar for one phase's role (two sit side by side). Tapping an axis fills the shared readout. */
function roleRadar(p, phase, role, readout) {
  if (!role) return h('div', { class: 'role-radar role-radar-none', 'data-phase': phase.id }, h('p', {}, 'Choose a role'));
  const axes = role.attrs.map((a) => {
    const value = roleValue(p, a);
    const direction = axisDirection(a);
    return { label: a.label, short: ATTRIBUTE_ABBR[a.key] || a.label.slice(0, 3), value, display: value === null ? null : String(value),
      direction, band: scoreBand(value, direction), marker: a.tendency ? '†' : '' };
  });
  const known = axes.filter((a) => a.value !== null).length;
  if (known < 3) {
    return h('div', { class: 'role-radar role-radar-none', 'data-phase': phase.id },
      h('p', {}, `Not enough values to draw (${known} of ${axes.length})`));
  }
  const chart = RadarChart({
    compact: true,
    axes,
    ariaLabel: `${role.name}, ${phase.label}: ${axes.map((a) => `${a.label} ${a.value ?? 'unavailable'}`).join(', ')}`,
    showBands: axes.every((a) => a.direction === 'positive'),
    onSelect: (i) => {
      const a = axes[i];
      readout.hidden = false;
      readout.replaceChildren(...[h('span', { class: 'ro-title' }, a.label, ' ', h('b', {}, a.value === null ? 'Unavailable' : a.display)),
        h('span', { class: 'ro-formula' }, `${role.name} · ${phase.label}`),
        a.marker ? h('span', { class: 'ro-note' }, 'Tendency — shown, not scored.') : null].filter(Boolean));
    },
  });
  return h('div', { class: 'role-radar', 'data-phase': phase.id }, chart.el);
}

/** Key attributes (badges + tap-to-read) for one role. */
function roleDetails(p, role) {
  const list = h('ul', { class: 'attr-list role-attrs' }, role.attrs.map((a) => {
    const value = roleValue(p, a);
    const band = a.tendency ? null : attrBand(value, axisDirection(a));
    const btn = h('button', { type: 'button', class: 'attr-name', 'aria-haspopup': 'dialog', onclick: () => openAttributeInfo({ key: a.key, label: a.label }, btn) },
      a.label, a.tier === 'supporting' ? h('span', { class: 'muted' }, ' · supporting') : null, a.tendency ? h('span', { class: 'muted' }, ' †') : null);
    return h('li', { class: 'attr' }, h('span', { class: 'attr-mark', 'aria-hidden': 'true' }), btn,
      h('span', { class: `attr-val ${band || 'none'}` }, value ?? DASH));
  }));
  return [list];
}

/**
 * @param p player record (the profile's snapshot)
 * @param playerKey persistent player key (preferences)
 * Returns { pitch, panel } — the selectable grid and the role panel beneath it.
 */
export function RoleExplorer(p, playerKey) {
  const prefs = () => getRadarPrefs(playerKey);
  let pos = prefs().rolePos;
  let cat = null;

  const panel = h('div', { class: 'role-explorer', 'aria-live': 'polite' });
  const pitch = FamiliarityPitch(p, {
    selected: pos,
    // Tapping the selected tile again closes the roles section (back to the hint).
    onSelect: (code) => {
      pos = code === pos ? null : code;
      pitch.setSelected(pos);
      saveRoleExplorer(playerKey, { rolePos: pos });
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
    // Highest Role attributes first; unavailable scores last; ties by name.
    const val = (r) => scores.get(r.id).value ?? -1;
    const roles = [...rolesFor(cat, pos, phase.id)].sort((a, b) => val(b) - val(a) || a.name.localeCompare(b.name));
    const s = role ? scores.get(role.id) : null;
    const select = h('select', {
      class: 'role-pick-select', 'data-phase-select': phase.id, 'aria-label': `${phase.label} role`,
      onchange: (e) => {
        saveRoleExplorer(playerKey, { role: { position: pos, phase: phase.id, id: e.target.value || null } });
        draw(true);
      },
    },
      h('option', { value: '', selected: !role }, 'Choose a role'),
      roles.map((r) => h('option', { value: r.id, selected: role?.id === r.id }, `${r.name} · ${fmtScore(scores.get(r.id).value)}`)));
    return h('div', { class: 'role-col', 'data-phase': phase.id },
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

    const readout = h('div', { class: 'radar-readout', 'aria-live': 'polite', hidden: true });
    const radars = h('div', { class: 'role-radars' }, PHASES.map((ph) => roleRadar(p, ph, roles[ph.id], readout)));

    // Key attributes for both phases, under their radars.
    const details = h('div', { class: 'role-attr-cols' }, PHASES.map((ph) => {
      const role = roles[ph.id];
      return h('div', { class: 'role-attr-col', 'data-phase': ph.id, 'aria-label': `${ph.label} key attributes` },
        role ? roleDetails(p, role) : null); // the radar above already says “Choose a role”
    }));

    panel.replaceChildren(head, cols, radars, readout, details);
    if (reveal) requestAnimationFrame(() => radars.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  draw();
  loadRoleCatalogue().then((c) => { cat = c; draw(); });
  return { pitch, panel };
}
