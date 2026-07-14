import { Fragment, type ReactNode } from 'react';

/**
 * Renders WhatsApp-style basic formatting: *bold* and _italic_.
 * Escapes HTML by rendering as React text nodes only.
 */
export function FormattedText({ text, className }: { text: string; className?: string }) {
  return <p className={className}>{parseWhatsAppFormatting(text)}</p>;
}

function parseWhatsAppFormatting(input: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Match *bold* or _italic_ (non-greedy, same-line preferred)
  const re = /(\*[^*\n]+\*|_[^_\n]+_)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(input)) !== null) {
    if (match.index > last) {
      nodes.push(<Fragment key={key++}>{input.slice(last, match.index)}</Fragment>);
    }
    const token = match[0];
    if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(
        <strong key={key++} className="font-semibold">
          {token.slice(1, -1)}
        </strong>,
      );
    } else if (token.startsWith('_') && token.endsWith('_')) {
      nodes.push(
        <em key={key++} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    } else {
      nodes.push(<Fragment key={key++}>{token}</Fragment>);
    }
    last = match.index + token.length;
  }

  if (last < input.length) {
    nodes.push(<Fragment key={key++}>{input.slice(last)}</Fragment>);
  }

  return nodes.length > 0 ? nodes : [input];
}
