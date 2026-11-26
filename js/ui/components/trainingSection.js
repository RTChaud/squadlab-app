// Individual training recommendations on the Development screen.
//
// Context: the player's default-lineup assignments (First XI, then Backup XI,
// then Future XI, slot order within each), with the slot's saved roles. With
// several assignments a selector picks one. The position and both roles can
// be changed here to explore; that is local to this screen and never changes
// lineups, slot roles or squad filters. A player without an assignment picks
// a position on the familiarity pitch and up to two roles.
//
// Focuses, labels and mappings all come from the training configuration
// (data/individual_training.json via data/training.js); nothing here names a focus.

import { h } from '../dom.js';
import { squadSlotsFor, getSlotRoles } from '../../store.js';
import { SLOT_BY_ID, DEFAULT_LINEUPS } from '../../data/lineups.js';
import { PHASES, loadRoleCatalogue, positionByCode, rolesFor, resolveSavedRole, NO_ROLES_TEXT } from '../../data/roles.js';
import { loadTraining, recommendTraining } from '../../data/training.js';
import { attrBand } from '../../data/attributes.js';
import { formatPositions } from '../../data/positions.js';
import { FamiliarityPitch } from './familiarityPitch.js';
import { rolePickControl } from './filterSheet.js';

const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '']);
const LINEUP_NAME = Object.fromEntries(DEFAULT_LINEUPS.map((l) => [l.tier, l.name]));

/** The player's default-lineup assignments, already in First → Backup → Future, slot order. */
function assignmentsFor(playerKey) {
  const slotRoles = getSlotRoles();
  return squadSlotsFor(playerKey).map((e) => ({
    id: `${e.tier}:${e.slot}`,
    label: `${LINEUP_NAME[e.tier] || `Lineup ${e.tier}`} · ${e.slot}`,
    position: SLOT_BY_ID[e.slot].fam,
    roles: { in_possession: slotRoles[e.slot]?.in_possession || null, out_of_possession: slotRoles[e.slot]?.out_of_possession || null },
  }));
}

/**
 * @param p          player record (current values)
 * @param playerKey  persistent player key
 */
