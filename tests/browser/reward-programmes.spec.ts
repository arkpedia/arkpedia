import { expect, test } from '@playwright/test';
import { accountFromGame } from '../../lib/account/accountStore';
import catalogue from '../../data/free-rewards.json';
import { readOnly } from './census-routes';

test('an older account sees its received beginner reward, then switches programmes without losing manual marks', async ({ page }) => {
  await readOnly(page);
  const current = catalogue.rewards.find(row => /:chainLoginData:7$/.test(row.id))!;
  const currentId = current.id.split(':')[1];
  const programs = [{ id: 'older_fixture', startTs: 100, endTs: 199 }, { id: currentId, startTs: 200, endTs: 999 }];
  const map = { version: 1 as const, chars: {}, beginnerPrograms: programs };
  const record = (registerTs: number, uid: string, at: string) => accountFromGame({ status: { registerTs, uid },
    openServer: { chainLogin: { history: [0, 0, 0, 0, 0, 0, 0] } } }, map, 'en', new Date(at));
  const old = { ...current, id: 'free:older_fixture:chainLoginData:7',
    rewards: [{ id: 'char_173_slchan', name: 'Cliffheart', count: 1 }],
    beginner: { ...programs[0], current: false } };
  // Keep the real page's initial currency totals and SSR markup; add a synthetic
  // historical programme and annotate the current sign-in rows in its payload.
  await page.route("**/reward-tracker", async route => {
    const response = await route.fetch(); const html = await response.text();
    const match = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html)!;
    const data = JSON.parse(match[1]); const props = data.props.pageProps;
    const tag = (rows: { id: string }[]) => rows.map(row => /:(?:chainLoginData|checkInData):|^free:openserver_/.test(row.id)
      ? { ...row, beginner: { ...programs[1], current: true } } : row);
    // The data carries a real older programme too (openseverTaskGroup1); this test brings its
    // own, so the real one is left out and only the fixture's two programmes are in play.
    const currentOnly = (rows: { id: string; beginner?: { current: boolean } }[]) => rows.filter(row => !row.beginner || row.beginner.current);
    props.freeRewards = [...tag(currentOnly(props.freeRewards)), old];
    props.backlogSources.freeRewards = tag(currentOnly(props.backlogSources.freeRewards));
    props.backlogSources.beginnerRewards = [old];
    await route.fulfill({ response, body: html.replace(match[1], JSON.stringify(data).replace(/</g, '\\u003c')) });
  });
  const first = record(150, 'older', '2026-10-16T00:00:00Z');
  await page.addInitScript(first => {
    if (sessionStorage.getItem('programme-fixture')) return;
    sessionStorage.setItem('programme-fixture', '1');
    localStorage.setItem('arkpediaAccount', JSON.stringify(first));
    localStorage.setItem('arkpedia.past-rewards.v1', JSON.stringify({ doneKeys: ['free:GP_freeL_10'], doneEvents: [], annihilationDone: false, ticksFrom: '' }));
  }, first);
  const open = async () => {
    await page.getByRole('tab', { name: 'Free rewards', exact: true }).click();
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search free rewards', exact: true }).fill('Consecutive sign-in');
    await expect(page.locator('details[open] > summary')).toContainText('Beginner rewards');
  };
  await page.goto("/reward-tracker"); await open();
  const day = page.getByRole('checkbox', { name: current.name, exact: true });
  await expect(day).toHaveCount(1); await expect(day).toBeChecked();
  await expect(page.locator('.free-reward-row').filter({ has: day })).toContainText('Cliffheart');
  const next = record(250, 'newer', '2026-10-17T00:00:00Z');
  await page.evaluate(next => { localStorage.setItem('arkpediaAccount', JSON.stringify(next)); window.dispatchEvent(new Event('arkpediaAccountChanged')); }, next);
  await expect(day).toHaveCount(1); await expect(day).toBeChecked();
  await expect(page.locator('.free-reward-row').filter({ has: day })).not.toContainText('Cliffheart');
  await page.reload(); await open(); await expect(day).toBeChecked();
  const keys = await page.evaluate(() => JSON.parse(localStorage.getItem('arkpedia.past-rewards.v1')!).doneKeys);
  expect(keys).toContain('free:GP_freeL_10'); expect(keys).toContain(current.id);
  expect(keys).not.toContain(old.id);
});
