import { h, icon } from '../dom.js';
import { getModel } from '../../store.js';
import { openDataMenu } from '../dataMenu.js';
import { formatGameDate } from '../../data/snapshot.js';
import { clubIdentity, FALLBACK_CREST } from '../../data/clubIdentity.js';

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

// ---- Club banner ----------------------------------------------------------------------
// Crest + club name with the in-game date beneath (a shortcut to Snapshots), a
// faint oversized crest clipped on the right and faint club-colour accents.
// Identity comes from data/clubs.json; unknown clubs get the SquadLab logo.

function clubBanner(model) {
  const name = model.club?.name || '—';
  const date = formatGameDate(model.gameDate);
  const crest = h('img', { class: 'club-crest-img', src: FALLBACK_CREST, alt: '', width: 48, height: 48, decoding: 'async' });
  const watermark = h('img', { class: 'club-watermark', src: FALLBACK_CREST, alt: '', 'aria-hidden': 'true', decoding: 'async' });
  const banner = h('section', { class: 'club-banner fallback-crest', 'aria-label': `${name}, ${date}` },
    h('span', { class: 'club-banner-deco', 'aria-hidden': 'true' }, watermark),
    h('span', { class: 'club-crest' }, crest),
    h('div', { class: 'club-text' },
      h('p', { class: 'save-club club-name', title: name }, name),
      h('a', { class: 'save-date club-date', href: '#/snapshots', 'aria-label': `${date}, open Snapshots` },
        date, icon('chevron', 'club-date-chev'))));

  clubIdentity(model.club).then((id) => {
    const [a, b] = id.colours;
    if (a) banner.style.setProperty('--club-a', a);
    if (b || a) banner.style.setProperty('--club-b', b || a);
    banner.classList.toggle('has-colours', !!a);
    if (!id.crestIsFallback) {
      const fail = () => { crest.src = FALLBACK_CREST; watermark.src = FALLBACK_CREST; banner.classList.add('fallback-crest'); };
      crest.addEventListener('error', fail, { once: true });
      crest.src = id.crest; watermark.src = id.crest;
      banner.classList.remove('fallback-crest');
    }
  });
  return banner;
}

// ---- Launcher ---------------------------------------------------------------------------
// Order: squad tools (Squad, Lineups, Tactic), scouting (Shortlists, Tags,
// Comparison), history and data (Development, Snapshots, Data).
//
// Each tile has faint line art behind its icon (100×100 viewBox, thin strokes,
// partly cropped), faded out around the icon by a CSS mask.

