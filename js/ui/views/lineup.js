// One lineup on a 4-2-3-1 pitch. Route: #/lineups/<id>
//
// The pitch is drawn from our goalkeeper's view (our left on the left).
// Slot DEFINITIONS (ids, sort order, familiarity fields) live in
// data/lineups.js; this file only decides where each slot is drawn.
//
// On the three default lineups each slot also shows its saved In Possession /
// Out of Possession roles (short labels; full names in the slot sheet). The
// roles belong to the slot, not the player, and are shared by First XI,
// Backup XI and Future XI, so editing them from any of the three changes all.

import { h, icon } from '../dom.js';
import {
  getLineup, resolvePlayers, getModel, clearLineupSlot,
  renameLineup, duplicateLineup, deleteLineup, getSlotRoles, setSlotRoles,
} from '../../store.js';
import { SLOT_IDS, SLOT_BY_ID, isDefault, ROLE_PHASES } from '../../data/lineups.js';
import { loadRoleCatalogue, rolesFor, positionByCode } from '../../data/roles.js';
import { compactNameOf, displayNameOf, isClubOwned, persistentId } from '../../data/players.js';
import { formatGameDate } from '../../data/snapshot.js';
import { intOrNull } from '../../data/attributes.js';
import { openSheet, confirmSheet } from '../components/sheet.js';
import { promptSheet } from '../components/promptSheet.js';
import { toast } from '../components/feedback.js';
import { linkWithFrom, backTarget } from '../../router.js';

/** Visual rows, attack at the top. Rendering only — not the sort order. */
const PITCH_ROWS_4231 = [
  ['ST'],
  ['LW', 'CAM', 'RW'],
  ['LDM', 'RDM'],
  ['LB', 'LCB', 'RCB', 'RB'],
  ['GK'],
];

const pickHref = (lineupId, slot) => `#/lineups/${encodeURIComponent(lineupId)}/pick/${slot}`;

const PHASE_LABEL = { in_possession: 'In Possession', out_of_possession: 'Out of Possession' };

/** Short pitch label for a role: initials of its capitalised words ("Advanced Playmaker" → "AP"). */
export function roleAbbr(name) {
  const parts = String(name || '').split(/[\s-]+/).filter((w) => /^[A-Z]/.test(w));
  return parts.map((w) => w[0]).join('').slice(0, 4) || String(name || '').slice(0, 3);
}

/** The role object for a stored id at a slot, or null. */
function roleFor(cat, slot, phase, id) {
  if (!id || !cat || cat.error) return null;
  return rolesFor(cat, SLOT_BY_ID[slot].fam, phase).find((r) => r.id === id) || null;
}

/** Full role names for a slot, for the slot sheet. */
function rolesSummary(cat, slot, roles) {
  return h('dl', { class: 'slot-roles' }, ROLE_PHASES.flatMap((ph) => {
    const r = roleFor(cat, slot, ph, roles?.[ph]);
    return [h('dt', {}, PHASE_LABEL[ph]), h('dd', { class: r ? '' : 'muted' }, r ? r.name : 'Not set')];
  }));
}

/** Two selectors (one per phase) for a slot's shared roles. */
function editRoles(cat, slot) {
  const fam = SLOT_BY_ID[slot].fam;
  const pos = positionByCode(cat, fam);
  const current = getSlotRoles()[slot] || {};
  const selects = {};
  const fields = ROLE_PHASES.map((ph) => {
    const id = `slot-role-${ph}`;
    const sel = h('select', { class: 'select', id },
      h('option', { value: '' }, 'Not set'),
      rolesFor(cat, fam, ph).map((r) => h('option', { value: r.id, selected: r.id === current[ph] }, r.name)));
    selects[ph] = sel;
    return h('div', { class: 'field' }, h('label', { class: 'field-label', for: id }, PHASE_LABEL[ph]), sel);
  });
  openSheet({
    title: `Roles · ${slot}${pos ? ` (${pos.short})` : ''}`,
    content: [h('p', { class: 'sheet-note' }, 'Applies to First XI, Backup XI and Future XI.'), ...fields],
    actions: [
      { label: 'Save roles', onClick: async (close) => {
        await setSlotRoles(slot, Object.fromEntries(ROLE_PHASES.map((ph) => [ph, selects[ph].value || null])));
        close();
        toast(`Roles saved for ${slot}`);
      } },
      { label: 'Cancel', kind: 'text', onClick: (close) => close() },
    ],
  });
}

