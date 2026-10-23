import type { ReactNode } from 'react';
import { findKeywordSpan } from '@/lib/techniques/synergyDetection';
import { matchSpan } from '@/lib/techniques/clauses';

/* The words a technique or synergy was found by, picked out in the operator's own text.
   Moved here unchanged from pages/techniques.tsx and pages/synergies.tsx, whose table
   views drew them; the records (components/techniques/*Record.tsx) do now. */

const mark = (text: string) => <span className="technique-mark">{text}</span>;

/** Wraps the genuine, word-boundary match of `keyword` within `text`
 * in a highlight span -- e.g. searching for "Guard" correctly skips
 * over "Vanguard" and finds the real, separate "Guard" mention
 * elsewhere in the text, rather than a plain substring search locking
 * onto "guard" embedded inside "Vanguard". */
export function markSynergyKeyword(text: string | null, keyword: string | null): ReactNode {
  if (!text) return null;
  if (!keyword) return text;
  const span = findKeywordSpan(text, keyword);
  if (!span) return text;
  const { start, end } = span;
  return <>{text.slice(0, start)}{mark(text.slice(start, end))}{text.slice(end)}</>;
}

/** Wraps every case-insensitive occurrence of `keyword` within `text` in
 * a highlight span, for the table view's "highlight the word that was
 * searched" requirement. Returns the plain text unchanged if there's no
 * keyword to highlight (manually-authored techniques, or branch-matched
 * entries where a keyword was never the reason for the match). */
function markKeyword(text: string | null, keyword: string | null, keywordEnd: string | null): ReactNode {
  if (!text) return null;
  if (!keyword) return text;
  // The pair the rule matched, in one clause (lib/techniques/clauses.ts matchSpan): the
  // first "recover" in a text can be "recovery effects" two clauses before the real one.
  const span = matchSpan(text, keyword, keywordEnd);
  if (!span) return text;
  let [start, end] = span;
  // Expand outward to the full word boundaries around the span, so a
  // keyword that's a substring of a longer word (e.g. "restore" inside
  // "restores") highlights the whole word, not just the matched part.
  while (start > 0 && /\w/.test(text[start - 1])) start--;
  while (end < text.length && /\w/.test(text[end])) end++;
  return <>{text.slice(0, start)}{mark(text.slice(start, end))}{text.slice(end)}</>;
}

/** For statPattern matches (DEF/RES/ATK/ASPD/Movement Speed/Hit Rate
 * Down): highlights matchedKeyword and matchedKeywordEnd as two
 * INDEPENDENT spans, not one continuous range -- the words between
 * them (e.g. "of enemies around the Curse Doll by") are never meant
 * to highlight, unlike Self-Sustain's full-span mode.
 *
 * Finds every occurrence of both keyword and keywordEnd, then picks
 * the CLOSEST pair -- not just the first occurrence of each
 * independently, which would wrongly grab an unrelated earlier
 * occurrence when the stat word appears multiple times in the same
 * text (e.g. Thumpy has "DEF +135%" early and the genuine "DEF...-30"
 * much later; naive indexOf finds the first "DEF", which isn't the
 * one detection actually matched). Also naturally handles the
 * reversed "-30% RES" order, since it doesn't assume keyword always
 * comes before keywordEnd. */
function markTwoSeparately(text: string | null, keyword: string | null, keywordEnd: string | null): ReactNode {
  if (!text) return null;
  if (!keyword) return text;
  // Case-sensitive on purpose: keyword/keywordEnd are exact-case
  // extracts from this very same text (guaranteed by per-level
  // detection), so searching case-sensitively finds the genuine match
  // instead of an earlier unrelated lowercase substring -- e.g. "def"
  // inside "defined" would otherwise be found first and wrongly
  // highlighted ahead of the real "DEF -35%" later in the sentence.
  function allIndices(needle: string): number[] {
    const out: number[] = [];
    let i = -1;
    while ((i = text!.indexOf(needle, i + 1)) !== -1) out.push(i);
    return out;
  }

  const kwPositions = allIndices(keyword);
  if (kwPositions.length === 0) return text;

  function expandWord(start: number, length: number): [number, number] {
    let s = start;
    let e = start + length;
    while (s > 0 && /\w/.test(text![s - 1])) s--;
    while (e < text!.length && /\w/.test(text![e])) e++;
    return [s, e];
  }

  const endPositions = keywordEnd ? allIndices(keywordEnd) : [];
  let best: { kp: number; ep: number; gap: number } | null = null;
  for (const kp of kwPositions) {
    for (const ep of endPositions) {
      const gap = Math.abs(ep - kp);
      if (!best || gap < best.gap) best = { kp, ep, gap };
    }
  }
  if (!keywordEnd || !best) {
    const [s, e] = expandWord(kwPositions[0], keyword.length);
    return <>{text.slice(0, s)}{mark(text.slice(s, e))}{text.slice(e)}</>;
  }

  const [kwStart, kwEnd] = expandWord(best.kp, keyword.length);
  const numStart = best.ep;
  const numEnd = best.ep + keywordEnd.length; // numbers already have a natural boundary at the leading "-", no word-expansion needed

  if (kwStart < numStart) {
    return <>{text.slice(0, kwStart)}{mark(text.slice(kwStart, kwEnd))}{text.slice(kwEnd, numStart)}{mark(text.slice(numStart, numEnd))}{text.slice(numEnd)}</>;
  }
  return <>{text.slice(0, numStart)}{mark(text.slice(numStart, numEnd))}{text.slice(numEnd, kwStart)}{mark(text.slice(kwStart, kwEnd))}{text.slice(kwEnd)}</>;
}

/** A technique badge's source text with the words it was found by picked out. */
export function markTechnique(badge: { sourceText: string | null; matchedKeyword: string | null; matchedKeywordEnd: string | null; highlightSeparately: boolean }): ReactNode {
  return badge.highlightSeparately
    ? markTwoSeparately(badge.sourceText, badge.matchedKeyword, badge.matchedKeywordEnd)
    : markKeyword(badge.sourceText, badge.matchedKeyword, badge.matchedKeywordEnd);
}
