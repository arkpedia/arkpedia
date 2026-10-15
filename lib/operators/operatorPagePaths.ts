type NamedOperator = { name: string; aliases?: readonly string[] };
const folded = (name: string) => name.normalize('NFC').toLowerCase();

/** A case-only alias uses its operator's page at runtime. Writing both filenames
 * fails on case-insensitive disks. Keep duplicates across different operators so
 * the exporter's duplicate-file guard still refuses conflicting records. */
export function operatorPageNames(operators: readonly NamedOperator[]): string[] {
  return operators.flatMap(operator => {
    const seen = new Set<string>();
    return [operator.name, ...(operator.aliases ?? [])].filter(name => {
      const key = folded(name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
}

function routeName(route: string): string | null {
  if (!route.startsWith('/operators/')) return null;
  const tail = route.slice('/operators/'.length);
  if (!tail || tail.includes('/')) return null;
  try { return decodeURIComponent(tail); } catch { return null; }
}

/** Exact manifest entries win. A missing case-only alias may use a single
 * matching operator page; its payload must still explicitly name that alias. */
export function operatorPageRoute(pages: Record<string, unknown>, route: string): string | null {
  if (Object.hasOwn(pages, route)) return route;
  const name = routeName(route);
  if (name === null) return null;
  const matches = Object.keys(pages).filter(key => {
    const candidate = routeName(key);
    return candidate !== null && folded(candidate) === folded(name);
  });
  return matches.length === 1 ? matches[0] : null;
}

export function operatorPageAcceptsName(props: Record<string, unknown>, route: string): boolean {
  const name = routeName(route);
  const operator = props.operator as { name?: unknown; aliases?: unknown } | undefined;
  return name !== null && !!operator && (operator.name === name
    || (Array.isArray(operator.aliases) && operator.aliases.includes(name)));
}
