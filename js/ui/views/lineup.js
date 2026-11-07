// One lineup on a 4-2-3-1 pitch. Route: #/lineups/<id>
//
// The pitch is drawn from our goalkeeper's view (our left on the left).
// Slot DEFINITIONS (ids, sort order, familiarity fields) live in
// data/lineups.js; this file only decides where each slot is drawn.

import { h, icon } from '../dom.js';
import {
  getLineup, resolvePlayers, getModel, clearLineupSlot,
  renameLineup, duplicateLineup, deleteLineup,
} from '../../store.js';
import { SLOT_IDS, isDefault } from '../../data/lineups.js';
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

  function slotCard(slot) {
    const key = lineup.slots[slot];
    if (!key) {
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
    );
  }

  function slotActions(slot, key, r) {
    const name = r?.player ? displayNameOf(r.player) : 'Unknown player';
    const pid = r?.player ? persistentId(r.player) : key.split(':').pop();
    openSheet({
      title: `${slot} · ${name}`,
      content: r && !r.current ? [h('p', { class: 'sheet-note' }, `Last recorded ${formatGameDate(r.gameDate)} — not in the latest snapshot.`)] : [],
      actions: [
        ...(r ? [{ label: 'View player', kind: 'secondary', onClick: (close) => { close(); location.hash = linkWithFrom(`/player/${encodeURIComponent(pid)}`, here); } }] : []),
        { label: 'Replace player', kind: 'secondary', onClick: (close) => { close(); location.hash = pickHref(lineup.id, slot); } },
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
        h('span', { class: 'muted small' }, filledCount ? 'Tap a player for options.' : 'Tap a position to add a player.'),
        h('button', { type: 'button', class: 'btn btn-secondary lineup-opts', onclick: options }, icon('settings'), 'Options')),
      h('div', { class: 'pitch-field', role: 'group', 'aria-label': `${lineup.name} pitch` },
        h('div', { class: 'pitch-lines', 'aria-hidden': 'true' }, h('span', { class: 'pl-half' }), h('span', { class: 'pl-circle' }), h('span', { class: 'pl-box top' }), h('span', { class: 'pl-box bottom' })),
        PITCH_ROWS_4231.map((row) => h('div', { class: `pitch-line n${row.length}` }, row.map(slotCard))),
      ),
    ),
  };
}
