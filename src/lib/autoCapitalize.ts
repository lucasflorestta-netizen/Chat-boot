const LETTER = /\p{L}/u;
const SENTENCE_END = /[.!?]/;

/** Skip capitalization for quick-reply shortcuts like `/oi`. */
export function isSlashShortcut(text: string): boolean {
  return text.startsWith('/');
}

/**
 * Force uppercase at the start of the message and after sentence terminators / newlines.
 * Leaves slash-shortcut input untouched.
 */
export function autoCapitalize(text: string): string {
  if (!text || isSlashShortcut(text)) return text;

  let out = '';
  let atSentenceStart = true;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (atSentenceStart && LETTER.test(ch)) {
      out += ch.toLocaleUpperCase('pt-BR');
      atSentenceStart = false;
      continue;
    }

    out += ch;

    if (ch === '\n' || SENTENCE_END.test(ch)) {
      atSentenceStart = true;
    } else if (!/\s/u.test(ch)) {
      atSentenceStart = false;
    }
  }

  return out;
}
