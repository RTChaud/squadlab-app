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
        // Subtitle only when something is wrong with this group's data.
        hasIssue ? h('span', { class: 'widget-meta warn' },
          t.fatal ? 'Not available in this snapshot — tap for details' : 'Data problem — tap for details') : null,
      ),
      icon('chevron', 'widget-chevron'),
    );
  });

  return {
    title: 'Squad',
    back: '#/',
    body: h('div', { class: 'stack' },
      h('div', { class: 'widgets' }, widgets),
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
    subtitle: plural(t.players.length, 'player'),
    back: '#/squad',
    body: h('div', { class: 'stack' },
      t.issues.length ? issueBox(t.issues) : null,
      PlayerList(t.players, { emptyTitle: 'No players in this squad', from: `/squad/${t.key}` }),
    ),
  };
}
