/**
 * The other name an operator goes by.
 *
 * Alters are the problem. Most are named after the operator they came from -- "Texas
 * the Omertosa", "Nearl the Radiant Knight" -- so a plain substring search finds them
 * once it is asked the right way round. Several are not: Phantom's alter is Tragodia,
 * W's is Wiš'adel, Siege's is Vina Victoria. Nothing about those strings connects them
 * to the operator a reader is thinking of, so typing "phantom" found nothing.
 *
 * The records already know. Every base operator carries an `alternate` field naming its
 * alter, 37 of them, and this reads it rather than restating it. Two quirks in the
 * field, both handled: a `[CN]` prefix on alters global has not shipped, and a
 * comma-separated pair for Ch'en, who has two.
 *
 * Bidirectional on purpose. Typing "phantom" should find Tragodia, and typing
 * "tragodia" should find Phantom -- somebody who knows one name and not the other is
 * exactly the person this is for.
 */

export type AliasMap = Record<string, string[]>;

/** Strips the `[CN]` marker the field uses for alters global does not have yet. */
function cleanAlterName(raw: string): string {
  return raw.replace(/^\[CN\]\s*/, '').trim();
}

type AlterSource = { name: string; alternate?: string | null; aliases?: string[] | null };

/** The base followed by its alters in catalogue order. Former names resolve to
 * the current record, and a link to an unknown record fails the build. */
export function operatorAlterFamilies<T extends AlterSource>(operators: readonly T[]): T[][] {
  const known = new Map(operators.map(op => [op.name, op]));
  const formerly = new Map(operators.flatMap(op => (op.aliases ?? []).filter(alias => !known.has(alias)).map(alias => [alias, op] as const)));
  const families: T[][] = [];
  const unresolved: string[] = [];
  for (const op of operators) {
    if (!op.alternate) continue;
    const family = new Set<T>([op]);
    for (const part of op.alternate.split(',')) {
      const named = cleanAlterName(part);
      if (!named) continue;
      const alter = known.get(named) ?? formerly.get(named);
      if (!alter) { unresolved.push(`${op.name} -> ${named}`); continue; }
      family.add(alter);
    }
    if (family.size > 1) families.push([...family]);
  }
  if (unresolved.length) {
    throw new Error(
      `operatorAliases: ${unresolved.length} alternate name(s) match no operator record: ` +
      `${unresolved.join(', ')}. Fix the \`alternate\` field, or the record's name.`,
    );
  }
  return families;
}

export function buildAliasMap(operators: readonly AlterSource[]): AliasMap {
  const map: AliasMap = {};
  const add = (name: string, alias: string) => {
    const list = map[name] ??= [];
    if (!list.includes(alias)) list.push(alias);
  };
  for (const [base, ...alters] of operatorAlterFamilies(operators)) {
    for (const alter of alters) {
      add(base.name, alter.name);
      add(alter.name, base.name);
    }
  }
  return map;
}
