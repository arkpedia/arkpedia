import { expect, test } from '@playwright/test';
import { readOnly } from './census-routes';

test.use({ storageState: { cookies: [], origins: [] } });

for (const theme of ['dark', 'light']) {
  test(`first-visit statistics prompt remembers either choice without enabling media (${theme})`, async ({page}, info) => {
    await readOnly(page);
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.goto('/about');
    const prompt = page.getByRole('region', {name:'Usage statistics choice', exact:true});
    await expect(prompt).toBeVisible();
    const allow = prompt.getByRole('button', {name:'Allow statistics', exact:true});
    const refuse = prompt.getByRole('button', {name:'No thanks', exact:true});
    const a = await allow.boundingBox(), b = await refuse.boundingBox();
    expect(Math.abs(a!.width - b!.width)).toBeLessThan(1);
    expect(await page.evaluate(() => localStorage.getItem('arkpedia:privacy:v1'))).toBeNull();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/statistics-prompt-${theme}-${info.project.name}.png`});
    await refuse.click(); await expect(prompt).not.toBeVisible();
    await page.reload(); await expect(prompt).not.toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpedia:privacy:v1')!))).toMatchObject({analytics:false,externalMedia:false});
    await page.evaluate(() => localStorage.removeItem('arkpedia:privacy:v1'));
    await page.reload(); await expect(prompt).toBeVisible();
    await allow.click(); await expect(prompt).not.toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpedia:privacy:v1')!))).toMatchObject({analytics:true,externalMedia:false});
    await page.reload(); await expect(prompt).not.toBeVisible();
    await page.goto('/cookies');
    await expect(page.getByRole('checkbox', {name:'Allow usage statistics', exact:true})).toBeChecked();
    await page.getByRole('button', {name:'Use necessary only', exact:true}).click();
    await page.goto('/about'); await expect(prompt).not.toBeVisible();
  });
}
