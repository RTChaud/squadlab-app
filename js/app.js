// SquadLab entry point: wires the shell (header, import button) to the views.

import * as store from './store.js';
import { currentRoute, onRouteChange } from './router.js';
import { ImportError } from './data/importer.js';
import { formatGameDate } from './data/snapshot.js';
import { toast, showError } from './ui/components/feedback.js';
import { HomeView } from './ui/views/home.js';
import { SquadView, SquadTeamView, SquadSetupView } from './ui/views/squad.js';
import { ShortlistsView } from './ui/views/shortlists.js';

const els = {
  view: document.getElementById('view'),
  back: document.getElementById('back-btn'),
  brand: document.getElementById('brand'),
  title: document.getElementById('page-title'),
  titleMain: document.getElementById('page-title-main'),
  titleSub: document.getElementById('page-title-sub'),
  importBtn: document.getElementById('import-btn'),
  fileInput: document.getElementById('file-input'),
};

const openPicker = () => els.fileInput.click();

const VIEWS = {
  home: () => HomeView({ onImport: openPicker }),
  squad: () => SquadView(),
  squadSetup: () => SquadSetupView(),
  squadTeam: (p) => SquadTeamView(p),
  shortlists: (p) => ShortlistsView(p),
};

let renderToken = 0;
let lastPath = null;

async function render() {
  const token = ++renderToken;
  let route = currentRoute();

  // Everything except Home needs imported data.
  if (!store.getModel() && route.name !== 'home') {
    location.replace('#/');
    return;
  }

  let vm = VIEWS[route.name] ? await VIEWS[route.name](route.params) : null;
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
  els.importBtn.classList.toggle('compact', !vm.isHome);
  els.title.hidden = !!vm.isHome;
  els.titleMain.textContent = vm.title;
  const sub = vm.subtitle || (model ? `${model.club?.name ?? '—'} · ${formatGameDate(model.gameDate)}` : '');
  els.titleSub.textContent = sub;
  els.titleSub.hidden = !sub;
  document.title = vm.isHome ? 'SquadLab' : `${vm.title} · SquadLab`;

  els.view.replaceChildren(vm.body);
  if (route.path !== lastPath) window.scrollTo(0, 0);
  lastPath = route.path;
}

async function handleFile(file) {
  els.importBtn.disabled = true;
  els.importBtn.classList.add('busy');
  try {
    const { warnings, shownIsImported } = await store.importExtract(file);
    const m = store.getModel();
    if (shownIsImported) {
      toast(`Imported ${m.club?.name ?? 'extract'} · ${formatGameDate(m.gameDate)}`);
    } else {
      toast('Imported and saved. A later in-game date is already shown.', 'info');
    }
    if (warnings.length) showError('Imported with warnings', warnings, 'The extract was imported and saved.');
    if (currentRoute().name !== 'home') location.hash = '#/';
  } catch (e) {
    if (e instanceof ImportError) showError(e.message, e.details);
    else showError('Import failed', [String(e?.message || e)]);
  } finally {
    els.importBtn.disabled = false;
    els.importBtn.classList.remove('busy');
    els.fileInput.value = ''; // allow re-selecting the same file
  }
}

function wire() {
  els.importBtn.addEventListener('click', openPicker);
  els.fileInput.addEventListener('change', () => {
    const file = els.fileInput.files && els.fileInput.files[0];
    if (file) handleFile(file);
  });
  store.subscribe(() => render());
  onRouteChange(render);
}

async function start() {
  wire();
  try {
    await store.init();
  } catch (e) {
    showError('Could not load saved data', [String(e?.message || e)], 'You can still import an extract.');
    render();
  }
}

start();
