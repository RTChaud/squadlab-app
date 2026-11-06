// Player picker for one lineup slot. Route: #/lineups/<id>/pick/<slot>
//
// Sources reuse the existing squad, shortlist and tag data (no copies).
// Results are ordered by familiarity for the slot (then CA), but everyone
// stays selectable — low familiarity may mean planned retraining.

import { h, icon, orDash } from '../dom.js';
import {
  getModel, getLineup, assignLineupSlot, listTags, getTagMembers,
  getPrefSync, setPref, playerKeyOf,
} from '../../store.js';
import { resolveTeams, formatGameDate } from '../../data/snapshot.js';
import { SLOT_BY_ID } from '../../data/lineups.js';
import { describePositions, formatPositions } from '../../data/positions.js';
import { isClubOwned, displayNameOf, searchTextOf } from '../../data/players.js';
import { intOrNull } from '../../data/attributes.js';
import { toast } from '../components/feedback.js';

const PREF = 'lineup.pickerSource';
const SOURCES = [
  { id: 'all', label: 'All players' },
  { id: 'first', label: 'First Team' },
  { id: 'reserve', label: 'Reserve Team' },
  { id: 'youth', label: 'Youth Team' },
  { id: 'other', label: 'Other club players (incl. loans)' },
  { id: 'shortlist', label: 'Shortlist…' },
  { id: 'tag', label: 'Tag…' },
];

// Familiarity colour bands — same as the profile's position diagram.
const famClass = (v) => (!Number.isInteger(v) ? 'fnone' : v <= 1 ? 'f1' : v <= 5 ? 'f2' : v <= 9 ? 'f3' : v <= 14 ? 'f4' : v <= 17 ? 'f5' : v <= 20 ? 'f6' : 'fnone');

/** Remember where the picker was opened from, so choosing returns there. */
let returnTo = null;
export const pickerOpenedFrom = (hash) => { returnTo = hash; };

