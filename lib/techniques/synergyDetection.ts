export const SYNERGY_CLASS_NAMES = ['Caster', 'Defender', 'Guard', 'Medic', 'Sniper', 'Specialist', 'Supporter', 'Vanguard'];

/** Finds where `keyword` genuinely appears in `text` as a whole word,
 * with optional trailing "s" for plurals -- word-boundary aware, so
 * searching for "Guard" correctly skips over "Vanguard" (no boundary
 * between "Van" and "guard") and finds the real, separate "Guard"
 * elsewhere in the same text, rather than a plain substring search
 * locking onto the first coincidental occurrence of the same letters.
 * Also matches "Guards" when searching "Guard", since detection itself
 * is plural-tolerant and the exact keyword may not appear unpluralized
 * anywhere in the text. Returns the actual matched span (which may be
 * one character longer than `keyword` if the plural form matched) so
 * callers can highlight exactly what's really there, not just
 * `keyword`'s own length. */
export function findKeywordSpan(text: string, keyword: string): { start: number; end: number } | null {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Same reasoning as buildSynergyPattern below: if keyword itself
  // already ends in a plain "s" (most faction names do), also allow
  // matching its singular form -- otherwise trying to highlight the
  // canonical plural name ("Abyssal Hunters") within text that
  // genuinely said the singular ("Abyssal Hunter") would silently find
  // nothing to highlight, even though findSynergyMatches itself now
  // correctly detects that mention.
  const pattern = /s$/i.test(keyword)
    ? new RegExp(`\\b${escaped.slice(0, -1)}s?\\b`, 'i')
    : new RegExp(`\\b${escaped}s?\\b`, 'i');
  const m = text.match(pattern);
  if (!m || m.index === undefined) return null;
  return { start: m.index, end: m.index + m[0].length };
}

/** Faction name -> its demonym/race-adjective form -- skills often say
 * "all Iberian Operators" rather than "all Iberia Operators", so the
 * demonym needs to be checked as an additional search term alongside
 * the faction's own name. */
export const FACTION_DEMONYMS: Record<string, string> = {
  Minos: 'Minoan',
  Kazimierz: 'Kazimierian',
  Siracusa: 'Siracusan',
  Sargon: 'Sargonian',
  Leithanien: 'Leithanian',
  Yan: 'Yanese',
  Columbia: 'Columbian',
  Iberia: 'Iberian',
};

/** groupKey (e.g. "class-Guard" or "faction-Rhodes Island") -> operator
 * names excluded from that SPECIFIC check, even though their own
 * skill/talent text technically contains the name -- confirmed cases
 * where the mention isn't a genuine buff:
 *   - SilverAsh the Reignfrost's skill lists "Guard/Caster/Sniper" only
 *     as a DP-swap targeting priority, not a buff to those classes.
 *   - Terra Research Commission's talent says "Rhodes Island Recon's
 *     ATK", which is the OPERATOR'S OWN NAME (it happens to contain
 *     "Rhodes Island"), not a mention of the Rhodes Island faction.
 *   - Rhodes Island Recon is that same operator being referenced --
 *     their own name likewise contains "Rhodes Island" as a substring,
 *     so without this exclusion their own kit text would also
 *     self-match into the Rhodes Island faction synergy purely by
 *     virtue of their own name, not a genuine faction-buff mention. */
export const SYNERGY_EXCLUSIONS: Record<string, string[]> = {
  'class-Guard': ['SilverAsh the Reignfrost'],
  'class-Caster': ['SilverAsh the Reignfrost'],
  'class-Sniper': ['SilverAsh the Reignfrost'],
  'faction-Rhodes Island': ['Terra Research Commission', 'Rhodes Island Recon'],
};

/** Word-boundary pattern for a search term, with a negative lookahead
 * for a trailing "'s" -- rejects e.g. "Sui" matching inside "Sui's
 * Garden of Grotesqueries" (an unrelated proper noun that just happens
 * to start the same way), while still matching genuine standalone/
 * bracketed mentions like "[Sui] Operators". allowPlural adds an
 * optional trailing "s" -- classes need this ("all Supporters"), since
 * skills almost always phrase the buff target in plural.
 *
 * Separately: if `term` ITSELF already ends in a plain "s" (true of
 * most faction names, which tend to be plural nouns -- "Abyssal
 * Hunters", "Rhine Lab" being an exception that doesn't), that trailing
 * "s" is made optional too, so the pattern also matches the singular
 * form. This matters because skill text sometimes phrases the buff
 * target in singular ("an Abyssal Hunter Operator") even though the
 * faction's own stored name is plural -- without this, only the exact
 * plural string would ever match, silently missing every singular
 * mention. This applies regardless of allowPlural, since it's about
 * the term's own existing plurality, not whether the caller wants
 * pluralization added on top. */
