// "Export backup" control. Works in two taps on purpose: the first builds the
// file, the second saves it. iPhone only allows the share sheet / download
// straight from a tap, so saving must not wait on database reads.

import { h } from '../dom.js';
import { buildBackup } from '../../store.js';

const isTouch = () => window.matchMedia?.('(pointer: coarse)').matches;

/**
 * Save a Blob as a file. On iPhone this opens the share sheet, where
 * "Save to Files" stores it in Files / iCloud Drive; elsewhere it downloads.
 * Resolves 'shared' | 'downloaded' | 'cancelled'.
 */
export async function saveFile(blob, filename) {
  if (isTouch() && typeof File === 'function' && navigator.canShare) {
    const file = new File([blob], filename, { type: 'application/json' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return 'shared';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
        // otherwise fall back to a normal download
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}

const mb = (bytes) => (bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`);

/** @param {{label?: string, autoStart?: boolean}} opts */
export function BackupExporter(opts = {}) {
  const status = h('p', { class: 'export-status', 'aria-live': 'polite' });
  const btn = h('button', { type: 'button', class: 'btn btn-secondary btn-block' });
  const wrap = h('div', { class: 'export-box' }, btn, status);
  let built = null;

  const setIdle = () => {
    btn.textContent = opts.label || 'Export app backup';
    btn.disabled = false;
    btn.onclick = prepare;
  };

  async function prepare() {
    btn.disabled = true;
    btn.textContent = 'Preparing backup…';
    status.textContent = '';
    try {
      built = await buildBackup();
      btn.disabled = false;
      btn.classList.replace('btn-secondary', 'btn-primary');
      btn.textContent = `Save backup file (${mb(built.blob.size)})`;
      status.textContent = built.filename;
      btn.onclick = save;
    } catch (e) {
      status.textContent = `Could not prepare the backup: ${e?.message || e}`;
      status.classList.add('error');
      setIdle();
    }
  }

  async function save() {
    const outcome = await saveFile(built.blob, built.filename);
    if (outcome === 'cancelled') {
      status.textContent = 'Not saved. Tap again to save the backup.';
      return;
    }
    btn.classList.replace('btn-primary', 'btn-secondary');
    btn.textContent = 'Save again';
    status.textContent = outcome === 'shared'
      ? `Backup handed to the share sheet: ${built.filename}`
      : `Backup downloaded: ${built.filename}`;
    status.classList.add('ok');
  }

  setIdle();
  if (opts.autoStart) prepare();
  return wrap;
}
