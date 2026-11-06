import { h, icon } from '../dom.js';
import { getModel, getHistory } from '../../store.js';
import { formatGameDate, resolveTeams } from '../../data/snapshot.js';

function welcome(onImport, onRestore) {
  return h('div', { class: 'welcome' },
    h('img', { class: 'welcome-logo', src: 'icons/logo.png', alt: 'SquadLab' }),
    h('p', { class: 'welcome-text' }, 'Import a snapshot from your Football Manager save to see your squad and shortlists.'),
    h('button', { type: 'button', class: 'btn btn-primary btn-large', onclick: onImport },
      icon('upload'), 'Import FM snapshot'),
    h('button', { type: 'button', class: 'btn btn-text', onclick: onRestore }, 'or restore an app backup'),
    h('p', { class: 'privacy' }, 'Your data stays on this device. It is stored in this browser only and never uploaded.'),
  );
}

export function SnapshotCard(model, count) {
  return h('div', { class: 'snapshot' },
    h('div', { class: 'snapshot-main' },
      h('span', { class: 'snapshot-club' }, model.club?.name || '—'),
      model.club?.manager_name ? h('span', { class: 'snapshot-manager' }, model.club.manager_name) : null,
    ),
    h('div', { class: 'snapshot-date' },
      h('span', { class: 'snapshot-label' }, 'In-game date'),
      h('span', { class: 'snapshot-value' }, formatGameDate(model.gameDate)),
      count > 1 ? h('span', { class: 'snapshot-label' }, `${count} snapshots`) : null,
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

export function HomeView({ onImport, onRestore }) {
  const model = getModel();
  if (!model) return { title: 'SquadLab', isHome: true, body: welcome(onImport, onRestore) };

  const teams = resolveTeams(model);
  const teamMeta = teams.some((t) => t.issues.length)
    ? 'Squad data problem — tap for details'
    : teams.map((t) => `${t.short} ${t.players.length}`).join(' · ');
  const listCount = model.visibleShortlists.length;

  return {
    title: 'SquadLab',
    isHome: true,
    body: h('div', { class: 'stack' },
      SnapshotCard(model, getHistory().length),
      h('div', { class: 'widgets' },
        widget({
          href: '#/squad', iconName: 'squad', title: 'Squad',
          meta: teamMeta,
        }),
        widget({
          href: '#/shortlists', iconName: 'list', title: 'Shortlists',
          meta: `${listCount} ${listCount === 1 ? 'list' : 'lists'}`,
        }),
      ),
    ),
  };
}
