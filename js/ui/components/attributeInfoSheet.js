// Short explanation sheet for one attribute (bundled text, works offline).
// Shared by the player profile and the comparison table.

import { h } from '../dom.js';
import { openSheet } from './sheet.js';
import { attributeInfo } from '../../data/attributeInfo.js';

export function openAttributeInfo(def, opener) {
  const { text } = attributeInfo(def.key);
  openSheet({
    title: def.label.replace(/\s*\(Tendency\)$/, ''),
    titleClass: 'attr-info-title',
    content: [
      text
        ? h('p', { class: 'attr-info-text' }, text)
        : h('p', { class: 'attr-info-text muted' }, 'Verified explanation not yet available.'),
    ],
    actions: [{ label: 'Close', kind: 'secondary', onClick: (close) => close() }],
    onClose: () => opener?.focus?.(),
  });
}
