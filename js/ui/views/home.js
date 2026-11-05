import { h, icon } from '../dom.js';
import { getModel, getSquadMap, TEAM_SLOTS } from '../../store.js';
import { formatGameDate } from '../../data/snapshot.js';

function welcome(onImport) {
  return h('div', { class: 'welcome' },
    h('img', { class: 'welcome-logo', src: 'icons/logo.png', alt: 'SquadLab' }),
    h('p', { class: 'welcome-text' }, 'Import a JSON extract from your Football Manager save to see your squad and shortlists.'),
    h('button', { type: 'button', class: 'btn btn-primary btn-large', onclick: onImport },
      icon('upload'), 'Import JSON'),
    h('p', { class: 'privacy' }, 'Your extract stays on this device. It is stored in this browser only and never uploaded.'),
  );
}

export function SnapshotCard(model) {
  return h('div', { class: 'snapshot' },
    h('div', { class: 'snapshot-main' },
      h('span', { class: 'snapshot-club' }, model.club?.name || '—'),
      model.club?.manager_name ? h('span', { class: 'snapshot-manager' }, model.club.manager_name) : null,
    ),
    h('div', { class: 'snapshot-date' },
      h('span', { class: 'snapshot-label' }, 'In-game date'),
      h('span', { class: 'snapshot-value' }, formatGameDate(model.gameDate)),
    ),
  );
}

function widget({ href, iconName, title, meta }) {
  return h('a', { class: 'widget', href },
    icon(iconName, 'widget-icon'),
    h('span', { class: 'widget-body' },
      h('span', { class: 'widget-title' }, title),
      h('span', { class: 'widget-meta' }, meta),
    ),
    icon('chevron', 'widget-chevron'),
  );
}

export function HomeView({ onImport }) {
  const model = getModel();
  if (!model) return { title: 'SquadLab', isHome: true, body: welcome(onImport) };

  const map = getSquadMap();
  const assigned = TEAM_SLOTS.filter((s) => map[s.key]).length;
  const listCount = model.shortlists.length;

  return {
    title: 'SquadLab',
    isHome: true,
    body: h('div', { class: 'stack' },
      SnapshotCard(model),
      h('div', { class: 'widgets' },
        widget({
          href: '#/squad', iconName: 'squad', title: 'Squad',
          meta: `${model.raw.squad_player_uids?.length ?? model.squads.reduce((n, s) => n + s.playerUids.length, 0)} club players · ${assigned} of 3 teams assigned`,
        }),
        widget({
          href: '#/shortlists', iconName: 'list', title: 'Shortlists',
          meta: `${listCount} ${listCount === 1 ? 'list' : 'lists'}`,
        }),
      ),
    ),
  };
}
