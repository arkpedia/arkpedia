import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blocks } from './audit-motion.mjs';

/** Commas inside :is(), attributes or quoted values do not separate selectors. */
function splitOutside(text, separator) {
  const out = [];
  let start = 0, depth = 0, quote = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) { if (ch === quote && text[i - 1] !== '\\') quote = ''; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    else if (ch === separator && depth === 0) { out.push(text.slice(start, i).trim()); start = i + 1; }
  }
  out.push(text.slice(start).trim());
  return out;
}

function declarations(body) {
  return splitOutside(body, ';').filter((text) => text.includes(':')).map((text) => {
    const colon = text.indexOf(':');
    const property = text.slice(0, colon).trim();
    const value = text.slice(colon + 1).trim();
    return { property: property.startsWith('--') ? property : property.toLowerCase(), value,
      important: /!\s*important\s*$/i.test(value) };
  });
}

/** Prove only exact-selector/property losses to a later unconditional rule.
 * Different specificity, shorthand/longhand overlap, layers, supports queries and
 * CSS modules are deliberately outside this check. A media query adds no specificity.
 * Sheets are supplied in the application's actual import order.
 */
export function deadResponsiveOverrides(sheets) {
  const rules = sheets.flatMap(({ file, css }) => blocks(css)
    .filter((b) => b.kind === 'rule')
    .flatMap((b, ruleIndex) => splitOutside(b.prelude, ',').map((selector) => ({
      file, selector, ruleIndex, stack: b.stack, declarations: declarations(b.body),
    }))));
  const later = new Map();
  const found = [];
  for (const rule of rules.reverse()) {
    const responsive = rule.stack.length > 0 && rule.stack.every((s) => s.startsWith('@media '));
    for (const declaration of rule.declarations) {
      const key = `${rule.selector}\0${declaration.property}`;
      const winner = later.get(key);
      // A normal later declaration cannot override an earlier !important one.
      if (responsive && winner && (!declaration.important || winner.important)) {
        found.push({ file: rule.file, selector: rule.selector, ruleIndex: rule.ruleIndex, property: declaration.property,
          value: declaration.value, media: rule.stack.join(' / '), winner: winner.file });
      }
    }
    if (rule.stack.length === 0) for (const declaration of [...rule.declarations].reverse()) {
      const key = `${rule.selector}\0${declaration.property}`;
      const winner = later.get(key);
      if (!winner || (declaration.important && !winner.important)) later.set(key, { ...declaration, file: rule.file });
    }
  }
  return found.reverse();
}

export function collectDeadResponsiveOverrides(root) {
  const app = readFileSync(join(root, 'pages/_app.tsx'), 'utf8');
  const files = [...app.matchAll(/import\s+['"]@\/(styles\/[^'"]+\.css)['"]/g)].map((m) => m[1]);
  return deadResponsiveOverrides(files.map((file) => ({ file, css: readFileSync(join(root, file), 'utf8') })))
    .map((f) => `${f.file}: ${f.media}: ${f.selector} { ${f.property}: ${f.value} } overridden by ${f.winner}`);
}
