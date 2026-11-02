import { expect, test } from '@playwright/test';
import { readOnly } from './census-routes';
import { stubYouTube, youtube } from './youtube-stub';
test.use({ storageState: { cookies: [], origins: [] } });
for (const theme of ['dark', 'light']) {
  test(`privacy choices persist, can be withdrawn, and About/project links are available (${theme})`, async ({page}, info) => {
    await readOnly(page); await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.goto('/cookies');
    const analytics = page.getByRole('checkbox', {name:'Allow usage statistics', exact:true});
    const media = page.getByRole('checkbox', {name:'Allow external media', exact:true});
    await expect(analytics).not.toBeChecked(); await expect(media).not.toBeChecked();
    await expect(page.locator('strong').filter({hasText:'arkpedia.session_token'})).toBeVisible();
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/privacy-choices-${theme}-${info.project.name}.png`});
    await analytics.check(); await page.getByRole('button', {name:'Save privacy choices', exact:true}).click();
    await expect(analytics).toBeChecked(); await expect(media).not.toBeChecked();
    await media.check(); await page.getByLabel('Background Music', {exact:true}).check();
    await page.getByRole('button', {name:'Save privacy choices', exact:true}).click();
    await expect(media).toBeChecked(); await expect(page.getByLabel('Background Music', {exact:true})).toBeChecked();
    await expect(page.getByLabel('Event Music', {exact:true})).not.toBeChecked();
    await page.getByLabel('Event Music', {exact:true}).check();
    await page.getByRole('button', {name:'Save privacy choices', exact:true}).click();
    await expect(page.getByLabel('Event Music', {exact:true})).toBeChecked();
    await page.getByRole('button', {name:'Use necessary only', exact:true}).click();
    await expect(analytics).not.toBeChecked(); await expect(media).not.toBeChecked();
    await expect(page.getByLabel('Background Music', {exact:true})).not.toBeChecked();
    await expect(page.getByLabel('Event Music', {exact:true})).not.toBeChecked();
    await page.goto('/privacy'); await expect(page.getByRole('link', {name:'jungermin@arkpedia.net', exact:true})).toHaveAttribute('href', 'mailto:jungermin@arkpedia.net');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/privacy-notice-${theme}-${info.project.name}.png`});
    await page.goto('/about'); await expect(page.getByText('Arkpedia was founded by Kukkikaze.', {exact:false})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/about-${theme}-${info.project.name}.png`});
    await page.goto('/community/projects');
    await expect(page.locator('a.primary').filter({hasText:'Play Stronghold Protocol'})).toHaveAttribute('href', 'https://stronghold-en.dev/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
for (const theme of ['dark', 'light']) {
test(`YouTube loads only after external media permission and stays off after withdrawal (${theme})`, async ({page}, info) => {
  await stubYouTube(page, 'allow', {mediaConsent:false});
  await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
  await page.goto('/cookies');
  await page.goto('/music');
  await expect(page.getByRole('dialog', {name:'Allow external media?', exact:true})).not.toBeVisible();
  expect(await youtube(page)).toBeNull();
  await page.goto('/operators/Thorns');
  await page.getByRole('button', {name:'Play EP', exact:true}).click();
  const prompt = page.getByRole('dialog', {name:'Allow external media?', exact:true});
  await expect(prompt).toBeVisible(); expect(await youtube(page)).toBeNull();
  const privacyLink = prompt.getByRole('link', {name:'Privacy choices', exact:true});
  const teal = await page.evaluate(() => { const probe = document.createElement('span'); probe.style.color = 'var(--teal)'; document.body.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color; });
  await expect(privacyLink).toHaveCSS('color', teal);
  if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/media-permission-${theme}-${info.project.name}.png`});
  await prompt.getByRole('button', {name:'No thanks', exact:true}).click();
  expect(await youtube(page)).toBeNull();
  await page.getByRole('button', {name:'Play EP', exact:true}).click();
  await prompt.getByRole('button', {name:'Allow external media', exact:true}).click();
  await expect.poll(async () => (await youtube(page))?.players).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpedia:privacy:v1')!))).toMatchObject({analytics:false,analyticsChosen:false,externalMedia:true});
  await page.goto('/cookies'); await page.getByRole('button', {name:'Use necessary only', exact:true}).click();
  await expect(page.getByRole('checkbox', {name:'Allow external media', exact:true})).not.toBeChecked();
  expect(await youtube(page)).toBeNull();
});
}
