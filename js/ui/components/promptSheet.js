// Small bottom sheet asking for a name (used to create/rename lineups).
// Resolves the trimmed text, or null when cancelled. Text is set as a value,
// never as HTML.

import { h } from '../dom.js';
import { openSheet } from './sheet.js';

export function promptSheet({ title, label = 'Name', value = '', confirmLabel = 'Save', placeholder = '' }) {
  return new Promise((resolve) => {
    let result = null;
    const error = h('p', { class: 'prompt-error', hidden: true }, 'Enter a name.');
    const input = h('input', {
      type: 'text', class: 'picker-search', id: 'prompt-input', value, placeholder,
      autocomplete: 'off', autocapitalize: 'sentences', spellcheck: 'false', enterkeyhint: 'done',
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } },
      oninput: () => { error.hidden = true; },
    });
    input.value = value;
    let sheet;
    function submit() {
      const v = input.value.replace(/\s+/g, ' ').trim();
      if (!v) { error.hidden = false; input.focus(); return; }
      result = v;
      sheet.close();
    }
    sheet = openSheet({
      title,
      content: [h('label', { class: 'field-label', for: 'prompt-input' }, label), input, error],
      actions: [
        { label: confirmLabel, onClick: () => submit() },
        { label: 'Cancel', kind: 'secondary', onClick: (close) => close() },
      ],
      onClose: () => resolve(result),
    });
    setTimeout(() => { input.focus(); input.select(); }, 60);
  });
}
