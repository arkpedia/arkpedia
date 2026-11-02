import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light']) test(`headhunting pools work below six stars and retain combined filters (${theme})`, async ({ page }, info) => {
  await page.addInitScript(theme => { localStorage.clear(); localStorage.setItem('theme', theme); localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({version:1,analytics:false,externalMedia:false,externalMediaChosen:true,savedAt:Date.now()})); }, theme);
  for (const [rarity, method, name] of [['5','kernel','Lappland'], ['5','standard','Bassline'], ['4','standard','Myrtle'], ['3','kernel','Kroos']]) {
    await page.goto(`/operators?rarity=${rarity}&obtain=${method}&q=${name}`);
    await expect(page.locator('.roster-card').filter({hasText:name})).toBeVisible();
    await expect(page.locator('.roster-card')).toHaveCount(1);
  }
  await page.goto('/operators?rarity=5&obtain=kernel');
  const mobile = info.project.name === 'mobile';
  if (mobile) await page.getByRole('button',{name:/^Filters/}).click();
  const scope = mobile ? page.getByRole('dialog',{name:'Filters',exact:true}) : page;
  await scope.getByRole('button',{name:'4-star',exact:true}).click();
  await expect(scope.getByRole('button',{name:'5-star',exact:true})).toHaveAttribute('aria-pressed','true');
  await scope.getByRole('button',{name:'Filter by how obtained',exact:true}).click();
  const menu = page.getByRole('dialog',{name:'Filter by how obtained',exact:true});
  await menu.getByRole('checkbox',{name:'Standard headhunting',exact:true}).check();
  await expect(menu.getByRole('checkbox',{name:'Kernel headhunting',exact:true})).toBeChecked();
  await page.keyboard.press('Escape');
  if(mobile) await scope.getByRole('button',{name:'Done',exact:true}).click();
  await expect.poll(()=>new URL(page.url()).searchParams.get('rarity')).toBe('5,4');
  await expect.poll(()=>new URL(page.url()).searchParams.get('obtain')).toBe('kernel,standard');
  await page.getByRole('searchbox',{name:/Search operators/}).fill('Myrtle');
  await expect(page.locator('.roster-card').filter({hasText:'Myrtle'})).toBeVisible();
  if(process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({animations:'disabled',path:`${process.env.ARKPEDIA_QA_CAPTURE}/${info.project.name}-${theme}.png`});
  await expect.poll(()=>new URL(page.url()).searchParams.get('q')).toBe('Myrtle');
  await page.reload();
  await expect(page.locator('.roster-card').filter({hasText:'Myrtle'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
