import { h, icon } from '../dom.js';
import { getModel } from '../../store.js';
import { formatGameDate } from '../../data/snapshot.js';

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

// Compact save strip: club on the left (wraps if long), in-game date on the right.
function saveStrip(model) {
  return h('div', { class: 'save-strip' },
    h('span', { class: 'save-club' }, model.club?.name || '—'),
    h('span', { class: 'save-date' }, formatGameDate(model.gameDate)));
}

// Launcher order: squad tools on top (Squad, Lineups, Tactic), scouting below
// (Shortlists, Tags, Comparison).
const TILES = [
  { href: '#/squad', iconName: 'squad', label: 'Squad' },
  { href: '#/lineups', iconName: 'pitch', label: 'Lineups' },
  { href: '#/tactic', iconName: 'tactic', label: 'Tactic' },
  { href: '#/shortlists', iconName: 'list', label: 'Shortlists' },
  { href: '#/tags', iconName: 'tag', label: 'Tags' },
  { href: '#/compare', iconName: 'compare', label: 'Comparison' },
];

const tile = ({ href, iconName, label }) => h('li', { class: 'app-cell' },
  h('a', { class: 'app-tile', href },
    icon(iconName, 'app-icon'),
    h('span', { class: 'app-label' }, label)));

export function HomeView({ onImport, onRestore }) {
  const model = getModel();
  if (!model) return { title: 'SquadLab', isHome: true, body: welcome(onImport, onRestore) };
  return {
    title: 'SquadLab',
    isHome: true,
    body: h('div', { class: 'home' },
      saveStrip(model),
      h('nav', { 'aria-label': 'Sections' }, h('ul', { class: 'app-grid' }, TILES.map(tile)))),
  };
}
