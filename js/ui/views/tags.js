// Tags screen: one dropdown of all tags (alphabetical, with counts) and the
// selected tag's players, in the same browser as Squad and Shortlists (search,
// filters, sorting, columns and saved views; its settings are remembered
// separately). Tagged players missing from the latest snapshot show their last
// recorded data, marked "Last recorded <date>".
// Route: #/tags or #/tags/<tagId>

import { h } from '../dom.js';
import { listTags, tagById, getTagMembers, getLastTag, setLastTag } from '../../store.js';
import { PlayerBrowser } from '../components/playerBrowser.js';

export async function TagsView({ tagId }) {
  const tags = listTags();

  if (!tags.length) {
    return {
      title: 'Tags',
      back: '#/',
      body: h('div', { class: 'empty' },
        h('p', { class: 'empty-title' }, 'No tags yet'),
        h('p', { class: 'empty-text' }, 'Open a player’s profile and tap Tags to add one.')),
    };
  }

  let current = tagId ? tagById(tagId) : null;
  if (!current) {
    const last = await getLastTag();
    current = (last && tagById(last)) || tags[0];
  }
  setLastTag(current.id);

  const select = h('select', {
    class: 'select', id: 'tag-select', 'aria-label': 'Tag',
    // replace so Back returns to Home rather than stepping through each tag
    onchange: (e) => location.replace(`#/tags/${encodeURIComponent(e.target.value)}`),
  }, tags.map((t) => h('option', { value: t.id, selected: t.id === current.id }, `${t.name} (${t.count})`)));

  const members = await getTagMembers(current.id);
  const older = new Map(members.filter((m) => !m.current).map((m) => [m.player, m.gameDate]));

  return {
    title: 'Tags',
    back: '#/',
    body: h('div', { class: 'stack' },
      h('div', { class: 'field' },
        h('label', { class: 'field-label', for: 'tag-select' }, 'Tag'),
        select,
      ),
      await PlayerBrowser({
        section: 'tags', source: current.id, sourceName: `“${current.name}”`,
        players: members.map((m) => m.player), older,
        from: `/tags/${encodeURIComponent(current.id)}`,
        emptyTitle: 'No players to show',
        emptyText: 'None of this tag’s players are in a stored snapshot.',
      }),
    ),
  };
}
