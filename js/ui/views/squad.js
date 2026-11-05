import { h, icon } from '../dom.js';
import { getModel, getSquadMap, setSquadMapping, TEAM_SLOTS } from '../../store.js';
import { PlayerList } from '../components/playerList.js';
import { toast } from '../components/feedback.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function resolvedCount(model, squad) {
  return model.resolve(squad.playerUids).length;
}

// ---- Squad overview: three team widgets ------------------------------------

export function SquadView() {
  const model = getModel();
  const map = getSquadMap();

  const widgets = TEAM_SLOTS.map((slot) => {
    const squad = map[slot.key] ? model.squadById(map[slot.key]) : null;
    if (!squad) {
      return h('a', { class: 'widget widget-unset', href: '#/squad/setup' },
        h('span', { class: 'widget-body' },
          h('span', { class: 'widget-title' }, slot.label),
          h('span', { class: 'widget-meta accent' }, 'Not assigned — tap to choose a squad'),
        ),
        icon('chevron', 'widget-chevron'),
      );
    }
    return h('a', { class: 'widget', href: `#/squad/${slot.key}` },
      h('span', { class: 'widget-count' }, resolvedCount(model, squad)),
      h('span', { class: 'widget-body' },
        h('span', { class: 'widget-title' }, slot.label),
        h('span', { class: 'widget-meta' }, squad.name),
      ),
      icon('chevron', 'widget-chevron'),
    );
  });

  // Groups that exist in the extract but aren't one of the three teams.
  const mappedIds = new Set(Object.values(map).filter(Boolean));
  const others = model.squads.filter((s) => !mappedIds.has(s.id));

  return {
    title: 'Squad',
    back: '#/',
    body: h('div', { class: 'stack' },
      h('div', { class: 'widgets' }, widgets),
      h('a', { class: 'btn btn-secondary btn-block', href: '#/squad/setup' }, icon('settings'), 'Assign teams'),
      others.length
        ? h('div', { class: 'note' },
            h('p', { class: 'note-title' }, 'Other groups in this extract'),
            h('ul', { class: 'note-list' },
              others.map((s) => h('li', {}, h('span', {}, s.name), h('span', { class: 'muted' }, plural(s.playerUids.length, 'player'))))),
            h('p', { class: 'note-text' }, 'Kept in your data but not shown as teams. These players are not added to any of the three teams.'),
          )
        : null,
    ),
  };
}

// ---- One team's players ----------------------------------------------------

export function SquadTeamView({ slotKey }) {
  const model = getModel();
  const slot = TEAM_SLOTS.find((s) => s.key === slotKey);
  if (!slot) return null;
  const squadId = getSquadMap()[slot.key];
  const squad = squadId ? model.squadById(squadId) : null;

  if (!squad) {
    return {
      title: slot.label,
      back: '#/squad',
      body: h('div', { class: 'empty' },
        h('p', { class: 'empty-title' }, `${slot.label} is not assigned`),
        h('p', { class: 'empty-text' }, 'Choose which imported squad this widget should show.'),
        h('a', { class: 'btn btn-primary', href: '#/squad/setup' }, 'Assign teams'),
      ),
    };
  }

  const players = model.resolve(squad.playerUids);
  return {
    title: slot.label,
    subtitle: `${squad.name} · ${plural(players.length, 'player')}`,
    back: '#/squad',
    body: PlayerList(players, { emptyTitle: 'No players in this squad' }),
  };
}

// ---- Assign the three widgets to imported squad IDs ------------------------

function ageRange(model, squad) {
  const ages = model.resolve(squad.playerUids).map((p) => p.age).filter(Number.isInteger);
  if (!ages.length) return '';
  const lo = Math.min(...ages), hi = Math.max(...ages);
  return lo === hi ? `age ${lo}` : `ages ${lo}–${hi}`;
}

export function SquadSetupView() {
  const model = getModel();
  const map = getSquadMap();
  const teams = model.squads.filter((s) => s.kind === 'team');

  const optionLabel = (s) => {
    const parts = [s.name, plural(s.playerUids.length, 'player')];
    const ages = ageRange(model, s);
    if (ages) parts.push(ages);
    return parts.join(' · ');
  };

  const rows = TEAM_SLOTS.map((slot) => {
    const select = h('select', {
      class: 'select', id: `map-${slot.key}`,
      onchange: async (e) => {
        const id = e.target.value || null;
        // A squad can only back one widget; free it from any other slot.
        for (const other of TEAM_SLOTS) {
          if (other.key !== slot.key && id && getSquadMap()[other.key] === id) {
            await setSquadMapping(other.key, null);
            toast(`${other.label} is now unassigned`, 'info');
          }
        }
        await setSquadMapping(slot.key, id);
      },
    },
      h('option', { value: '' }, 'Not assigned'),
      teams.map((s) => h('option', { value: s.id, selected: map[slot.key] === s.id }, optionLabel(s))),
    );
    return h('div', { class: 'field' },
      h('label', { class: 'field-label', for: `map-${slot.key}` }, slot.label),
      select,
    );
  });

  return {
    title: 'Assign teams',
    back: '#/squad',
    body: h('div', { class: 'stack' },
      h('p', { class: 'intro' }, 'Choose which imported squad each widget shows. Names come from the extract; reserve and youth names are placeholders until the extractor can read them. Your choice is saved on this device and reused for future imports of this save.'),
      h('div', { class: 'card' }, rows),
      h('p', { class: 'muted small' }, 'Out on loan and Unassigned groups are kept in your data but cannot be used as one of the three teams.'),
      h('a', { class: 'btn btn-primary btn-block', href: '#/squad' }, 'Done'),
    ),
  };
}