export async function LineupPickerView({ id, slot }) {
  const lineup = getLineup(id);
  const def = SLOT_BY_ID[slot];
  const pitchHash = `#/lineups/${encodeURIComponent(id)}`;
  if (!lineup || !def) {
    return { title: 'Choose player', back: '#/lineups', body: h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, 'Slot not found')) };
  }
  const model = getModel();
  const teams = resolveTeams(model);
  const lists = [...model.visibleShortlists].sort((a, b) => a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base', numeric: true }));
  const tags = listTags();

  const saved = getPrefSync(PREF, null) || {};
  let source = SOURCES.some((s) => s.id === saved.source) ? saved.source : 'first';
  let sub = saved.sub || null;
  let query = '';

  async function membersFor(src, subId) {
    const latest = (players) => players.map((p) => ({ player: p, current: true, gameDate: model.gameDate }));
    switch (src) {
      case 'first': case 'reserve': case 'youth': {
        const t = teams.find((x) => x.key === src);
        return latest(t ? t.players : []);
      }
      case 'other': {
        const inTeams = new Set(teams.filter((t) => t.key !== 'loan').flatMap((t) => t.players.map((p) => p.uid)));
        return latest(model.raw.players.filter((p) => isClubOwned(p, model.raw) && !inTeams.has(p.uid)));
      }
      case 'shortlist': {
        const l = lists.find((x) => x.id === subId) || lists[0];
        return l ? latest(model.resolve(l.playerUids)) : [];
      }
      case 'tag': {
        const t = tags.find((x) => x.id === subId) || tags[0];
        return t ? getTagMembers(t.id) : [];
      }
      default:
        return latest(model.raw.players);
    }
  }

  const sourceSel = h('select', { class: 'select', id: 'pick-source', 'aria-label': 'Source',
    onchange: (e) => { source = e.target.value; sub = null; save(); refresh(); } },
    SOURCES.map((s) => h('option', { value: s.id, selected: s.id === source }, s.label)));
  const subWrap = h('div', { class: 'field' });
  const search = h('input', {
    type: 'search', class: 'picker-search', placeholder: 'Search by name', 'aria-label': 'Search players',
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    oninput: (e) => { query = e.target.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); renderResults(); },
  });
  const results = h('div', { class: 'pick-results' });
  let current = [];

  function save() { setPref(PREF, { source, sub }); }

  function renderSub() {
    const opts = source === 'shortlist' ? lists.map((l) => ({ id: l.id, label: l.name }))
      : source === 'tag' ? tags.map((t) => ({ id: t.id, label: `${t.name} (${t.count})` })) : null;
    if (!opts) { subWrap.replaceChildren(); subWrap.hidden = true; return; }
    subWrap.hidden = false;
    if (!opts.length) {
      subWrap.replaceChildren(h('p', { class: 'muted small' }, source === 'tag' ? 'No tags yet.' : 'No shortlists in this snapshot.'));
      return;
    }
    if (!opts.some((o) => o.id === sub)) sub = opts[0].id;
    subWrap.replaceChildren(h('select', { class: 'select', 'aria-label': source === 'tag' ? 'Tag' : 'Shortlist',
      onchange: (e) => { sub = e.target.value; save(); refresh(); } },
      opts.map((o) => h('option', { value: o.id, selected: o.id === sub }, o.label))));
  }

  async function refresh() {
    renderSub();
    current = await membersFor(source, sub);
    renderResults();
  }

  async function choose(entry) {
    const key = playerKeyOf(entry.player);
    if (!key) { toast('This player has no persistent ID in the extract.', 'info'); return; }
    await assignLineupSlot(lineup.id, slot, key);
    toast(`${displayNameOf(entry.player)} → ${slot}`);
    if (returnTo === pitchHash && history.length > 1) history.back();
    else location.replace(pitchHash);
    returnTo = null;
  }

  function renderResults() {
    const fam = (p) => intOrNull(p.positions?.[def.fam]);
    const rows = current
      .filter((e) => !query || searchTextOf(e.player).includes(query))
      .sort((a, b) => (fam(b.player) ?? -1) - (fam(a.player) ?? -1)
        || (intOrNull(b.player.ability?.current) ?? -1) - (intOrNull(a.player.ability?.current) ?? -1)
        || displayNameOf(a.player).localeCompare(displayNameOf(b.player), 'en-GB', { sensitivity: 'base' }));
    if (!rows.length) {
      results.replaceChildren(h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, query ? 'No matching players' : 'No players in this source')));
      return;
    }
    results.replaceChildren(...rows.map((e) => {
      const p = e.player;
      const v = fam(p);
      const pos = describePositions(p);
      const paRaw = intOrNull(p.ability?.potential);
      return h('button', { type: 'button', class: 'pick-row', onclick: () => choose(e) },
        h('span', { class: 'pick-main' },
          h('span', { class: 'pick-name' }, displayNameOf(p),
            !isClubOwned(p, model.raw) ? h('span', { class: 'badge-target' }, 'Target') : null),
          h('span', { class: 'pick-meta' }, `Age ${orDash(intOrNull(p.age))} · ${pos.natural || '—'}${pos.accomplished ? ` · ${pos.accomplished}` : ''}`),
          e.current ? null : h('span', { class: 'pnote' }, `Last recorded: ${formatGameDate(e.gameDate)}`)),
        h('span', { class: 'pick-nums' },
          h('span', { class: `ptile pick-fam ${famClass(v)}`, title: `${formatPositions([def.fam])} familiarity` },
            h('span', { class: 'ptile-code' }, formatPositions([def.fam])), h('span', { class: 'ptile-val' }, orDash(v))),
          h('span', { class: 'pick-capa' }, h('span', {}, 'CA ', h('b', {}, orDash(intOrNull(p.ability?.current)))),
            h('span', {}, 'PA ', h('b', { class: 'pa' }, orDash(paRaw !== null && paRaw > 0 ? paRaw : null))))),
      );
    }));
  }

  await refresh();

  return {
    title: `Choose ${slot}`,
    subtitle: lineup.name,
    back: pitchHash,
    body: h('div', { class: 'stack picker-view' },
      h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'pick-source' }, 'Choose from'), sourceSel),
      subWrap,
      search,
      h('p', { class: 'muted small' }, `Sorted by ${formatPositions([def.fam])} familiarity, then CA. Everyone can be picked.`),
      results,
    ),
  };
}
