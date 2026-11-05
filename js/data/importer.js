// Reads and validates a Football Manager JSON extract.
// The file's own schema is kept as-is; validation only checks that the fields
// SquadLab relies on are present and consistent.

export const SUPPORTED_SCHEMA_VERSIONS = [2];
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export class ImportError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ImportError';
    this.details = details;
  }
}

function readFileText(file) {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);

/**
 * Parse + validate. Resolves to { data, warnings } or throws ImportError.
 */
export async function importFile(file) {
  if (!file) throw new ImportError('No file was selected.');
  if (file.size === 0) throw new ImportError('The selected file is empty.');
  if (file.size > MAX_FILE_BYTES) {
    throw new ImportError(`The file is too large (${(file.size / 1048576).toFixed(1)} MB).`);
  }

  let text;
  try {
    text = await readFileText(file);
  } catch {
    throw new ImportError('The file could not be read. If it is in iCloud Drive, make sure it has finished downloading and try again.');
  }

  let data;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    throw new ImportError('This file is not valid JSON.', [String(e.message || e)]);
  }

  return validateExtract(data);
}

export function validateExtract(data) {
  const errors = [];
  const warnings = [];

  if (!isObj(data)) {
    throw new ImportError('This JSON does not look like a SquadLab extract.', ['The top level must be an object.']);
  }

  // Header fields
  if (!isInt(data.schema_version)) {
    errors.push('Missing "schema_version".');
  } else if (!SUPPORTED_SCHEMA_VERSIONS.includes(data.schema_version)) {
    errors.push(`Unsupported schema_version ${data.schema_version} (supported: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}).`);
  }
  if (typeof data.career_id !== 'string' || !data.career_id) errors.push('Missing "career_id".');
  if (typeof data.game_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.game_date)) {
    errors.push('Missing or invalid "game_date" (expected YYYY-MM-DD).');
  }
  if (!isObj(data.club) || typeof data.club.name !== 'string' || !data.club.name) {
    errors.push('Missing "club.name".');
  }

  // Players
  const uids = new Set();
  if (!Array.isArray(data.players)) {
    errors.push('Missing "players" list.');
  } else {
    if (data.players.length === 0) errors.push('The "players" list is empty.');
    let badUid = 0;
    let dupUid = 0;
    for (const p of data.players) {
      if (!isObj(p) || !isInt(p.uid)) { badUid++; continue; }
      if (uids.has(p.uid)) dupUid++;
      uids.add(p.uid);
    }
    if (badUid) errors.push(`${badUid} player record(s) have no numeric "uid".`);
    if (dupUid) errors.push(`${dupUid} duplicate player uid(s) found.`);
  }

  // Membership lists
  const checkGroups = (key, label) => {
    if (!Array.isArray(data[key])) {
      errors.push(`Missing "${key}" list.`);
      return;
    }
    const ids = new Set();
    let unresolved = 0;
    data[key].forEach((g, i) => {
      if (!isObj(g) || typeof g.id !== 'string' || !g.id) {
        errors.push(`${label} #${i + 1} has no "id".`);
        return;
      }
      if (ids.has(g.id)) errors.push(`Duplicate ${label.toLowerCase()} id "${g.id}".`);
      ids.add(g.id);
      if (!Array.isArray(g.player_uids)) {
        errors.push(`${label} "${g.name || g.id}" has no "player_uids" list.`);
        return;
      }
      for (const u of g.player_uids) if (!uids.has(u)) unresolved++;
    });
    if (unresolved) {
      warnings.push(`${unresolved} ${label.toLowerCase()} membership(s) refer to players not in the file; they will be skipped.`);
    }
  };
  checkGroups('squads', 'Squad');
  checkGroups('shortlists', 'Shortlist');

  if (errors.length) {
    throw new ImportError('This file cannot be imported.', errors);
  }

  return { data, warnings };
}
