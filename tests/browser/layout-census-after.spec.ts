import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { boundsRoutes, stackBaseline, stackDir } from './layout-checks';

/*
 * What needs every page of the layout census (layout-census.spec.ts) at both widths. The
 * two widths are two projects, desktop and mobile, whose pages run in any worker in any
 * order, so this is a project of its own that runs after both (playwright.config.ts,
 * `after-census`), and reads what the census wrote.
 *
 * From page-bounds.spec.ts: an accepted stack-align inset (stack-align-baseline.json) that no
 * page shows any more, at either width, is stale. Each page bounds run of the census wrote the
 * insets it saw (layout-checks.ts, stackDir); an entry marked `optional` shows only on some
 * days and is left alone. It runs only once every page was measured at both widths, so a run
 * filtered to some pages or one project skips it rather than calling everything stale.
 */
test('every accepted stack-align inset is still on a page (stack-align-baseline.json)', ({}, info) => {
  const pages = boundsRoutes().length;
  const dir = stackDir(info);
  const runs: { width: number; seen: string[] }[] = fs.existsSync(dir) ? fs.readdirSync(dir).map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))) : [];
  const at1440 = runs.filter((r) => r.width === 1440).length;
  const at390 = runs.filter((r) => r.width === 390).length;
  test.skip(at1440 < pages || at390 < pages, `only after every page was measured at both widths (${at1440} and ${at390} of ${pages})`);
  const stackSeen = new Set(runs.flatMap((r) => r.seen));
  const stale = stackBaseline.accepted.filter((a) => !a.optional).map((a) => `${a.parent} > ${a.child}`).filter((key) => !stackSeen.has(key));
  expect(stale, 'accepted card insets no page shows any more: remove them from stack-align-baseline.json').toEqual([]);
});