export async function LineupView({ id, query }) {
  // Opened from a player's Squad slot chip: Back returns to that player.
  const back = query ? backTarget(query, '#/lineups') : '#/lineups';
  const lineup = getLineup(id);
  if (!lineup) {
    return { title: 'Lineup', back: '#/lineups', body: h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, 'Lineup not found')) };
  }
  const here = `/lineups/${encodeURIComponent(lineup.id)}`;
  const model = getModel();
  const keys = [...new Set(SLOT_IDS.map((s) => lineup.slots[s]).filter(Boolean))];
  const resolved = new Map((await resolvePlayers(keys)).map((r) => [r.key, r]));
  const filledCount = SLOT_IDS.filter((s) => lineup.slots[s]).length;
  // Roles are shared by the three default lineups only.
  const shared = isDefault(lineup.id);
  const cat = shared ? await loadRoleCatalogue() : null;
  const catOk = cat && !cat.error;
  const slotRoles = shared ? getSlotRoles() : null;

  /** "AP/AM" under the slot (In / Out of Possession); "–" for a phase that isn't set. */
  function rolesLine(slot) {
    if (!shared || !catOk) return null;
    const roles = slotRoles[slot] || {};
    const short = ROLE_PHASES.map((ph) => { const r = roleFor(cat, slot, ph, roles[ph]); return r ? roleAbbr(r.name) : null; });
    if (!short[0] && !short[1]) return null;
    const label = ROLE_PHASES.map((ph, i) => `${PHASE_LABEL[ph]}: ${roleFor(cat, slot, ph, roles[ph])?.name || 'Not set'}`).join('; ');
    return h('span', { class: 'pslot-roles', title: label, 'aria-label': label }, `${short[0] || '–'}/${short[1] || '–'}`);
  }

  function emptyActions(slot) {
    openSheet({
      title: `${slot} · Empty`,
      content: catOk ? [rolesSummary(cat, slot, slotRoles[slot])] : [],
      actions: [
        { label: 'Add player', onClick: (close) => { close(); location.hash = pickHref(lineup.id, slot); } },
        ...(catOk ? [{ label: 'Edit roles', kind: 'secondary', onClick: (close) => { close(); editRoles(cat, slot); } }] : []),
        { label: 'Cancel', kind: 'text', onClick: (close) => close() },
      ],
    });
  }

  function slotCard(slot) {
    const key = lineup.slots[slot];
    if (!key) {
      if (shared) {
        return h('button', { type: 'button', class: 'pslot empty-slot', 'aria-label': `${slot}: empty`, onclick: () => emptyActions(slot) },
          h('span', { class: 'pslot-pos' }, slot),
          h('span', { class: 'pslot-add' }, icon('plus'), 'Add'),
          rolesLine(slot));
      }
      return h('a', { class: 'pslot empty-slot', href: pickHref(lineup.id, slot), 'aria-label': `Add a player at ${slot}` },
        h('span', { class: 'pslot-pos' }, slot),
        h('span', { class: 'pslot-add' }, icon('plus'), 'Add'));
    }
    const r = resolved.get(key);
    const p = r?.player;
    const ca = p ? intOrNull(p.ability?.current) : null;
    const paRaw = p ? intOrNull(p.ability?.potential) : null;
    const pa = paRaw !== null && paRaw > 0 ? paRaw : null;
    const external = p && !isClubOwned(p, model.raw);
    return h('button', { type: 'button', class: `pslot filled${r && !r.current ? ' historic' : ''}`, onclick: () => slotActions(slot, key, r) },
      h('span', { class: 'pslot-pos' }, slot),
      h('span', { class: 'pslot-name' }, p ? compactNameOf(p) : 'Unknown player'),
      p ? h('span', { class: 'pslot-nums' }, h('span', {}, 'CA ', h('b', {}, ca ?? '—')), h('span', {}, 'PA ', h('b', { class: 'pa' }, pa ?? '—'))) : null,
      external ? h('span', { class: 'badge-target' }, 'Target') : null,
      r && !r.current ? h('span', { class: 'pslot-note' }, `Last recorded ${formatGameDate(r.gameDate)}`) : null,
      !r ? h('span', { class: 'pslot-note' }, 'Not in any snapshot') : null,
      rolesLine(slot),
    );
  }

  function slotActions(slot, key, r) {
    const name = r?.player ? displayNameOf(r.player) : 'Unknown player';
    const pid = r?.player ? persistentId(r.player) : key.split(':').pop();
    openSheet({
      title: `${slot} · ${name}`,
      content: [
        r && !r.current ? h('p', { class: 'sheet-note' }, `Last recorded ${formatGameDate(r.gameDate)} — not in the latest snapshot.`) : null,
        shared && catOk ? rolesSummary(cat, slot, slotRoles[slot]) : null,
      ].filter(Boolean),
      actions: [
        ...(r ? [{ label: 'View player', kind: 'secondary', onClick: (close) => { close(); location.hash = linkWithFrom(`/player/${encodeURIComponent(pid)}`, here); } }] : []),
        { label: 'Replace player', kind: 'secondary', onClick: (close) => { close(); location.hash = pickHref(lineup.id, slot); } },
        ...(shared && catOk ? [{ label: 'Edit roles', kind: 'secondary', onClick: (close) => { close(); editRoles(cat, slot); } }] : []),
        { label: 'Remove from this slot', kind: 'danger', onClick: async (close) => { close(); await clearLineupSlot(lineup.id, slot); toast(`Removed from ${slot}`, 'info'); } },
        { label: 'Cancel', kind: 'text', onClick: (close) => close() },
      ],
    });
  }

  function options() {
    const custom = !isDefault(lineup.id);
    openSheet({
      title: lineup.name,
      content: custom ? [] : [h('p', { class: 'sheet-note' }, 'Default lineups can’t be renamed or deleted. Duplicating makes a custom copy.')],
      actions: [
        ...(custom ? [{ label: 'Rename', kind: 'secondary', onClick: async (close) => {
          close();
          const name = await promptSheet({ title: 'Rename lineup', value: lineup.name, confirmLabel: 'Rename' });
          if (name) await renameLineup(lineup.id, name);
        } }] : []),
        { label: 'Duplicate', kind: 'secondary', onClick: async (close) => {
          close();
          const name = await promptSheet({ title: 'Duplicate lineup', value: `${lineup.name} (copy)`, confirmLabel: 'Duplicate' });
          if (!name) return;
          const copy = await duplicateLineup(lineup.id, name);
          location.hash = `#/lineups/${encodeURIComponent(copy.id)}`;
        } },
        ...(custom ? [{ label: 'Delete', kind: 'danger', onClick: async (close) => {
          close();
          const ok = await confirmSheet({ title: `Delete “${lineup.name}”?`, message: 'This removes the lineup and its assignments. Players and other lineups are not affected.', confirmLabel: 'Delete lineup', danger: true });
          if (!ok) return;
          await deleteLineup(lineup.id);
          location.replace('#/lineups');
        } }] : []),
        { label: 'Cancel', kind: 'text', onClick: (close) => close() },
      ],
    });
  }

  return {
    title: lineup.name,
    subtitle: `4-2-3-1 · ${filledCount} of 11 filled`,
    back,
    body: h('div', { class: 'stack lineup' },
      h('div', { class: 'lineup-bar' },
        h('span', { class: 'muted small' }, shared ? 'Tap a position for players and roles.' : filledCount ? 'Tap a player for options.' : 'Tap a position to add a player.'),
        h('button', { type: 'button', class: 'btn btn-secondary lineup-opts', onclick: options }, icon('settings'), 'Options')),
      h('div', { class: 'pitch-field', role: 'group', 'aria-label': `${lineup.name} pitch` },
        h('div', { class: 'pitch-lines', 'aria-hidden': 'true' }, h('span', { class: 'pl-half' }), h('span', { class: 'pl-circle' }), h('span', { class: 'pl-box top' }), h('span', { class: 'pl-box bottom' })),
        PITCH_ROWS_4231.map((row) => h('div', { class: `pitch-line n${row.length}` }, row.map(slotCard))),
      ),
    ),
  };
}
