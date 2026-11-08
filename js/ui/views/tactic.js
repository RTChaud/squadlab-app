// Tactic: placeholder until the role guide (position → In / Out of Possession →
// roles and their key attributes) is built.
// Route: #/tactic

import { h, icon } from '../dom.js';

export function TacticView() {
  return {
    title: 'Tactic',
    back: '#/',
    body: h('div', { class: 'soon' },
      icon('tactic', 'soon-icon'),
      h('p', { class: 'soon-title' }, 'Coming soon'),
      h('a', { class: 'btn btn-secondary', href: '#/' }, 'Back to Home')),
  };
}
