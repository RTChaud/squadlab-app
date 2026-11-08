// Tactic: pick a position on the pitch, then an optional role for each phase
// (In Possession / Out of Possession) from the role catalogue. Each chosen
// role shows its description and key attributes. "Find matching players"
// opens Shortlists → All with the same criteria as filters (familiarity ≥ 16 at
// the position, key attributes ≥ 15, tendencies listed but unset); its count
// uses the same player pool and matching as that list.
//
// The selection is remembered per career, so Back from the results restores it.
// Route: #/tactic

import { h } from '../dom.js';
import { getModel, getTactic, setTactic, getListSection, setListSection } from '../../store.js';
import { ALL_LIST_ID } from '../../data/snapshot.js';
import { PHASES, loadRoleCatalogue, positionByCode, rolesFor } from '../../data/roles.js';
import { buildRow, matchesFilters, tacticFilters, ROLE_DEFAULT_MIN } from '../../data/listView.js';
import { loadNations } from '../../data/nations.js';
import { FamiliarityPitch } from '../components/familiarityPitch.js';
import { browserRowContext, clearBrowserSearch } from '../components/playerBrowser.js';

const slugOf = (id) => String(id || '').split(':').slice(2).join(':');

export async function TacticView() {
  const [cat] = await Promise.all([loadRoleCatalogue(), loadNations()]);
  if (cat.error || !cat.positions.length) {
    return {
      title: 'Tactic', back: '#/',
      body: h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, 'Roles unavailable'), h('p', { class: 'empty-text' }, cat.error || 'The role catalogue has no positions.')),
    };
  }

  // Same pool and row building as Shortlists → All, built once.
  const model = getModel();
  const ctx = browserRowContext(model);
  const rows = model.allPlayers.map((p) => buildRow(p, ctx));

  // Selection, checked against the catalogue.
  const saved = getTactic();
  const sel = { position: positionByCode(cat, saved.position) ? saved.position : null, in_possession: null, out_of_possession: null };
  const roleOf = (phase) => (sel.position && sel[phase] ? rolesFor(cat, sel.position, phase).find((r) => r.id === sel[phase]) || null : null);
  for (const ph of PHASES) { sel[ph.id] = saved[ph.id]; if (!roleOf(ph.id)) sel[ph.id] = null; }

  const save = () => setTactic({ ...sel });
  const roles = () => ({ in_possession: roleOf('in_possession'), out_of_possession: roleOf('out_of_possession') });
  const ready = () => !!sel.position && PHASES.some((ph) => roleOf(ph.id));
  const filters = () => tacticFilters(sel.position, roles());

  // ---- Pitch ----------------------------------------------------------------------------------
  const pitch = FamiliarityPitch(null, {
    plain: true,
    selected: sel.position,
    selectable: (code) => !!positionByCode(cat, code),
    onSelect: (code) => {
      if (code === sel.position) return;
      sel.position = code;
      // Keep a role only if the new position has the same role in that phase.
      for (const ph of PHASES) {
        const slug = slugOf(sel[ph.id]);
        sel[ph.id] = slug ? rolesFor(cat, code, ph.id).find((r) => slugOf(r.id) === slug)?.id || null : null;
      }
      pitch.setSelected(code);
      save();
      render();
    },
  });
  pitch.classList.add('tac-pitch');

  // ---- Role columns ------------------------------------------------------------------------------
  const colsEl = h('div', { class: 'tac-cols' });
  const findBtn = h('button', { type: 'button', class: 'btn btn-primary btn-block tac-find', onclick: () => openResults() });

  function column(ph) {
    const role = roleOf(ph.id);
    const list = sel.position ? rolesFor(cat, sel.position, ph.id) : [];
    const select = h('select', {
      class: 'role-pick-select', 'data-phase': ph.id, 'aria-label': `${ph.label} role`, disabled: !sel.position || !list.length,
      onchange: (e) => { sel[ph.id] = e.target.value || null; save(); render(); },
    }, h('option', { value: '', selected: !role }, 'No role'),
      list.map((r) => h('option', { value: r.id, selected: role?.id === r.id }, r.name)));
    const pickLabel = !sel.position ? 'Choose a position' : role ? role.name : 'No role';
    const details = role ? [
      role.description ? h('p', { class: 'tac-desc' }, role.description) : null,
      h('p', { class: 'tac-sub' }, 'Key attributes'),
      h('ul', { class: 'tac-attrs' }, role.attrs.filter((a) => a.tier === 'key').map((a) => h('li', { class: 'tac-attr', 'data-key': a.key },
        h('span', { class: 'tac-attr-name' }, a.label),
        h('span', { class: `tac-attr-min${a.tendency || !a.mapped ? ' muted' : ''}` }, a.tendency ? 'Tendency' : a.mapped ? `≥ ${ROLE_DEFAULT_MIN}` : '—')))),
    ] : [];
    return h('div', { class: 'tac-col', 'data-phase': ph.id },
      h('p', { class: 'tac-phase' }, ph.label),
      h('div', { class: `role-pick${role ? '' : ' role-pick-none'}${!sel.position ? ' tac-off' : ''}` },
        h('span', { class: 'role-pick-name' }, pickLabel),
        h('span', { class: 'role-pick-chev', 'aria-hidden': 'true' }),
        select),
      ...details);
  }

  function render() {
    colsEl.replaceChildren(...PHASES.map(column));
    const ok = ready();
    const n = ok ? rows.filter((r) => matchesFilters(r, filters())).length : null;
    findBtn.disabled = !ok;
    findBtn.replaceChildren(
      h('span', {}, 'Find matching players'),
      ok ? h('span', { class: 'tac-count' }, `${n} ${n === 1 ? 'match' : 'matches'}`) : null);
    findBtn.setAttribute('aria-label', ok ? `Find matching players, ${n} ${n === 1 ? 'match' : 'matches'}` : 'Find matching players');
  }

  function openResults() {
    if (!ready()) return;
    // Start from the Tactic criteria only: earlier filters and the name search don't carry over.
    const cur = getListSection('shortlists');
    setListSection('shortlists', { config: { ...cur.config, filters: filters() } });
    clearBrowserSearch('shortlists');
    location.hash = `#/shortlists/${encodeURIComponent(ALL_LIST_ID)}?from=${encodeURIComponent('/tactic')}`;
  }

  render();

  return {
    title: 'Tactic',
    back: '#/',
    body: h('div', { class: 'stack tac' },
      pitch,
      colsEl,
      findBtn),
  };
}
