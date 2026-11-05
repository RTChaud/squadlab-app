import { h, icon } from '../dom.js';
import { getModel } from '../../store.js';
import { resolveTeams, TEAM_SLOTS } from '../../data/snapshot.js';
import { PlayerList } from '../components/playerList.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function issueBox(issues) {
  return h('div', { class: 'issue', role: 'alert' },
    icon('alert', 'issue-icon'),
    h('div', {},
      h('p', { class: 'issue-title' }, 'Squad data problem in this snapshot'),
      h('ul', { class: 'issue-list' }, issues.map((i) => h('li', {}, i))),
      h('p', { class: 'issue-note' }, 'Nothing has been guessed. Re-export the snapshot from the extractor, or check its squads section.'),
    ),
  );
}

// ---- Squad overview: three team widgets ------------------------------------

export function SquadView() {
  const model = getModel();
  const teams = resolveTeams(model);

  const widgets = teams.map((t) => {
    const hasIssue = t.issues.length > 0;
    return h('a', { class: `widget${hasIssue ? ' widget-warn' : ''}`, href: `#/squad/${t.key}` },
      t.fatal
        ? icon('alert', 'widget-icon warn')
        : h('span', { class: 'widget-count' }, t.players.length),
      h('span', { class: 'widget-body' },
        h('span', { class: 'widget-title' }, t.label),
        h('span', { class: `widget-meta${hasIssue ? ' warn' : ''}` },
          t.fatal ? 'Not available in this snapshot — tap for details'
            : hasIssue ? `${t.squad.name} · data problem — tap for details`
            : t.squad.name),
      ),
      icon('chevron', 'widget-chevron'),
    );
  });

  // Groups that exist in the extract but aren't one of the three teams.
  const linked = new Set(teams.filter((t) => t.squad).map((t) => t.squad.id));
  const others = model.squads.filter((s) => !linked.has(s.id));

  return {
    title: 'Squad',
    back: '#/',
    body: h('div', { class: 'stack' },
      h('div', { class: 'widgets' }, widgets),
      others.length
        ? h('div', { class: 'note' },
            h('p', { class: 'note-title' }, 'Other groups in this snapshot'),
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
  if (!TEAM_SLOTS.some((s) => s.key === slotKey)) return null;
  const t = resolveTeams(model).find((x) => x.key === slotKey);

  if (t.fatal) {
    return { title: t.label, back: '#/squad', body: issueBox(t.issues) };
  }

  return {
    title: t.label,
    subtitle: `${t.squad.name} · ${plural(t.players.length, 'player')}`,
    back: '#/squad',
    body: h('div', { class: 'stack' },
      t.issues.length ? issueBox(t.issues) : null,
      PlayerList(t.players, { emptyTitle: 'No players in this squad' }),
    ),
  };
}
