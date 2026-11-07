// Filters sheet for the Squad and Shortlists tables. Edits a draft and only
// hands back sanitised filters on Apply. Different categories combine with
// AND; options inside one category match any selected option (tags can
// switch to "All selected"); every attribute condition must match.

import { h } from '../dom.js';
import { openSheet } from './sheet.js';
import { pickAttribute } from './attributePicker.js';
import {
  POSITION_CHOICES, FOOT_CHOICES, TIER_CHOICES, SLOT_CHOICES, OPERATORS, RANGES, ATTR_CHOICE, ATTR_SCALE,
  sanitizeFilters, conditionError, rangeError, DEFAULT_MIN_FAM,
} from '../../data/listView.js';

// Familiarity codes laid out like the profile pitch (front to back).
const POS_LAYOUT = [[null, 'stc', null], ['aml', 'amc', 'amr'], ['ml', 'mc', 'mr'], ['wbl', 'dm', 'wbr'], ['dl', 'dc', 'dr'], [null, 'gk', null]];
const POS_LABEL = Object.fromEntries(POSITION_CHOICES.map((p) => [p.code, p.label]));

const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const strOf = (v) => (v === null || v === undefined ? '' : String(v));
const numOrNull = (v) => (String(v).trim() === '' ? null : Number(v));

/**
 * @param {object} o  filters, tags: [{ id, name }], onApply(filters)
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
  };

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
    return out;
  }

  function positionsSection() {
    const grid = h('div', { class: 'fpitch' }, POS_LAYOUT.map((row) => h('div', { class: 'fpitch-row' }, row.map((code) => (code
      ? tchip(POS_LABEL[code], d.positions.includes(code), () => { d.positions = toggleIn(d.positions, code); render(); }, { aria: `Position ${POS_LABEL[code]}` })
      : h('span', { class: 'fpitch-gap' }))))));
    const fam = h('select', {
      class: 'select select-sm', id: 'f-minfam', 'aria-label': 'Minimum familiarity',
      onchange: (e) => { d.minFam = Number(e.target.value); },
    }, Array.from({ length: 20 }, (_, i) => i + 1).map((n) => h('option', { value: n, selected: n === d.minFam }, String(n))));
    return section('Position',
      grid,
      h('div', { class: 'frow' }, h('label', { class: 'muted small', for: 'f-minfam' }, 'Minimum familiarity (1–20)'), fam));
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

  function apply(close) {
    if (Object.keys(errors()).length) return updateErrors();
    const out = {
      positions: d.positions, minFam: d.minFam,
      feet: d.feet, tags: d.tags, tagMode: d.tagMode,
      tiers: d.tiers, slots: d.slots, unassigned: d.unassigned,
      attrs: d.attrs.map((c) => ({ key: c.key, op: c.op, value: Number(c.value) })),
    };
    for (const k of Object.keys(RANGES)) out[k] = d.ranges[k].map(numOrNull);
    o.onApply(sanitizeFilters(out));
    close();
  }

  function actions(hasErrors) {
    return [
      { label: hasErrors ? 'Fix the highlighted values' : 'Apply filters', disabled: hasErrors, onClick: apply },
      { label: 'Clear all', kind: 'secondary', onClick: () => {
        Object.assign(d, { positions: [], minFam: DEFAULT_MIN_FAM, feet: [], tags: [], tagMode: 'any', tiers: [], slots: [], unassigned: false, attrs: [],
          ranges: Object.fromEntries(Object.keys(RANGES).map((k) => [k, ['', '']])) });
        render();
      } },
    ];
  }

  sheet = openSheet({ title: 'Filters', titleClass: 'sheet-title-sm', content: body, actions: actions(false) });
  sheet.el.classList.add('sheet-tall');
  render();
}
