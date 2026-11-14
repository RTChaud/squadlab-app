// The Data menu and its flows: import FM snapshot, import/export app backup,
// reset. Every flow validates first and writes in a single transaction, so a
// failed or cancelled action leaves stored data as it was.

import { h, icon } from './dom.js';
import * as store from '../store.js';
import { ImportError } from '../data/importer.js';
import { formatGameDate } from '../data/snapshot.js';
import { openSheet, confirmSheet } from './components/sheet.js';
import { BackupExporter } from './components/backupExport.js';
import { toast, showError, showNotice } from './components/feedback.js';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const fmtStamp = (iso) => {
  if (!iso) return 'unknown time';
  const d = new Date(iso);
  return Number.isNaN(+d) ? String(iso) : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

function careerSummaryLines() {
  const model = store.getModel();
  const hist = store.getHistory();
  if (!model) return [];
  const range = hist.length > 1
    ? `${formatGameDate(hist[hist.length - 1].gameDate)} – ${formatGameDate(hist[0].gameDate)}`
    : formatGameDate(hist[0].gameDate);
  return [`${model.club?.name ?? '—'}${model.club?.manager_name ? ` · ${model.club.manager_name}` : ''}`, `${plural(hist.length, 'snapshot')} · ${range}`];
}

// ---- File picking ------------------------------------------------------------------

const input = () => document.getElementById('file-input');
let pickMode = null;

/** Must be called directly from a tap so iOS opens the Files picker. */
export function pick(mode) {
  pickMode = mode;
  const el = input();
  el.value = '';
  el.click();
}

export function wireFileInput() {
  input().addEventListener('change', () => {
    const file = input().files?.[0];
    const mode = pickMode;
    pickMode = null;
    if (!file) return; // cancelled: nothing changes
    if (mode === 'backup') importBackupFlow(file);
    else if (mode === 'restoreOlder') importSnapshotFlow(file, { restore: true });
    else if (mode === 'newCareer') newCareerFlow(file);
    else importSnapshotFlow(file);
  });
}

// While a file is read or written, the Data tile is disabled (if shown).
async function busy(fn) {
  const btn = document.getElementById('data-tile');
  document.documentElement.classList.add('data-busy');
  if (btn) btn.disabled = true;
  try { return await fn(); } finally {
    document.documentElement.classList.remove('data-busy');
    const b = document.getElementById('data-tile');
    if (b) b.disabled = false;
  }
}

function failed(e) {
  if (e instanceof ImportError) showError(e.message, e.details);
  else showError('Something went wrong', [String(e?.message || e)]);
}

const goHome = () => { if (location.hash !== '#/' && location.hash !== '') location.hash = '#/'; };

// ---- Add FM snapshot (to the active career) ------------------------------------------------

const careerName = (c) => `${c.clubName ?? '—'}${c.managerName ? ` · ${c.managerName}` : ''}`;
const careerRange = (c) => `${plural(c.count, 'snapshot')} · ${c.count > 1 ? `${formatGameDate(c.oldest)} – ` : ''}${formatGameDate(c.newest)}`;

/** Destination career and incoming snapshot, shown before anything is written. */
function importDetails(prepared) {
  const { data, destination: d, match } = prepared;
  const lines = [
    h('p', { class: 'sheet-sub' }, 'Destination career'),
    h('ul', { class: 'sheet-list import-dest' }, h('li', {}, careerName(d)), h('li', {}, careerRange(d))),
    h('p', { class: 'sheet-sub' }, 'Incoming snapshot'),
    h('ul', { class: 'sheet-list import-incoming' },
      h('li', {}, h('b', {}, formatGameDate(data.game_date)), ` · ${data.club?.name ?? '—'}`),
      h('li', {}, `${plural(match.linked, 'player')} linked to this career${match.added ? ` · ${match.added} new` : ''}${match.unlinked ? ` · ${match.unlinked} without a player ID` : ''}`),
      prepared.clubDiffers ? h('li', { class: 'import-warn' }, `Club differs from this career (${d.clubName})`) : null),
  ];
  return h('div', {}, ...lines);
}

/**
 * Normal import adds later snapshots and offers to replace the same date.
 * With { restore: true } it is the recovery path for an earlier date.
 */
async function importSnapshotFlow(file, { restore = false } = {}) {
  let prepared;
  try {
    prepared = await busy(() => store.prepareSnapshot(file));
  } catch (e) { failed(e); return; }

  const { data } = prepared;
  const date = formatGameDate(data.game_date);
  const where = prepared.destination ? careerName(prepared.destination) : '';

  try {
    switch (prepared.status) {
      case 'duplicate':
        showNotice('Already imported', [`The ${date} snapshot is already in ${where}.`], 'Nothing was changed.');
        return;

      case 'sameDate': {
        const ok = await confirmSheet({
          title: `Replace the ${date} snapshot?`,
          message: h('div', {},
            importDetails(prepared),
            h('ul', { class: 'sheet-list' },
              h('li', {}, `Stored: exported ${fmtStamp(prepared.existing.exportedAt)}`),
              h('li', {}, `This file: exported ${fmtStamp(data.exported_at_utc)}`))),
          confirmLabel: 'Replace snapshot',
          cancelLabel: 'Keep existing',
        });
        if (!ok) return;
        await busy(() => store.addSnapshot(prepared));
        toast(`Replaced the ${date} snapshot`);
        break;
      }

      case 'older': {
        const newest = formatGameDate(prepared.destination.newest);
        if (!restore) {
          showError(`${date} is earlier than your newest snapshot`, [
            `${where} already goes up to ${newest}.`,
            'To add it to this career, use Data → Restore older snapshot.',
          ]);
          return;
        }
        const ok = await confirmSheet({
          title: `Restore ${date} into this career?`,
          message: h('div', {}, importDetails(prepared),
            h('p', { class: 'sheet-text' }, `${newest} stays selected.`)),
          confirmLabel: 'Restore snapshot',
        });
        if (!ok) return;
        await busy(() => store.restoreOlderSnapshot(prepared));
        toast(`Restored ${date} · showing ${formatGameDate(store.getModel().gameDate)}`);
        break;
      }

      case 'first': {
        await busy(() => store.addSnapshot(prepared));
        toast(`Imported ${data.club?.name ?? 'snapshot'} · ${date}`);
        break;
      }

      default: { // 'new'
        if (restore) {
          showError(`${date} is not earlier than your newest snapshot`, ['Use Data → Add FM snapshot for later dates.']);
          return;
        }
        const ok = await confirmSheet({
          title: `Add ${date}?`,
          message: importDetails(prepared),
          confirmLabel: 'Add snapshot',
        });
        if (!ok) return;
        await busy(() => store.addSnapshot(prepared));
        toast(`Added ${date} to ${prepared.destination.clubName ?? 'this career'}`);
      }
    }
    goHome();
    if (prepared.warnings.length) showNotice('Imported with notes', prepared.warnings, 'The snapshot was imported and saved.');
  } catch (e) {
    failed(e);
  }
}

// ---- New career / switch career ----------------------------------------------------------

async function newCareerFlow(file) {
  let prepared;
  try {
    prepared = await busy(() => store.prepareNewCareer(file));
  } catch (e) { failed(e); return; }
  const { data } = prepared;
  const date = formatGameDate(data.game_date);
  const cur = store.careerSummary();
  const ok = await confirmSheet({
    title: 'Start a new career?',
    message: h('div', {},
      h('p', { class: 'sheet-sub' }, 'New career'),
      h('ul', { class: 'sheet-list' }, h('li', {}, `${data.club?.name ?? '—'}${data.club?.manager_name ? ` · ${data.club.manager_name}` : ''}`), h('li', {}, date)),
      cur ? h('p', { class: 'sheet-sub' }, 'Kept on this device') : null,
      cur ? h('ul', { class: 'sheet-list' }, h('li', {}, careerName(cur)), h('li', {}, careerRange(cur))) : null),
    confirmLabel: 'Start new career',
  });
  if (!ok) return;
  try {
    await busy(() => store.startNewCareer(prepared));
    toast(`New career started · ${data.club?.name ?? ''} · ${date}`);
    goHome();
  } catch (e) { failed(e); }
}

async function switchCareerFlow() {
  const careers = await store.listCareers();
  const s = openSheet({
    title: 'Switch career',
    content: h('div', { class: 'menu' }, careers.map((c) => h('button', {
      type: 'button', class: `menu-item career-item${c.active ? ' active' : ''}`, disabled: c.active,
      onclick: async () => {
        s.close();
        try { await busy(() => store.switchCareer(c.careerId)); toast(`Switched to ${c.clubName ?? 'career'}`); goHome(); } catch (e) { failed(e); }
      },
    }, h('span', { class: 'menu-body' },
      h('span', { class: 'menu-title' }, careerName(c), c.active ? h('span', { class: 'career-active' }, 'Active') : null),
      h('span', { class: 'menu-text' }, careerRange(c)))))),
    actions: [{ label: 'Close', kind: 'secondary', onClick: (close) => close() }],
  });
}

// ---- Import app backup ------------------------------------------------------------------

async function importBackupFlow(file) {
  let prepared;
  try {
    prepared = await busy(() => store.prepareBackup(file));
  } catch (e) { failed(e); return; }

  const { summary, backup } = prepared;
  const hasData = !!store.getModel();
  const others = hasData ? (await store.listCareers()).filter((c) => !c.active).length : 0;
  const backupLines = [
    `${summary.clubName}${summary.managerName ? ` · ${summary.managerName}` : ''}`,
    `${plural(summary.count, 'snapshot')} · ${formatGameDate(summary.firstDate)} – ${formatGameDate(summary.lastDate)}`,
    `Backup made ${fmtStamp(summary.exportedAt)}`,
  ];

  const ok = await confirmSheet({
    title: 'Restore this backup?',
    danger: hasData,
    message: h('div', {},
      h('p', { class: 'sheet-text' }, hasData
        ? 'Restoring replaces all current app data on this device with the backup. Your current career is not merged with it.'
        : 'This restores the career below.'),
      h('p', { class: 'sheet-sub' }, 'Backup'),
      h('ul', { class: 'sheet-list' }, backupLines.map((l) => h('li', {}, l))),
      hasData ? h('p', { class: 'sheet-sub' }, 'Will be replaced') : null,
      hasData ? h('ul', { class: 'sheet-list' }, careerSummaryLines().map((l) => h('li', {}, l)), others ? h('li', {}, `and ${plural(others, 'other career')} on this device`) : null) : null,
    ),
    offerBackup: hasData,
    ack: hasData ? 'I understand the current data will be replaced.' : null,
    confirmLabel: hasData ? 'Replace with backup' : 'Restore backup',
  });
  if (!ok) return;

  try {
    await busy(() => store.restoreBackup(backup));
    toast(`Restored ${summary.clubName} · ${plural(summary.count, 'snapshot')}`);
    goHome();
  } catch (e) {
    showError('Restore failed', [String(e?.message || e)], 'Your previous data has been kept.');
  }
}

// ---- Export / reset ----------------------------------------------------------------------

function exportFlow() {
  openSheet({
    title: 'Export app backup',
    content: [
      h('p', { class: 'sheet-text' }, 'One file with every snapshot, all squad and shortlist history, and your settings. On iPhone, choose “Save to Files” to keep it in iCloud Drive.'),
      h('ul', { class: 'sheet-list' }, careerSummaryLines().map((l) => h('li', {}, l))),
      BackupExporter({ autoStart: true }),
    ],
    actions: [{ label: 'Done', kind: 'secondary', onClick: (close) => close() }],
  });
}

async function resetFlow() {
  const ok = await confirmSheet({
    title: 'Reset app data?',
    danger: true,
    message: h('div', {},
      h('p', { class: 'sheet-text' }, 'This removes all career data and history stored on this device, including every snapshot and your settings. You can bring a career back later by importing its app backup.'),
      h('ul', { class: 'sheet-list' }, careerSummaryLines().map((l) => h('li', {}, l))),
    ),
    offerBackup: true,
    ack: 'I understand all stored data will be removed.',
    confirmLabel: 'Reset app data',
  });
  if (!ok) return;
  try {
    await busy(() => store.resetAll());
    toast('App data reset', 'info');
    goHome();
  } catch (e) {
    showError('Reset failed', [String(e?.message || e)], 'Your data has been kept.');
  }
}

// ---- Menu ------------------------------------------------------------------------------

function item({ iconName, title, text, onClick, disabled }) {
  return h('button', { type: 'button', class: 'menu-item', disabled, onclick: onClick },
    icon(iconName, 'menu-icon'),
    h('span', { class: 'menu-body' },
      h('span', { class: 'menu-title' }, title),
      h('span', { class: 'menu-text' }, text)),
  );
}

export async function openDataMenu() {
  const hasData = !!store.getModel();
  const careerCount = hasData ? (await store.listCareers()).length : 0;
  const lines = careerSummaryLines();
  let sheet;
  // Close first, then open the picker in the same tap.
  const run = (fn) => () => { sheet.close(); fn(); };

  sheet = openSheet({
    title: 'Data',
    content: [
      hasData ? h('div', { class: 'menu-career' }, h('span', { class: 'menu-career-club' }, lines[0]), h('span', { class: 'muted' }, lines[1])) : null,
      h('div', { class: 'menu' },
        item({ iconName: 'upload', title: hasData ? 'Add FM snapshot' : 'Import FM snapshot', text: hasData ? 'Add a later in-game date to this career' : 'Start with a dated extract', onClick: run(() => pick('snapshot')) }),
        hasData ? item({ iconName: 'restore', title: 'Restore older snapshot', text: 'Add an earlier in-game date to this career', onClick: run(() => pick('restoreOlder')) }) : null,
        hasData ? item({ iconName: 'plus', title: 'Start new career', text: 'From a snapshot · current career is kept', onClick: run(() => pick('newCareer')) }) : null,
        careerCount > 1 ? item({ iconName: 'squad', title: 'Switch career', text: `${careerCount} careers on this device`, onClick: run(switchCareerFlow) }) : null,
        item({ iconName: 'restore', title: 'Import app backup', text: 'Restore a SquadLab backup (replaces current data)', onClick: run(() => pick('backup')) }),
        item({ iconName: 'download', title: 'Export app backup', text: hasData ? 'Save everything to Files or iCloud Drive' : 'Nothing to export yet', onClick: run(exportFlow), disabled: !hasData }),
      ),
      hasData ? h('button', { type: 'button', class: 'menu-reset', onclick: run(resetFlow) }, 'Reset app data') : null,
    ],
  });
}