export function TrainingSection(p, playerKey) {
  const assignments = assignmentsFor(playerKey);
  let cat = null, cfg = null;
  let current = assignments[0] || null;   // the lineup assignment in use
  const st = { position: null, in_possession: null, out_of_possession: null };

  const root = h('section', { class: 'psection train-section', 'aria-label': 'Individual training' });

  /** Roles of an assignment, read (never saved) against the catalogue. */
  const assignmentState = (a) => ({
    position: a.position,
    ...Object.fromEntries(PHASES.map((ph) => [ph.id, resolveSavedRole(cat, a.position, ph.id, a.roles[ph.id]).id])),
  });
  const exploring = () => {
    if (!current) return false;
    const a = assignmentState(current);
    return a.position !== st.position || PHASES.some((ph) => a[ph.id] !== st[ph.id]);
  };
  const useAssignment = (a) => { current = a; Object.assign(st, assignmentState(a)); };

  function contextBlock() {
    if (!assignments.length) return h('p', { class: 'train-ctx muted small' }, 'Not in a lineup');
    const picker = assignments.length > 1
      ? h('select', {
        class: 'select select-sm train-assign', 'aria-label': 'Lineup assignment',
        onchange: (e) => { useAssignment(assignments.find((a) => a.id === e.target.value)); draw(); },
      }, assignments.map((a) => h('option', { value: a.id, selected: a === current }, a.label)))
      : null;
    const ex = exploring();
    return h('div', { class: 'train-ctx-row' },
      picker || h('span', { class: 'train-ctx-lineup' }, current.label),
      h('span', { class: `train-ctx muted small${ex ? ' exploring' : ''}`, 'data-context': ex ? 'exploring' : 'lineup' },
        ex ? 'Exploring · lineup unchanged' : 'Lineup roles'),
      ex ? h('button', { type: 'button', class: 'chip-clear train-reset', onclick: () => { useAssignment(current); draw(); } }, 'Reset') : null);
  }

  function rolePicks() {
    if (!st.position) return h('p', { class: 'muted small role-hint' }, 'Tap a position, then choose a role.');
    if (!positionByCode(cat, st.position)) return h('p', { class: 'muted small role-hint' }, `The role catalogue has no roles for ${formatPositions([st.position])}.`);
    return h('div', { class: 'frole-picks train-picks' }, PHASES.map((ph) => {
      const roles = rolesFor(cat, st.position, ph.id);
      return h('div', { class: 'frole-col' },
        h('p', { class: 'frole-phase' }, ph.label),
        roles.length
          ? rolePickControl({
            roles, value: st[ph.id], noneLabel: 'None', label: `${ph.label} role`, dataset: { trainRole: ph.id },
            onChange: (id) => { st[ph.id] = id; draw(); },
          })
          : h('p', { class: 'role-none muted small' }, NO_ROLES_TEXT));
    }));
  }

  function results() {
    if (cfg.error) return h('p', { class: 'muted small train-msg' }, 'Training recommendations are unavailable: the training configuration could not be used.');
    const roles = PHASES.map((ph) => (st.position && st[ph.id] ? cat.roles.get(st[ph.id]) || null : null));
    const r = recommendTraining(cfg, p, { position: st.position, roles });
    if (r.status === 'no-role') return h('p', { class: 'muted small train-msg', 'data-train': 'no-role' }, 'Select a role to see training recommendations.');
    if (r.status === 'missing') {
      return h('p', { class: 'dev-notes train-msg', 'data-train': 'missing' },
        `Recommendations unavailable: no recorded value for ${r.missing.join(', ')}.`);
    }
    if (!r.items.length) return h('p', { class: 'muted small train-msg', 'data-train': 'none' }, 'No training focus would raise these roles’ key attributes.');
    return h('table', { class: 'train-table', 'data-train': 'ok' },
      h('colgroup', {}, h('col', { class: 'train-c1' }), h('col', { class: 'train-c2' })),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Training focus'), h('th', { scope: 'col' }, 'Relevant attributes trained'))),
      h('tbody', {}, r.items.map((it, i) => h('tr', { 'data-focus': it.focus.id },
        h('td', { class: 'train-focus' }, h('div', { class: 'train-focus-in' }, h('span', { class: 'train-rank' }, String(i + 1)), h('span', { class: 'train-name' }, it.focus.label))),
        h('td', {}, h('ul', { class: 'train-attrs' }, it.attrs.map((a) => h('li', {
          class: `train-attr${a.atMax ? ' at-max' : ''}`, 'data-attr': a.key,
          'aria-label': `${a.label} ${a.value}${a.atMax ? ', at maximum' : ''}`,
        },
          h('span', { class: 'train-attr-name', 'aria-hidden': 'true' }, a.label),
          h('span', { class: `attr-val ${attrBand(a.value) || 'none'}`, 'aria-hidden': 'true' }, String(a.value)),
          a.atMax ? h('span', { class: 'train-max', 'aria-hidden': 'true' }, 'max') : null))))))));
  }

  function draw() {
    const head = h('h3', {}, 'Individual training');
    if (!cat || !cfg) { root.replaceChildren(head, h('p', { class: 'muted small' }, 'Loading…')); return; }
    if (cat.error) { root.replaceChildren(head, h('p', { class: 'muted small' }, cat.error)); return; }
    const pitch = FamiliarityPitch(p, {
      selected: st.position,
      onSelect: (code) => {
        st.position = code === st.position ? null : code;
        st.in_possession = null; st.out_of_possession = null;
        draw();
      },
    });
    const devIssues = DEV_HOSTS.has(location.hostname) && (cfg.error || cfg.issues.length)
      ? h('ul', { class: 'dev-notes train-issues' }, [cfg.error, ...cfg.issues].filter(Boolean).map((t) => h('li', {}, t)))
      : null;
    root.replaceChildren(head, contextBlock(), pitch, rolePicks(), results(), devIssues || '');
  }

  draw();
  Promise.all([loadRoleCatalogue(), loadTraining()]).then(([c, t]) => {
    cat = c; cfg = t;
    if (current && !cat.error) useAssignment(current);
    draw();
  });
  return root;
}
