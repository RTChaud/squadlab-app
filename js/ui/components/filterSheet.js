// Filters sheet for the Squad, Shortlists and Tags tables. Edits a draft and
// only hands back sanitised filters on Apply. Different categories combine with
// AND; options inside one category match any selected option (tags can
// switch to "All selected"); every attribute condition must match.
//
// Role filters (exactly one position selected): an optional role per phase;
// each role's key attributes become editable conditions (default at least 15,
// tendencies unset), one row per attribute even when both roles list it. They
// are ANDed with everything else. The Apply button shows a live match count.

import { h } from '../dom.js';
import { openSheet } from './sheet.js';
import { pickAttribute } from './attributePicker.js';
import {
  POSITION_CHOICES, FOOT_CHOICES, TIER_CHOICES, SLOT_CHOICES, OPERATORS, RANGES, ATTR_CHOICE, ATTR_SCALE,
  sanitizeFilters, conditionError, rangeError, DEFAULT_MIN_FAM, ROLE_DEFAULT_MIN, ROLE_OPERATORS,
} from '../../data/listView.js';
import { PHASES, loadRoleCatalogue, positionByCode, rolesFor } from '../../data/roles.js';

// Familiarity codes laid out like the profile pitch (front to back).
const POS_LAYOUT = [[null, 'stc', null], ['aml', 'amc', 'amr'], ['ml', 'mc', 'mr'], ['wbl', 'dm', 'wbr'], ['dl', 'dc', 'dr'], [null, 'gk', null]];
const POS_LABEL = Object.fromEntries(POSITION_CHOICES.map((p) => [p.code, p.label]));

/** Draft role filter: ids per phase and conditions with raw text values. */
function draftRole(r) {
  return {
    position: r?.position || null,
    in_possession: r?.in_possession?.id || null,
    out_of_possession: r?.out_of_possession?.id || null,
    conds: (r?.conds || []).map((c) => ({ key: c.key, op: c.op || '', value: strOf(c.value), tendency: c.tendency })),
  };
}
const emptyRole = (position = null) => ({ position, in_possession: null, out_of_possession: null, conds: [] });

const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const strOf = (v) => (v === null || v === undefined ? '' : String(v));
const numOrNull = (v) => (String(v).trim() === '' ? null : Number(v));

/**
 * @param {object} o  filters, tags: [{ id, name }], onApply(filters), count(filters) → number (optional)
 */
