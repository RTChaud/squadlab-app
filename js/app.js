// SquadLab entry point: wires the shell (header, Data menu) to the views.

import * as store from './store.js';
import { currentRoute, onRouteChange } from './router.js';
import { formatGameDate } from './data/snapshot.js';
import { showError } from './ui/components/feedback.js';
import { openDataMenu, pick, wireFileInput } from './ui/dataMenu.js';
import { HomeView } from './ui/views/home.js';
import { SquadView } from './ui/views/squad.js';
import { ShortlistsView } from './ui/views/shortlists.js';
import { TagsView } from './ui/views/tags.js';
import { LineupsView } from './ui/views/lineups.js';
import { CompareView } from './ui/views/compare.js';
import { LineupView } from './ui/views/lineup.js';
import { LineupPickerView, pickerOpenedFrom } from './ui/views/lineupPicker.js';
import { PlayerView } from './ui/views/player.js';
import { DevelopmentView } from './ui/views/development.js';

const els = {
  header: document.querySelector('.topbar'),
  view: document.getElementById('view'),
  back: document.getElementById('back-btn'),
  brand: document.getElementById('brand'),
  title: document.getElementById('page-title'),
  titleMain: document.getElementById('page-title-main'),
  titleSub: document.getElementById('page-title-sub'),
  dataBtn: document.getElementById('data-btn'),
};

const VIEWS = {
  home: () => HomeView({ onImport: () => pick('snapshot'), onRestore: () => pick('backup') }),
  squadTeam: (p) => SquadView(p),
  shortlists: (p) => ShortlistsView(p),
  tags: (p) => TagsView(p),
  lineups: () => LineupsView(),
  compare: () => CompareView(),
  lineup: (p, q) => LineupView({ ...p, query: q }),
  lineupPick: (p) => LineupPickerView(p),
  player: (p, q) => PlayerView({ ...p, query: q }),
  development: (p, q) => DevelopmentView({ ...p, query: q }),
};

// Remember list scroll positions so Back from a profile returns to the same spot.
const scrollMemory = new Map();
const REMEMBER_SCROLL = new Set(['squadTeam', 'shortlists', 'tags', 'compare']);

let renderToken = 0;
let lastRoute = null;

async function render() {
  const token = ++renderToken;
  const route = currentRoute();

  // Everything except Home needs imported data.
  if (!store.getModel() && route.name !== 'home') {
    location.replace('#/');
    return;
  }

  if (lastRoute && REMEMBER_SCROLL.has(lastRoute.name)) scrollMemory.set(lastRoute.full, window.scrollY);

  // The picker returns to the pitch with Back when it was opened from it.
  if (route.name === 'lineupPick' && lastRoute?.name !== 'lineupPick') pickerOpenedFrom(lastRoute ? `#${lastRoute.full}` : null);

  const vm = VIEWS[route.name] ? await VIEWS[route.name](route.params, route.query) : null;
  if (token !== renderToken) return; // a newer render started
  if (!vm) {
    location.replace('#/');
    return;
  }

  // Header
  const model = store.getModel();
  els.back.hidden = !vm.back;
  if (vm.back) els.back.setAttribute('href', vm.back);
  els.brand.hidden = !vm.isHome;
  els.title.hidden = !!vm.isHome;
  els.titleMain.textContent = vm.title;
  const sub = vm.subtitle || (model ? `${model.club?.name ?? '—'} · ${formatGameDate(model.gameDate)}` : '');
  els.titleSub.textContent = sub;
  els.titleSub.hidden = !sub;
  document.title = vm.isHome ? 'SquadLab' : `${vm.title} · SquadLab`;

  els.view.replaceChildren(vm.body);
  if (route.full !== lastRoute?.full) {
    const remembered = REMEMBER_SCROLL.has(route.name) ? scrollMemory.get(route.full) : null;
    window.scrollTo(0, remembered ?? 0);
  }
  watchRevealTitle(vm.revealTitle || null);
  lastRoute = route;
}

// Compact header on pages whose own card shows the name (the player profile):
// the header shows just the date, and the name slides in once the card's
// name has scrolled under the header. Fixed height, so nothing jumps.
let revealObserver = null;
function watchRevealTitle(target) {
  revealObserver?.disconnect();
  revealObserver = null;
  els.title.classList.toggle('reveal', !!target);
  const setShown = (shown) => els.title.classList.toggle('show-name', shown);
  if (!target) { setShown(false); return; }
  const headerH = () => els.header.getBoundingClientRect().height;
  // Correct state straight away (e.g. a re-render while scrolled down).
  setShown(target.getBoundingClientRect().bottom <= headerH());
  if (!('IntersectionObserver' in window)) { setShown(true); return; }
  revealObserver = new IntersectionObserver(([e]) => {
    setShown(!e.isIntersecting && e.boundingClientRect.top < headerH());
  }, { rootMargin: `-${Math.round(headerH())}px 0px 0px 0px` });
  revealObserver.observe(target);
}

// Keep sticky elements (list column headings) just below the real header height,
// whatever the safe-area inset is.
function trackHeaderHeight() {
  const set = () => document.documentElement.style.setProperty('--header-h', `${els.header.offsetHeight}px`);
  set();
  // border-box so changes to the safe-area padding are noticed too
  if ('ResizeObserver' in window) new ResizeObserver(set).observe(els.header, { box: 'border-box' });
  window.addEventListener('resize', set);
  window.addEventListener('orientationchange', set);
}

// Mark the installed Home Screen app so CSS can be checked/tuned for it.
function markDisplayMode() {
  const standalone = window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
  document.documentElement.classList.toggle('standalone', !!standalone);
}

async function start() {
  markDisplayMode();
  trackHeaderHeight();
  els.dataBtn.addEventListener('click', openDataMenu);
  wireFileInput();
  store.subscribe(() => render());
  onRouteChange(render);
  try {
    await store.init();
  } catch (e) {
    showError('Could not load saved data', [String(e?.message || e)], 'Nothing has been deleted. Try reloading the app.');
    render();
  }
}

start();
