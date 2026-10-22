import type { ReactNode } from 'react';

const NUMBER_PATTERN = /(\+?\b\d+\b%?|\b\d+s\b)/g;

function fixMissingSpacing(text: string): string {
  return text
    .replace(/\b(up to)(\d)/gi, '$1 $2')
    .replace(/(\d)([A-Z][a-z]+)/g, '$1 $2');
}

/** Plain formatting function (not a component) that returns an array
 * of React nodes with standalone numbers, percentages, +N-style
 * modifiers, and Ns-style durations highlighted in blue -- e.g.
 * "ASPD +30", "100%", "+40%", "18s". Numbers embedded in other tokens
 * (like "M3" or "Lv7") are left untouched, since \b\d+\b naturally
 * doesn't match a digit immediately preceded by a letter with no
 * boundary between them.
 *
 * Called directly inline (e.g. {highlightStats(text)}) rather than
 * as a component, since a plain array of nodes avoids any possible
 * edge case tied to how a separate component boundary interacts with
 * its parent's layout. */
export function highlightStats(text: string | null | undefined): ReactNode[] {
  if (!text) return [];
  const fixed = fixMissingSpacing(text);
  const parts = fixed.split(NUMBER_PATTERN);
  // split() with a capturing group always alternates
  // [non-match, match, non-match, match, ...], so odd indices are
  // guaranteed matches -- no need to re-test each part against the
  // regex (which would be a real bug here anyway, since global
  // regexes are stateful and .test() would give wrong results inside
  // a loop).
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="op-stat-highlight">
        {part}
      </span>
    ) : (
      part
    )
  );
}

/** Render the small, trusted inline-markup subset used by game text.
 * Unknown tags remain visible as text instead of being interpreted as HTML. */
export function renderGameText(text: string | null | undefined): ReactNode[] {
  if (!text) return [];
  const parts = text.split(/(<\/?i>)/gi);
  const rendered: ReactNode[] = [];
  let emphasisDepth = 0;

  parts.forEach((part, index) => {
    if (/^<i>$/i.test(part)) {
      emphasisDepth += 1;
      return;
    }
    if (/^<\/i>$/i.test(part)) {
      emphasisDepth = Math.max(0, emphasisDepth - 1);
      return;
    }
    if (!part) return;
    rendered.push(emphasisDepth > 0 ? <em key={index}>{part}</em> : part);
  });
  return rendered;
}