export function openFilterSheet(o) {
  const f0 = sanitizeFilters(o.filters);
  // Draft keeps raw text for number inputs so mistakes can be explained, not silently fixed.
  const d = {
    positions: [...f0.positions], minFam: f0.minFam,
    ranges: Object.fromEntries(Object.keys(RANGES).map((k) => [k, [strOf(f0[k][0]), strOf(f0[k][1])]])),
    feet: [...f0.feet], tags: [...f0.tags], tagMode: f0.tagMode,
    tiers: [...f0.tiers], slots: [...f0.slots], unassigned: f0.unassigned,
    attrs: f0.attrs.map((c) => ({ ...c, value: String(c.value) })),
    role: draftRole(f0.roles),
  };
  let cat = null; // role catalogue (loaded below)

  const body = h('div', { class: 'filter-form' });
  let sheet;

  const tchip = (label, pressed, onclick, extra = {}) => h('button', {
    type: 'button', class: `tchip${pressed ? ' on' : ''}${extra.cls ? ` ${extra.cls}` : ''}`, 'aria-pressed': String(pressed),
    'aria-label': extra.aria || null, onclick,
  }, label);

  const section = (title, ...children) => h('fieldset', { class: 'fsec' }, h('legend', { class: 'fsec-title' }, title), ...children);

  function errors() {
    const out = {};
    for (const k of Object.keys(RANGES)) { const e = rangeError(k, ...d.ranges[k]); if (e) out[k] = e; }
    d.attrs.forEach((c, i) => { const e = conditionError(c); if (e) out[`attr${i}`] = e; });
    if (roleActive()) {
      for (const c of d.role.conds) {
        if (c.tendency && !c.op) continue; // unset tendency: shown, not applied
        const e = conditionError({ key: c.key, op: c.op, value: c.value });
        if (e) out[`role:${c.key}`] = e;
      }
    }
    return out;
  }

  // ---- Role filter --------------------------------------------------------------------
  const onePosition = () => (d.positions.length === 1 ? d.positions[0] : null);
  const roleOf = (phase) => (cat && d.role[phase] ? rolesFor(cat, d.role.position, phase).find((r) => r.id === d.role[phase]) || null : null);
  /** Role filtering applies only with exactly one position and at least one role chosen. */
  const roleActive = () => !!cat && !cat.error && onePosition() === d.role.position && PHASES.some((ph) => roleOf(ph.id));

  /** Key attributes required by the chosen roles: key → { tendency, phases }. */
  function requiredAttrs() {
    const req = new Map();
    for (const ph of PHASES) {
      for (const a of roleOf(ph.id)?.attrs || []) {
        if (!a.mapped || !ATTR_CHOICE[a.key]) continue;
        const e = req.get(a.key) || { tendency: !!a.tendency, phases: [] };
        e.phases.push(ph.id);
        req.set(a.key, e);
      }
    }
    return req;
  }

  /**
   * Keep the role draft in step with the positions: a different single position
   * starts empty; unknown role ids are dropped; conditions follow the chosen roles
   * (shared ones keep their edited threshold; new ones get the defaults).
   */
  function syncRoles() {
    const pos = onePosition();
    if (!cat || cat.error || !pos) return;
    if (d.role.position !== pos) d.role = emptyRole(pos);
    for (const ph of PHASES) if (d.role[ph.id] && !roleOf(ph.id)) d.role[ph.id] = null;
    const old = new Map(d.role.conds.map((c) => [c.key, c]));
    d.role.conds = [...requiredAttrs()].map(([key, e]) => old.get(key)
      || (e.tendency ? { key, op: '', value: '', tendency: true } : { key, op: 'gte', value: String(ROLE_DEFAULT_MIN), tendency: false }));
  }

  function roleFilterOut() {
    if (!cat) return o.filters?.roles || null; // catalogue not loaded yet: keep what was there
    if (!roleActive()) return null;
    const pick = (ph) => { const r = roleOf(ph); return r ? { id: r.id, name: r.name } : null; };
    return {
      position: d.role.position, in_possession: pick('in_possession'), out_of_possession: pick('out_of_possession'),
      conds: d.role.conds.map((c) => ({ key: c.key, op: c.op || null, value: c.op && c.value !== '' ? Number(c.value) : null, tendency: c.tendency })),
    };
  }

  function roleSection() {
    const pos = onePosition();
    const hint = (t) => h('div', { class: 'frole' }, h('p', { class: 'fsub' }, 'Roles'), h('p', { class: 'fhint frole-hint' }, t));
    if (!pos) return hint('Select one position to filter by role.');
    if (!cat) return hint('Loading roles…');
    if (cat.error) return hint(cat.error);
    if (!positionByCode(cat, pos)) return hint(`The role catalogue has no roles for ${POS_LABEL[pos]}.`);
    const picks = h('div', { class: 'frole-picks' }, PHASES.map((ph) => {
      const role = roleOf(ph.id);
      const select = h('select', {
        class: 'role-pick-select', 'data-role-filter': ph.id, 'aria-label': `${ph.label} role`,
        onchange: (e) => { d.role[ph.id] = e.target.value || null; render(); },
      },
        h('option', { value: '', selected: !role }, 'Any role'),
        rolesFor(cat, pos, ph.id).map((r) => h('option', { value: r.id, selected: role?.id === r.id }, r.name)));
      return h('div', { class: 'frole-col', 'data-phase': ph.id },
        h('p', { class: 'frole-phase' }, ph.label),
        h('div', { class: `role-pick${role ? '' : ' role-pick-none'}` },
          h('span', { class: 'role-pick-name' }, role ? role.name : 'Any role'),
          h('span', { class: 'role-pick-chev', 'aria-hidden': 'true' }),
          select));
    }));
    const req = requiredAttrs();
    const rows = d.role.conds.map((c) => {
      const phases = req.get(c.key)?.phases || [];
      const where = phases.length === 2 ? 'Both phases' : PHASES.find((ph) => ph.id === phases[0])?.label || '';
      const label = ATTR_CHOICE[c.key].label;
      const value = h('input', {
        type: 'text', inputmode: 'numeric', pattern: '[0-9]*', class: 'finput fcond-val', value: c.value,
        disabled: !c.op, 'aria-label': `${label} value (${ATTR_SCALE.min}–${ATTR_SCALE.max})`, placeholder: c.op ? `${ATTR_SCALE.min}–${ATTR_SCALE.max}` : '—',
        oninput: (e) => { c.value = e.target.value.trim(); updateErrors(); },
      });
      const op = h('select', {
        class: 'select select-sm fcond-op', 'aria-label': `${label} operator`,
        onchange: (e) => {
          c.op = e.target.value;
          if (!c.op) c.value = '';
          render();
          if (c.op) setTimeout(() => body.querySelector(`.frole-cond[data-key="${c.key}"] .fcond-val`)?.focus(), 30);
        },
      },
        c.tendency ? h('option', { value: '', selected: !c.op }, 'Not set') : null,
        ROLE_OPERATORS.map((x) => h('option', { value: x.id, selected: x.id === c.op }, x.label)));
      return h('div', { class: 'fcond frole-cond', 'data-key': c.key },
        h('div', { class: 'fcond-main frole-main' },
          h('span', { class: 'frole-attr' }, label,
            h('span', { class: `frole-where${phases.length === 2 ? ' both' : ''}` }, c.tendency ? `${where} · tendency` : where)),
          op, value),
        h('p', { class: 'ferror', dataset: { err: `role:${c.key}` }, role: 'alert', hidden: true }));
    });
    return h('div', { class: 'frole' },
      h('p', { class: 'fsub' }, 'Roles'),
      picks,
      rows.length ? h('div', { class: 'fconds frole-conds', 'aria-label': 'Role key attributes' }, rows) : null);
  }

  function positionsSection() {
    const grid = h('div', { class: 'fpitch' }, POS_LAYOUT.map((row) => h('div', { class: 'fpitch-row' }, row.map((code) => (code
      ? tchip(POS_LABEL[code], d.positions.includes(code), () => { d.positions = toggleIn(d.positions, code); render(); }, { aria: `Position ${POS_LABEL[code]}` })
      : h('span', { class: 'fpitch-gap' }))))));
    const fam = h('select', {
      class: 'select select-sm', id: 'f-minfam', 'aria-label': 'Minimum familiarity',
      onchange: (e) => { d.minFam = Number(e.target.value); updateErrors(); },
    }, Array.from({ length: 20 }, (_, i) => i + 1).map((n) => h('option', { value: n, selected: n === d.minFam }, String(n))));
    return section('Position',
      grid,
      h('div', { class: 'frow' }, h('label', { class: 'muted small', for: 'f-minfam' }, 'Minimum familiarity (1–20)'), fam),
      roleSection());
  }

  function rangeSection(k) {
    const r = RANGES[k];
    const input = (i, label) => h('input', {
      type: 'text', inputmode: 'numeric', pattern: '[0-9]*', class: 'finput', value: d.ranges[k][i],
      placeholder: i === 0 ? 'Min' : 'Max', 'aria-label': `${r.label} ${label}`,
      oninput: (e) => { d.ranges[k][i] = e.target.value.trim(); updateErrors(); },
    });
    return h('div', { class: 'frange' },
      h('span', { class: 'frange-label' }, r.label),
      input(0, 'minimum'), h('span', { class: 'muted' }, '–'), input(1, 'maximum'),
      h('p', { class: 'ferror', dataset: { err: k }, role: 'alert', hidden: true }));
  }

  function tagsSection() {
    if (!o.tags.length) return section('Tags', h('p', { class: 'fhint' }, 'No tags yet. Add tags from a player’s profile.'));
    return section('Tags',
      h('div', { class: 'tchips' }, o.tags.map((t) => tchip(t.name, d.tags.includes(t.id), () => { d.tags = toggleIn(d.tags, t.id); render(); }))),
      h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Tag matching' },
        ['any', 'all'].map((m) => h('button', {
          type: 'button', role: 'radio', 'aria-checked': String(d.tagMode === m), class: `seg-btn${d.tagMode === m ? ' on' : ''}`,
          onclick: () => { d.tagMode = m; render(); },
        }, m === 'any' ? 'Any selected' : 'All selected'))));
  }

  function lineupSection() {
    return section('Default lineups',
      h('div', { class: 'tchips' },
        TIER_CHOICES.map((t) => tchip(t.label, d.tiers.includes(t.tier), () => { d.tiers = toggleIn(d.tiers, t.tier).sort(); render(); }, { cls: `tier t${t.tier}` })),
        tchip('Not assigned', d.unassigned, () => { d.unassigned = !d.unassigned; render(); }, { cls: 'tier t0' })),
      h('p', { class: 'fsub' }, 'Slots'),
      h('div', { class: 'tchips' }, SLOT_CHOICES.map((s) => tchip(s, d.slots.includes(s), () => { d.slots = toggleIn(d.slots, s); render(); }, { aria: `Slot ${s}` }))),
      h('p', { class: 'fhint' }, 'With a lineup and a slot chosen, both must match the same assignment.'));
  }

  function attrsSection() {
    const rows = d.attrs.map((c, i) => h('div', { class: 'fcond' },
      h('div', { class: 'fcond-main' },
        h('button', {
          type: 'button', class: 'fcond-attr', 'aria-label': `Attribute: ${ATTR_CHOICE[c.key]?.label || 'choose'}`,
          onclick: async () => {
            const key = await pickAttribute({ title: 'Choose attribute' });
            if (key) { c.key = key; render(); }
          },
        }, ATTR_CHOICE[c.key]?.label || 'Choose…'),
        h('select', { class: 'select select-sm fcond-op', 'aria-label': 'Operator', onchange: (e) => { c.op = e.target.value; updateErrors(); } },
          OPERATORS.map((op) => h('option', { value: op.id, selected: op.id === c.op }, op.label))),
        h('input', {
          type: 'text', inputmode: 'numeric', pattern: '[0-9]*', class: 'finput fcond-val', value: c.value,
          'aria-label': `Value (${ATTR_SCALE.min}–${ATTR_SCALE.max})`, placeholder: `${ATTR_SCALE.min}–${ATTR_SCALE.max}`,
          oninput: (e) => { c.value = e.target.value.trim(); updateErrors(); },
        }),
        h('button', { type: 'button', class: 'chip-x', 'aria-label': `Remove condition ${i + 1}`, onclick: () => { d.attrs.splice(i, 1); render(); } }, '×')),
      h('p', { class: 'ferror', dataset: { err: `attr${i}` }, role: 'alert', hidden: true })));
    return section('Attribute conditions',
      rows.length ? h('div', { class: 'fconds' }, rows) : h('p', { class: 'fhint' }, 'For example: Passing at least 15. All conditions must match; missing values never match.'),
      h('button', {
        type: 'button', class: 'tool-btn fadd',
        onclick: async () => {
          const key = await pickAttribute({ title: 'Add condition' });
          if (key) { d.attrs.push({ key, op: 'gte', value: '' }); render(); focusLastValue(); }
        },
      }, '+ Add condition'));
  }

  function focusLastValue() {
    setTimeout(() => { const all = body.querySelectorAll('.fcond-val'); all[all.length - 1]?.focus(); }, 30);
  }

  function updateErrors() {
    const errs = errors();
    body.querySelectorAll('.ferror').forEach((el) => {
      const msg = errs[el.dataset.err] || '';
      el.textContent = msg;
      el.hidden = !msg;
    });
    sheet?.setActions(actions(Object.keys(errs).length > 0));
  }

  function render() {
    const scroll = sheet?.el.scrollTop ?? 0;
    syncRoles();
    body.replaceChildren(
      positionsSection(),
      section('Age, CA and PA', ...Object.keys(RANGES).map(rangeSection)),
      section('Preferred foot', h('div', { class: 'tchips' }, FOOT_CHOICES.map((x) => tchip(x, d.feet.includes(x), () => { d.feet = toggleIn(d.feet, x); render(); })))),
      tagsSection(),
      lineupSection(),
      attrsSection(),
    );
    updateErrors();
    if (sheet) sheet.el.scrollTop = scroll;
  }

  function draftFilters() {
    const out = {
      positions: d.positions, minFam: d.minFam,
      feet: d.feet, tags: d.tags, tagMode: d.tagMode,
      tiers: d.tiers, slots: d.slots, unassigned: d.unassigned,
      attrs: d.attrs.map((c) => ({ key: c.key, op: c.op, value: Number(c.value) })),
    };
    for (const k of Object.keys(RANGES)) out[k] = d.ranges[k].map(numOrNull);
    out.roles = roleFilterOut();
    return sanitizeFilters(out);
  }

  function apply(close) {
    if (Object.keys(errors()).length) return updateErrors();
    o.onApply(draftFilters());
    close();
  }

  function applyLabel() {
    if (!o.count) return 'Apply filters';
    const n = o.count(draftFilters());
    // The count sits on a second line under “Apply filters” (CSS); the dot is for screen readers / copy.
    return ['Apply filters', h('span', { class: 'apply-count' }, h('span', { class: 'apply-dot' }, '\u00a0·\u00a0'), `${n} match${n === 1 ? '' : 'es'}`)];
  }

  function actions(hasErrors) {
    return [
      { label: hasErrors ? 'Fix the highlighted values' : applyLabel(), disabled: hasErrors, onClick: apply },
      { label: 'Clear all', kind: 'secondary', onClick: () => {
        Object.assign(d, { positions: [], minFam: DEFAULT_MIN_FAM, feet: [], tags: [], tagMode: 'any', tiers: [], slots: [], unassigned: false, attrs: [], role: emptyRole(),
          ranges: Object.fromEntries(Object.keys(RANGES).map((k) => [k, ['', '']])) });
        render();
      } },
    ];
  }

  sheet = openSheet({ title: 'Filters', titleClass: 'sheet-title-sm', content: body, actions: actions(false) });
  sheet.el.classList.add('sheet-tall', 'sheet-filters');
  render();
  loadRoleCatalogue().then((c) => { cat = c; if (sheet.el.isConnected) render(); });
}
