import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/*
 * A help panel on /pulls can offer "Find these controls" links, each a selector the panel
 * scrolls to (components/pulls/SectionHelp.tsx). Operator goals pointed at
 * `.pulls-plan-controls`, which no component renders any more, so its "pull budget" link
 * went nowhere. Every link's target must be something /pulls renders.
 */
// The skin section is the Skin Planner's component (components/skins/SkinPlanner), rendered here too.
const files = [...fs.readdirSync('components/pulls').map((name) => path.join('components/pulls', name)), 'pages/pulls.tsx', 'components/skins/SkinPlanner.tsx']
  .filter((file) => file.endsWith('.tsx'));
const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const classNames = new Set([...source.matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\}|\{'([^']+)'\})/g)]
  .flatMap((m) => (m[1] ?? m[2] ?? m[3]).replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)).filter(Boolean));
const labels = [...source.matchAll(/aria-label=\{`([^`$]+)\$\{/g)].map((m) => m[1]);

test('every help link on /pulls targets something the page renders', () => {
  // A link to one banner's own input names it by label: `input[aria-label=${JSON.stringify(`Pull budget for ${…}`)}]`.
  const byLabel = [...source.matchAll(/selector:\s*`input\[aria-label=\$\{JSON\.stringify\(`([^`$]+)/g)].map((m) => m[1]);
  const byClass = [...source.matchAll(/selector:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(byLabel.length + byClass.length >= 3, `found the help links (${byLabel.length + byClass.length})`);
  for (const label of byLabel) assert.ok(labels.includes(label), `an input labelled "${label}…" is rendered`);
  for (const selector of byClass) {
    for (const cls of selector.match(/\.[\w-]+/g) ?? []) {
      assert.ok(classNames.has(cls.slice(1)), `${selector}: .${cls.slice(1)} is rendered by a /pulls component`);
    }
  }
});
