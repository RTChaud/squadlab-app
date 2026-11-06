// Lineups list: the three fixed defaults first (in order), then custom
// lineups. Route: #/lineups

import { h, icon } from '../dom.js';
import { listLineups, createLineup } from '../../store.js';
import { SLOT_IDS } from '../../data/lineups.js';
import { promptSheet } from '../components/promptSheet.js';
import { toast } from '../components/feedback.js';

const filled = (l) => SLOT_IDS.filter((id) => l.slots[id]).length;

export function LineupsView() {
  const lineups = listLineups();
  const defaults = lineups.filter((l) => l.kind === 'default');
  const customs = lineups.filter((l) => l.kind === 'custom');

  const row = (l) => h('a', { class: 'widget lineup-row', href: `#/lineups/${encodeURIComponent(l.id)}` },
    h('span', { class: 'widget-count' }, `${filled(l)}`),
    h('span', { class: 'widget-body' },
      h('span', { class: 'widget-title' }, l.name),
      h('span', { class: 'widget-meta' }, `${filled(l)} of 11 slots filled`)),
    icon('chevron', 'widget-chevron'));

  const create = async () => {
    const name = await promptSheet({ title: 'New lineup', confirmLabel: 'Create', placeholder: 'e.g. Cup XI' });
    if (!name) return;
    try {
      const l = await createLineup(name);
      location.hash = `#/lineups/${encodeURIComponent(l.id)}`;
    } catch (e) { toast(String(e?.message || e), 'info'); }
  };

  return {
    title: 'Lineups',
    back: '#/',
    body: h('div', { class: 'stack' },
      h('div', { class: 'widgets' }, defaults.map(row)),
      customs.length ? h('p', { class: 'list-head' }, 'Custom lineups') : null,
      customs.length ? h('div', { class: 'widgets' }, customs.map(row)) : null,
      h('button', { type: 'button', class: 'btn btn-secondary btn-block', onclick: create }, icon('plus'), 'New lineup'),
    ),
  };
}
