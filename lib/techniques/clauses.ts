/* The clause, the unit the technique rules read: a phrase that means one thing does not span
   two sentences. Shared by the rules (autoTechniques.ts), the direction step that reads who
   an effect lands on (techniqueDirection.ts) and the records' short form (techniqueExcerpt.ts). */

/* A clause break is ';' or a full stop that is not a decimal point. The digit guard is
   not optional: Gladiia's talent reads "recover 2.5% of Max HP per second", and without
   it the '.' in 2.5 ends the clause between "recover" and "Max HP", taking her
   Self-Sustain with it -- along with Thorns's "restores 4% (+0.5%) max HP", SilverAsh
   the Reignfrost's and Yu's. Four real matches for five false ones is not a fix. The
   same care the stat patterns already take with a minus sign attached to a digit. */
export const CLAUSE_BREAK = /[;]|(?<![0-9])\.(?![0-9])/;

/** Every clause of a text that holds `word` (and `wordEnd`, when given), in order. Case is
 *  ignored unless `exactCase` (the stat patterns' ATK/DEF/RES/ASPD are matched as written). */
export function clausesWith(text: string, word: string, wordEnd: string | null = null, exactCase = false): string[] {
  const norm = (s: string) => (exactCase ? s : s.toLowerCase());
  const w = norm(word);
  const e = wordEnd ? norm(wordEnd) : null;
  return text.split(new RegExp(CLAUSE_BREAK.source, 'g'))
    .map((clause) => clause.trim())
    .filter((clause) => clause && norm(clause).includes(w) && (!e || norm(clause).includes(e)));
}

/** Where a match's words sit, as the rule found them: a pair (keyword, then keywordEnd) is the
 *  closest word-bounded pair in one clause -- "allies within the area recover HP", not the
 *  "recovery" two clauses earlier -- and a single keyword its first occurrence, as the keyword
 *  rules search. Null when the words are not in the text. */
export function matchSpan(text: string, keyword: string, keywordEnd: string | null): [number, number] | null {
  const lower = text.toLowerCase();
  if (keywordEnd) {
    const positions = (word: string) => {
      const out: number[] = [];
      const re = new RegExp(`\\b${word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      for (let m = re.exec(lower); m; m = re.exec(lower)) out.push(m.index);
      return out;
    };
    let best: [number, number] | null = null;
    for (const s of positions(keyword)) {
      for (const e of positions(keywordEnd)) {
        if (e < s || CLAUSE_BREAK.test(text.slice(s, e))) continue;
        if (!best || e + keywordEnd.length - s < best[1] - best[0]) best = [s, e + keywordEnd.length];
      }
    }
    if (best) return best;
  }
  // A whole word first ("SP", not the "sp" in "splash"), then any occurrence, as the keyword
  // rules match "Slowed" for "slow".
  const word = new RegExp(`\\b${keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).exec(lower);
  const at = word ? word.index : lower.indexOf(keyword.toLowerCase());
  if (at < 0) return null;
  if (!keywordEnd) return [at, at + keyword.length];
  const endAt = lower.indexOf(keywordEnd.toLowerCase());
  return endAt < 0 ? [at, at + keyword.length] : [Math.min(at, endAt), Math.max(at + keyword.length, endAt + keywordEnd.length)];
}
