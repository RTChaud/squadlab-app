// Player picker for the Comparison screen (used for both columns).
//
// Sources: Squad (the club's squads) and Shortlists (named shortlists), from
// the latest snapshot. The name search stays at the top at every level and its
// scope follows the level: everything → all squads → one squad, or
// everything → all shortlists → one shortlist. The query is kept while moving
// between levels. Players appear once (deduplicated by persistent id).

import { h, icon, DASH } from '../dom.js';
import { openSheet } from './sheet.js';
import { getModel } from '../../store.js';
import { resolveTeams } from '../../data/snapshot.js';
import { describePositions } from '../../data/positions.js';
import { persistentId, profileNameOf, matchesNameQuery } from '../../data/players.js';
import { intOrNull } from '../../data/attributes.js';

const collator = new Intl.Collator('en-GB', { sensitivity: 'base', numeric: true });

/**
 * @param {object} o  title, otherPid (selected in the other column), onPick(pid)
 */
export function openPlayerPicker(o) {
  const model = getModel();
  const teams = resolveTeams(model).filter((t) => !t.fatal);
  const lists = [...model.visibleShortlists].sort((a, b) => collator.compare(a.name, b.name));
  const listPlayers = (l) => model.resolve(l.playerUids);

  // Level: { kind: 'root' } | { kind: 'squads' } | { kind: 'squad', key } | { kind: 'lists' } | { kind: 'list', id }
  let level = { kind: 'root' };
  let query = '';

  const teamLabel = new Map();
  for (const t of teams) for (const p of t.players) if (!teamLabel.has(p.uid)) teamLabel.set(p.uid, t.label);

  function scope() {
    switch (level.kind) {
      case 'squads': return { label: 'All squads', players: teams.flatMap((t) => t.players), crumbs: ['Squad'] };
      case 'squad': { const t = teams.find((x) => x.key === level.key); return { label: t.label, players: t.players, crumbs: ['Squad', t.label] }; }
      case 'lists': return { label: 'All shortlists', players: lists.flatMap(listPlayers), crumbs: ['Shortlists'] };
      case 'list': { const l = lists.find((x) => x.id === level.id); return { label: `“${l.name}”`, players: listPlayers(l), crumbs: ['Shortlists', l.name] }; }
      default: return { label: 'Squad and Shortlists', players: [...teams.flatMap((t) => t.players), ...lists.flatMap(listPlayers)], crumbs: [] };
    }
  }

  /** Once per player (stable id), sorted by displayed name. */
  function unique(players) {
    const seen = new Map();
    for (const p of players) {
      const pid = persistentId(p);
      if (pid && !seen.has(pid)) seen.set(pid, p);
    }
    const sortName = (p) => { const n = profileNameOf(p); return n.common || [n.last, n.first].filter(Boolean).join(' ') || n.main; };
    return [...seen.values()].sort((a, b) => collator.compare(sortName(a), sortName(b)));
  }

  const search = h('input', {
    type: 'search', class: 'picker-search', placeholder: 'Search players', 'aria-label': 'Search players',
    autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search',
    oninput: (e) => { query = e.target.value; render(); },
    onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
  });
  const scopeEl = h('p', { class: 'cp-scope', 'aria-live': 'polite' });
  const nav = h('div', { class: 'cp-nav' });
  const results = h('div', { class: 'cp-results', role: 'list' });
  let sheet;

  const go = (next) => { level = next; render(); if (sheet) sheet.el.scrollTop = 0; };
  const sourceBtn = (label, meta, onclick) => h('button', { type: 'button', class: 'cp-source', onclick },
    h('span', { class: 'cp-source-label' }, label), h('span', { class: 'cp-source-meta' }, meta), icon('chevron', 'icon cp-chev'));

  function playerRow(p) {
    const pid = persistentId(p);
    const name = profileNameOf(p);
    const pos = describePositions(p).natural || DASH;
    const age = intOrNull(p.age);
    const where = teamLabel.get(p.uid) || p.club_short_name || p.club_name || '';
    const taken = pid === o.otherPid;
    return h('button', {
      type: 'button', class: 'cp-player', role: 'listitem', disabled: taken,
      'aria-label': `${name.main}${taken ? ', already in the other column' : ''}`,
      onclick: () => { o.onPick(pid); sheet.close(); },
    },
      h('span', { class: 'cp-player-name' }, name.main),
      h('span', { class: 'cp-player-meta' }, [pos, age !== null ? `${age}` : null, where || null].filter(Boolean).join(' · ')),
      taken ? h('span', { class: 'cp-taken' }, 'Other column') : null);
  }

  function render() {
    const sc = scope();
    const q = query.trim();
    scopeEl.replaceChildren(h('span', { class: 'muted' }, 'Searching '), h('strong', {}, sc.label));

    // Breadcrumb + choices for this level
    const crumbs = [];
    if (level.kind !== 'root') {
      crumbs.push(h('div', { class: 'cp-crumbs' },
        h('button', { type: 'button', class: 'chip-clear', onclick: () => go(level.kind === 'squad' ? { kind: 'squads' } : level.kind === 'list' ? { kind: 'lists' } : { kind: 'root' }) }, '‹ Back'),
        h('span', { class: 'cp-path' }, sc.crumbs.join(' › '))));
    }
    let choices = [];
    if (level.kind === 'root') {
      choices = [
        sourceBtn('Squad', `${teams.length} squads`, () => go({ kind: 'squads' })),
        sourceBtn('Shortlists', `${lists.length} ${lists.length === 1 ? 'list' : 'lists'}`, () => go({ kind: 'lists' })),
      ];
    } else if (level.kind === 'squads') {
      choices = teams.map((t) => sourceBtn(t.label, String(t.players.length), () => go({ kind: 'squad', key: t.key })));
    } else if (level.kind === 'lists') {
      choices = lists.length ? lists.map((l) => sourceBtn(l.name, String(listPlayers(l).length), () => go({ kind: 'list', id: l.id })))
        : [h('p', { class: 'muted small' }, 'No shortlists in this extract.')];
    }
    nav.replaceChildren(...crumbs, ...(choices.length ? [h('div', { class: 'cp-sources' }, choices)] : []));

    // Results: matches for the query, or the full list of a specific squad/shortlist
    const specific = level.kind === 'squad' || level.kind === 'list';
    if (!q && !specific) { results.replaceChildren(); results.hidden = true; return; }
    results.hidden = false;
    const found = unique(sc.players).filter((p) => matchesNameQuery(p, q));
    results.replaceChildren(
      h('p', { class: 'cp-count' }, q ? `${found.length} ${found.length === 1 ? 'match' : 'matches'}` : `${found.length} ${found.length === 1 ? 'player' : 'players'}`),
      ...(found.length ? found.map(playerRow) : [h('p', { class: 'muted small cp-none' }, `No players named “${q}” in ${sc.label}.`)]));
  }

  sheet = openSheet({
    title: o.title || 'Select player',
    titleClass: 'sheet-title-sm',
    content: [h('div', { class: 'cp-top' }, search, scopeEl), nav, results],
    actions: [{ label: 'Cancel', kind: 'secondary', onClick: (close) => close() }],
  });
  sheet.el.classList.add('sheet-tall', 'sheet-picker');
  render();
  setTimeout(() => search.focus(), 60);
}
