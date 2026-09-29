/* The size in a CSS `font:` shorthand, for audit-styles.mjs's fontSizes key. */

/** The px size in a `font:` shorthand value, or null. Tokens before the size are style,
 *  variant, weight and stretch keywords or a numeric weight; the size is the first token
 *  that is a px length (optionally `/line-height`), and the family follows it. */
export function fontShorthandPx(value) {
  for (const token of value.trim().split(/\s+/)) {
    const hit = token.match(/^([0-9.]+)px(?:\/\S+)?$/);
    if (hit) return Number(hit[1]);
    if (/[,'"(]/.test(token)) return null; // the family started: no px size before it
  }
  return null;
}
