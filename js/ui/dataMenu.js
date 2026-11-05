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
    else importSnapshotFlow(file);
  });
}

async function busy(fn) {
  const btn = document.getElementById('data-btn');
  btn.disabled = true;
  btn.classList.add('busy');
  try { return await fn(); } finally { btn.disabled = false; btn.classList.remove('busy'); }
}

function failed(e) {
  if (e instanceof ImportError) showError(e.message, e.details);
  else showError('Something went wrong', [String(e?.message || e)]);
}

const goHome = () => { if (location.hash !== '#/' && location.hash !== '') location.hash = '#/'; };

// ---- Import FM snapshot ---------------------------------------------------------------

async function importSnapshotFlow(file) {
  let prepared;
  try {
    prepared = await busy(() => store.prepareSnapshot(file));
  } catch (e) { failed(e); return; }

  const { data } = prepared;
  const date = formatGameDate(data.game_date);

  try {
    switch (prepared.status) {
      case 'duplicate':
        showNotice('Already imported', [`The ${date} snapshot is already in your history.`], 'Nothing was changed.');
        return;

      case 'sameDate': {
        const ok = await confirmSheet({
          title: `Replace the ${date} snapshot?`,
          message: 'Your history already has a different snapshot for this in-game date.',
          details: [
            `Stored: exported ${fmtStamp(prepared.existing.exportedAt)}`,
            `This file: exported ${fmtStamp(data.exported_at_utc)}`,
          ],
          confirmLabel: 'Replace snapshot',
          cancelLabel: 'Keep existing',
        });
        if (!ok) return;
        await busy(() => store.addSnapshot(prepared));
        toast(`Replaced the ${date} snapshot`);
        break;
      }

      case 'otherCareer': {
        const cur = careerSummaryLines();
        const ok = await confirmSheet({
          title: 'This snapshot is from another career',
          danger: true,
          message: h('div', {},
            h('p', { class: 'sheet-text' }, `It belongs to ${data.club?.name ?? 'another club'}${data.club?.manager_name ? ` (${data.club.manager_name})` : ''}, which has a different career ID. SquadLab holds one career at a time and never merges two careers.`),
            h('p', { class: 'sheet-text' }, `Current career: ${cur.join(' · ')}. Starting a new career removes it from this device, so back it up first.`)),
          offerBackup: true,
          ack: 'I understand the current career will be removed from this device.',
          confirmLabel: 'Start new career',
        });
        if (!ok) return;
        await busy(() => store.startNewCareer(prepared));
        toast(`New career started · ${data.club?.name ?? ''} · ${date}`);
        break;
      }

      case 'older': {
        await busy(() => store.addSnapshot(prepared));
        toast(`Added ${date} to history · still showing ${formatGameDate(store.getModel().gameDate)}`, 'info');
        break;
      }

      default: { // 'first' | 'new'
        await busy(() => store.addSnapshot(prepared));
        toast(`Imported ${data.club?.name ?? 'snapshot'} · ${date}`);
      }
    }
    goHome();
    if (prepared.warnings.length) showNotice('Imported with notes', prepared.warnings, 'The snapshot was imported and saved.');
  } catch (e) {
    failed(e);
  }
}

// ---- Import app backup ------------------------------------------------------------------

async function importBackupFlow(file) {
  let prepared;
  try {
    prepared = await busy(() => store.prepareBackup(file));
  } catch (e) { failed(e); return; }

  const { summary, backup } = prepared;
  const hasData = !!store.getModel();
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
      hasData ? h('ul', { class: 'sheet-list' }, careerSummaryLines().map((l) => h('li', {}, l))) : null,
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

export function openDataMenu() {
  const hasData = !!store.getModel();
  const lines = careerSummaryLines();
  let sheet;
  // Close first, then open the picker in the same tap.
  const run = (fn) => () => { sheet.close(); fn(); };

  sheet = openSheet({
    title: 'Data',
    content: [
      hasData ? h('div', { class: 'menu-career' }, h('span', { class: 'menu-career-club' }, lines[0]), h('span', { class: 'muted' }, lines[1])) : null,
      h('div', { class: 'menu' },
        item({ iconName: 'upload', title: 'Import FM snapshot', text: 'Add a dated extract to this career’s history', onClick: run(() => pick('snapshot')) }),
        item({ iconName: 'restore', title: 'Import app backup', text: 'Restore a SquadLab backup (replaces current data)', onClick: run(() => pick('backup')) }),
        item({ iconName: 'download', title: 'Export app backup', text: hasData ? 'Save everything to Files or iCloud Drive' : 'Nothing to export yet', onClick: run(exportFlow), disabled: !hasData }),
      ),
      hasData ? h('button', { type: 'button', class: 'menu-reset', onclick: run(resetFlow) }, 'Reset app data') : null,
    ],
  });
}