export function buildSynergyPattern(term: string, allowPlural: boolean): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (/s$/i.test(term)) {
    // 's' is never a regex-special character, so slicing the escaped
    // string's last character off still correctly removes just the
    // trailing 's' regardless of what came before it.
    const singularEscaped = escaped.slice(0, -1);
    return new RegExp(`\\b${singularEscaped}s?\\b(?!'s)`, 'i');
  }
  const suffix = allowPlural ? 's?' : '';
  return new RegExp(`\\b${escaped}${suffix}\\b(?!'s)`, 'i');
}

/** Operator names that themselves contain a faction or class name -- "Vina
 * Victoria", "Rhodes Island Recon". Callers mask these occurrences, so a name
 * is not read as a faction mention: Vina Victoria's module reads "Vina Victoria
 * and her summons deal 15% more damage to Frightened targets", which names her,
 * not the Victoria faction. */
export function namesContainingSynergyTerms(
  names: string[],
  candidates: { name: string; type: 'faction' | 'class' }[],
): string[] {
  return names.filter((name) =>
    candidates.some((c) => buildSynergyPattern(c.name, c.type === 'class').test(name)),
  );
}

/** Blanks each ignored name with spaces, keeping every other index in place so
 *  brackets and their spans still line up with the caller's source text. */
function maskIgnoredNames(text: string, ignoredNames: string[]): string {
  if (!ignoredNames.length) return text;
  const alternation = [...ignoredNames]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return text.replace(new RegExp(`\\b(?:${alternation})\\b`, 'gi'), (m) => ' '.repeat(m.length));
}

/** Given one piece of text and a list of candidate faction/class
 * names, returns the ones that genuinely match -- checking each
 * faction's demonym form as an additional term, and with
 * substring-containment suppression: if both "Ursus" and "Ursus
 * Student Self-Governing Group" match the SAME text, only the longer,
 * more specific name is kept, since the shorter one is just a prefix
 * of it within that mention, not an independent reference.
 *
 * `ignoredNames` (roster names from namesContainingSynergyTerms) are blanked
 * first, so a faction spelt inside an operator's name does not count.
 *
 * matchedTerm is the exact word that appears in the text -- the
 * faction/class's own name, OR its demonym if that's what matched
 * (e.g. name: "Iberia" but matchedTerm: "Iberian") -- callers need
 * this specifically for highlighting, since searching for "Iberia"
 * would never find "Iberian" in the actual source text. */
export function findSynergyMatches(
  text: string,
  candidates: { name: string; type: 'faction' | 'class' }[],
  options: { ignoredNames?: string[] } = {},
): { name: string; type: 'faction' | 'class'; matchedTerm: string }[] {
  const searchable = maskIgnoredNames(text, options.ignoredNames ?? []);
  const raw: { name: string; type: 'faction' | 'class'; matchedTerm: string }[] = [];
  for (const c of candidates) {
    if (buildSynergyPattern(c.name, c.type === 'class').test(searchable)) {
      raw.push({ ...c, matchedTerm: c.name });
      continue;
    }
    const demonym = c.type === 'faction' ? FACTION_DEMONYMS[c.name] : null;
    if (demonym && buildSynergyPattern(demonym, true).test(searchable)) {
      raw.push({ ...c, matchedTerm: demonym });
    }
  }
  /* Two suppressions.

     By CANDIDATE: if both "Ursus" and "Ursus Student Self-Governing Group" match the
     same text, keep only the longer. This needs both to be candidates AND both to
     match, so it fails the moment the text spells the longer one differently.

     By BRACKET: Arknights writes a named group in [square brackets], and the group is
     the WHOLE bracketed phrase. So the phrase is RESOLVED against the known names, and
     what it resolves to wins inside those brackets.

     Resolving is the part that matters, and bracket LENGTH is not a substitute for it.
     A first attempt dropped any term sitting inside a longer bracket, which fixed Rosa
     and broke Dagda: her talent reads "[Glasgow Gang]" and her faction is "Glasgow" --
     the game simply writes the group's full name, "Glasgow Gang" is not a faction, and
     "Glasgow" inside it is the correct reading. That rule deleted her entire Glasgow
     synergy group. It also left Rosa crediting NOTHING, when her module genuinely buffs
     the Ursus Student Self-Governing Group.

     So: a bracket that folds to a known name means THAT name, whatever is spelt inside
     it -- which both suppresses the wrong short match and supplies the right long one.
     A bracket that folds to nothing known is left alone, and whatever matched inside it
     stands. */
  const byCandidate = raw.filter(
    (c) => !raw.some((other) => other.name !== c.name && other.name.includes(c.name)),
  );

  /* Every resolved bracket first, THEN the suppression -- a term has to be judged
     against all of them at once. Rosa's module names the group three times, so
     "Ursus" occurs in three separate brackets and no single one of them contains
     every occurrence. Checked one bracket at a time it survived them all. */
  const resolvedSpans: { start: number; end: number; name: string }[] = [];
  const out = [...byCandidate];
  for (const [start, end, inner] of bracketsOf(searchable)) {
    const resolved = resolveBracket(inner, candidates);
    if (!resolved) continue;
    resolvedSpans.push({ start, end, name: resolved.name });
    if (!out.some((c) => c.name === resolved.name)) {
      out.push({ ...resolved, matchedTerm: inner });
    }
  }
  if (!resolvedSpans.length) return out;
  return out.filter(
    (c) => resolvedSpans.some((s) => s.name === c.name)
      || !matchesOnlyInsideResolved(searchable, c.matchedTerm, resolvedSpans),
  );
}