const ART = {
  squad: '<g fill="none"><path d="M50 96 L22 78 M50 96 L40 78 M50 96 L60 78 M50 96 L78 78 M22 78 L28 56 M40 78 L50 56 M60 78 L50 56 M78 78 L72 56 M28 56 L18 32 M50 56 L50 30 M72 56 L82 32 M18 32 L50 30 L82 32"/></g><g class="fill"><circle cx="50" cy="96" r="2.4"/><circle cx="22" cy="78" r="2.4"/><circle cx="40" cy="78" r="2.4"/><circle cx="60" cy="78" r="2.4"/><circle cx="78" cy="78" r="2.4"/><circle cx="28" cy="56" r="2.4"/><circle cx="50" cy="56" r="2.4"/><circle cx="72" cy="56" r="2.4"/><circle cx="18" cy="32" r="2.4"/><circle cx="50" cy="30" r="2.4"/><circle cx="82" cy="32" r="2.4"/></g>',
  lineups: '<g fill="none"><rect x="9" y="-8" width="82" height="116" rx="2"/><path d="M9 50 H91"/><circle cx="50" cy="50" r="13"/><path d="M30 -8 V12 H70 V-8 M40 -8 V3 H60 V-8 M30 108 V88 H70 V108 M40 108 V97 H60 V108"/><path d="M41 12 A10 10 0 0 0 59 12 M41 88 A10 10 0 0 1 59 88"/></g><g class="fill"><circle cx="50" cy="50" r="1.6"/></g>',
  tactic: '<g fill="none"><path d="M8 88 C26 80 24 52 46 40"/><path d="M40 37 L47 39.5 L44 46"/><path d="M92 84 C76 74 84 50 64 34" stroke-dasharray="3 3.5"/><path d="M60 28 L64.5 34 L57 35.5"/><path d="M14 30 C26 26 30 14 44 10" stroke-dasharray="3 3.5"/><path d="M82 8 L90 16 M90 8 L82 16"/><circle cx="16" cy="58" r="4"/><circle cx="84" cy="62" r="4"/></g>',
  shortlists: '<g fill="none"><rect x="12" y="10" width="54" height="72" rx="4" transform="rotate(-9 39 46)"/><rect x="30" y="22" width="56" height="74" rx="4" transform="rotate(5 58 59)"/><path d="M40 40 H74 M40 52 H78 M40 64 H70 M40 76 H76" transform="rotate(5 58 59)"/></g>',
  tags: '<g fill="none"><path d="M6 14 H38 L58 34 L34 58 L6 30 Z"/><circle cx="16" cy="24" r="3.2"/><path d="M44 44 H78 L100 66 L74 92 L44 62 Z"/><circle cx="55" cy="55" r="3.2"/><path d="M58 4 H82 L98 20 L80 38 L58 18 Z"/></g>',
  compare: '<g fill="none"><path d="M50 -2 V102" stroke-dasharray="2 3"/></g><g class="fill"><rect x="20" y="12" width="28" height="4" rx="2"/><rect x="52" y="12" width="18" height="4" rx="2"/><rect x="30" y="26" width="18" height="4" rx="2"/><rect x="52" y="26" width="36" height="4" rx="2"/><rect x="12" y="40" width="36" height="4" rx="2"/><rect x="52" y="40" width="22" height="4" rx="2"/><rect x="26" y="54" width="22" height="4" rx="2"/><rect x="52" y="54" width="30" height="4" rx="2"/><rect x="16" y="68" width="32" height="4" rx="2"/><rect x="52" y="68" width="14" height="4" rx="2"/><rect x="34" y="82" width="14" height="4" rx="2"/><rect x="52" y="82" width="40" height="4" rx="2"/></g>',
  development: '<g fill="none"><path d="M0 25 H100 M0 50 H100 M0 75 H100" stroke-dasharray="1.5 3.5"/><path d="M-2 88 L16 78 L30 82 L46 62 L60 56 L74 38 L90 26 L104 14"/></g><g class="fill"><circle cx="16" cy="78" r="2.4"/><circle cx="30" cy="82" r="2.4"/><circle cx="46" cy="62" r="2.4"/><circle cx="60" cy="56" r="2.4"/><circle cx="74" cy="38" r="2.4"/><circle cx="90" cy="26" r="2.4"/></g>',
  snapshots: '<g fill="none"><rect x="6" y="14" width="52" height="38" rx="4" transform="rotate(-10 32 33)"/><rect x="26" y="34" width="52" height="38" rx="4" transform="rotate(4 52 53)"/><rect x="46" y="58" width="52" height="38" rx="4" transform="rotate(-6 72 77)"/><circle cx="18" cy="24" r="3" transform="rotate(-10 32 33)"/><path d="M66 66 H86" transform="rotate(-6 72 77)"/></g>',
  data: '<g fill="none"><ellipse cx="20" cy="16" rx="13" ry="5"/><path d="M7 16 V30 C7 33 13 35 20 35 C27 35 33 33 33 30 V16"/><ellipse cx="82" cy="80" rx="13" ry="5"/><path d="M69 80 V94 C69 97 75 99 82 99 C89 99 95 97 95 94 V80"/><path d="M33 26 L58 30 L78 18 M58 30 L64 56 L69 82 M64 56 L30 74 L12 96 M30 74 L20 35" stroke-dasharray="2 3"/></g><g class="fill"><circle cx="58" cy="30" r="2.4"/><circle cx="78" cy="18" r="2.4"/><circle cx="64" cy="56" r="2.4"/><circle cx="30" cy="74" r="2.4"/><circle cx="12" cy="96" r="2.4"/></g>',
};

const TILES = [
  { key: 'squad', href: '#/squad', iconName: 'squad', label: 'Squad' },
  { key: 'lineups', href: '#/lineups', iconName: 'pitch', label: 'Lineups' },
  { key: 'tactic', href: '#/tactic', iconName: 'tactic', label: 'Tactic' },
  { key: 'shortlists', href: '#/shortlists', iconName: 'list', label: 'Shortlists' },
  { key: 'tags', href: '#/tags', iconName: 'tag', label: 'Tags' },
  { key: 'compare', href: '#/compare', iconName: 'compare', label: 'Comparison' },
  { key: 'development', href: '#/development', iconName: 'chart', label: 'Development' },
  { key: 'snapshots', href: '#/snapshots', iconName: 'snapshots', label: 'Snapshots' },
  { key: 'data', id: 'data-tile', onclick: () => openDataMenu(), iconName: 'data', label: 'Data' },
];

const art = (key) => h('span', { class: 'app-art', 'aria-hidden': 'true',
  html: `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" focusable="false">${ART[key]}</svg>` });

const tile = ({ key, href, id, onclick, iconName, label }) => h('li', { class: 'app-cell' },
  h(href ? 'a' : 'button', {
    class: 'app-tile', 'data-tile': key,
    ...(href ? { href } : { type: 'button', id, onclick, 'aria-haspopup': 'dialog' }),
  },
  h('span', { class: 'app-icon' }, art(key), h('span', { class: 'app-halo', 'aria-hidden': 'true' }), icon(iconName, 'app-glyph')),
  h('span', { class: 'app-label' }, label)));

export function HomeView({ onImport, onRestore }) {
  const model = getModel();
  if (!model) return { title: 'SquadLab', isHome: true, body: welcome(onImport, onRestore) };
  return {
    title: 'SquadLab',
    isHome: true,
    body: h('div', { class: 'home' },
      h('div', { class: 'home-backdrop', 'aria-hidden': 'true' }, h('span', { class: 'home-pitch' })),
      clubBanner(model),
      h('nav', { 'aria-label': 'Sections' }, h('ul', { class: 'app-grid' }, TILES.map(tile)))),
  };
}
