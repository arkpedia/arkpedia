import { CLAUSE_BREAK, matchSpan } from './clauses';

/**
 * The short form of a technique entry: the clause of the operator's own text that holds
 * the words the technique was found by, with whatever number and condition share it
 * ("When deployed, all blocked enemies take +14% Physical damage"). /techniques' records
 * show it unless "Detailed Skill Description" is on.
 *
 * Only cut, never written: the clauses are the operator's text exactly, split where the
 * rules split it (CLAUSE_BREAK: a semicolon, or a full stop that is not a decimal point).
 * Where there is nothing to find -- a hand-written technique, a skill credited through a
 * talent it names -- or the clause is most of the text anyway, this is null and the full
 * text shows in both modes rather than a summary somebody made up (owner, 2026-10-23).
 * scripts/tests/test-technique-excerpt.ts pins it.
 */
export function techniqueExcerpt(badge: {
  sourceText: string | null;
  matchedKeyword: string | null;
  matchedKeywordEnd: string | null;
  highlightSeparately: boolean;
}): string | null {
  const text = badge.sourceText?.trim();
  const keyword = badge.matchedKeyword;
  if (!text || !keyword) return null;
  const span = badge.highlightSeparately ? closestPair(text, keyword, badge.matchedKeywordEnd) : matchSpan(text, keyword, badge.matchedKeywordEnd);
  if (!span) return null;
  const [from, to] = span;
  const excerpt = text.slice(clauseStart(text, from), clauseEnd(text, to)).trim();
  // Most of the text already: the short form would only be the long one, clipped.
  return excerpt.length >= text.length * 0.85 ? null : excerpt;
}

/** A stat pattern's word and number as the highlight pairs them (markTwoSeparately): the
 *  case-sensitive occurrences closest to each other. */
function closestPair(text: string, keyword: string, keywordEnd: string | null): [number, number] | null {
  const all = (needle: string) => {
    const out: number[] = [];
    for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + 1)) out.push(i);
    return out;
  };
  const words = all(keyword);
  if (!words.length) return null;
  if (!keywordEnd) return [words[0], words[0] + keyword.length];
  let best: [number, number] | null = null;
  let gap = Infinity;
  for (const w of words) {
    for (const n of all(keywordEnd)) {
      if (Math.abs(n - w) < gap) {
        gap = Math.abs(n - w);
        best = [Math.min(w, n), Math.max(w + keyword.length, n + keywordEnd.length)];
      }
    }
  }
  return best ?? [words[0], words[0] + keyword.length];
}

const breaks = () => new RegExp(CLAUSE_BREAK.source, 'g');

/** The start of the clause holding `at`: just past the last break before it. */
function clauseStart(text: string, at: number): number {
  let start = 0;
  const re = breaks();
  for (let m = re.exec(text); m && m.index < at; m = re.exec(text)) start = m.index + m[0].length;
  return start;
}

/** The end of the clause holding `at`, keeping a closing full stop. */
function clauseEnd(text: string, at: number): number {
  const re = breaks();
  re.lastIndex = at;
  const m = re.exec(text);
  if (!m) return text.length;
  return m[0] === '.' ? m.index + 1 : m.index;
}