function bracketsOf(text: string): [number, number, string][] {
  const spans: [number, number, string][] = [];
  for (const b of text.matchAll(/\[([^\]]*)\]/g)) {
    if (b.index === undefined) continue;
    spans.push([b.index, b.index + b[0].length, b[1].trim()]);
  }
  return spans;
}

/** Long enough that a spelling drift is likelier than a coincidence. "Glasgow Gang"
 *  folds to 11 and stays exact-only, which is right -- it is how the game writes the
 *  Glasgow group, not a misspelling of it. */
const FUZZY_MIN_LENGTH = 14;

/** Letters and digits only, so "Self-Governing" and "Self governing" compare equal. */
const foldName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

function editDistance(a: string, b: string): number {
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/**
 * The known name a bracketed phrase is naming, if any.
 *
 * Exact after folding first. Then a near miss, because the roster does not spell its own
 * factions consistently -- "Ursus Student Self-Governing Group" appears 27 times and
 * "Ursus Student Self-government Group" 6, for the same faction. The tolerance scales
 * with length so a long name may drift by a word ending while a short one may not:
 * "selfgoverning" against "selfgovernment" is 4 edits in 30 characters and resolves,
 * "glasgowgang" against "glasgow" is 4 in 11 and does not, which is right -- Glasgow
 * Gang is how the game writes the Glasgow group, not a misspelling of it.
 */
function resolveBracket(
  inner: string,
  candidates: { name: string; type: 'faction' | 'class' }[],
): { name: string; type: 'faction' | 'class' } | null {
  if (!inner) return null;
  const folded = foldName(inner);
  if (!folded) return null;
  for (const c of candidates) if (foldName(c.name) === folded) return c;
  /* Fuzzy matching is for LONG names only. A short phrase is within a couple of edits
     of half the roster: "[ sic ]", the editorial marker, folds to "sic" and reached
     "Sui" in two, which handed two operators a Sui synergy from text that never
     mentions Sui. Below this length the fold above must be exact. */
  if (folded.length < FUZZY_MIN_LENGTH) return null;
  const budget = Math.round(folded.length * 0.15);
  if (budget < 1) return null;
  let best: { name: string; type: 'faction' | 'class' } | null = null;
  let bestDistance = Infinity;
  for (const c of candidates) {
    const other = foldName(c.name);
    /* Only a name of comparable length can be a misspelling of this phrase. Without
       this, a short faction is always "close" to a long phrase by deletion alone. */
    if (Math.abs(other.length - folded.length) > budget) continue;
    const d = editDistance(folded, other);
    if (d <= budget && d < bestDistance) { bestDistance = d; best = c; }
  }
  return best;
}

/** True when every occurrence of `term` sits inside SOME resolved bracket -- i.e. the
 *  term only ever appears as a fragment of a phrase that names something else. */
function matchesOnlyInsideResolved(
  text: string,
  term: string,
  spans: { start: number; end: number }[],
): boolean {
  const global = new RegExp(buildSynergyPattern(term, true).source, 'gi');
  let sawOne = false;
  for (const m of text.matchAll(global)) {
    if (m.index === undefined) continue;
    sawOne = true;
    if (!spans.some((s) => m.index! > s.start && m.index! < s.end)) return false;
  }
  return sawOne;
}

export function isSynergyExcluded(groupKey: string, operatorName: string): boolean {
  return (SYNERGY_EXCLUSIONS[groupKey] || []).includes(operatorName);
}