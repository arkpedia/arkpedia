import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import { makeFriendFile } from '../../lib/account/friendFile';
import type { AccountRecord } from '../../lib/account/accountStore';
import type { Roster } from '../../lib/planner/roster';

const own: AccountRecord = { version:1,server:'en',importedAt:'2026-10-09T00:00:00Z',doctor:'My Doctor#1111',operators:['Angelina'],skins:[],cleared:[],wallet:{orundum:6000,originitePrime:30,permits:10,yellowCerts:180,monthlyCardUntil:null},profile:{level:120,registeredAt:null,secretary:null,bio:'My account'} };
const roster: Roster = {Angelina:{elite:2,level:90,skillLevel:7,masteries:{1:3,2:3},modules:{0:2},potential:6}};
const friend = makeFriendFile({...own,doctor:'Friend Doctor#2222',operators:['Angelina','Kroos'],skins:['char_291_aglina@summer#5'],wallet:undefined},{Angelina:{...roster.Angelina,level:70,masteries:{0:1,1:2,2:3}},Kroos:{elite:1,level:55,skillLevel:7,masteries:{}}},new Date('2026-10-09T00:00:00Z'));
const file = {name:'friend.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(friend))};

test.beforeEach(async ({page}) => {
  await page.addInitScript(({own,roster}) => {
    localStorage.setItem('arkpediaAccount',JSON.stringify(own));
    localStorage.setItem('plannerRoster',JSON.stringify(roster));
  }, {own,roster});
});

test('friend import, nested preview, skin collection and reload leave the own account untouched', async ({page}) => {
  await page.goto('/friends');
  // Wait for the imported own account to hydrate before firing the SSR file input.
  await expect(page.getByRole('button',{name:'Export my account',exact:true})).toBeEnabled();
  await expect(page.getByText('Shared files contain your profile, operators and skins.', {exact:false})).not.toBeVisible();
  await page.getByRole('button', {name:'Friend sharing details', exact:true}).click();
  await expect(page.getByText('Shared files contain your profile, operators and skins.', {exact:false})).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByLabel('Friend account file').setInputFiles(file);
  await expect(page.getByRole('status')).toContainText('Imported Friend Doctor#2222');
  await page.getByRole('button',{name:"Show Friend Doctor#2222's operators",exact:true}).click();
  const collection=page.getByRole('dialog',{name:'Friend Doctor#2222 · Operators',exact:true});
  await collection.getByRole('combobox',{name:'Operator rarity',exact:true}).click();
  await collection.getByRole('option',{name:'6★',exact:true}).click();
  await expect(collection.getByRole('button',{name:/^Kroos:/})).toHaveCount(0);
  await collection.getByRole('combobox',{name:'Sort operators',exact:true}).press('End');
  await expect(collection.getByRole('option',{name:'Name',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(collection).toBeVisible();
  await collection.getByRole('combobox',{name:'Sort operators',exact:true}).press('End');
  await page.keyboard.press('Enter');
  await expect(collection.getByRole('combobox',{name:'Sort operators',exact:true})).toHaveText('Name');
  await expect(collection.getByRole('img',{name:'Potential 6',exact:true})).toBeVisible();
  await expect(collection.getByRole('img',{name:'Skill 3 Mastery 3',exact:true})).toBeVisible();
  const tile=collection.getByRole('button',{name:/^Angelina: E2 Level 70/});
  await tile.click();
  await expect(page.getByRole('dialog',{name:'Angelina',exact:true})).toBeVisible();
  const preview=page.getByRole('dialog',{name:'Angelina',exact:true});
  await expect(preview.getByRole('heading',{name:/Stats E2 Lv 70/})).toBeVisible();
  await expect(preview.getByRole('tabpanel',{name:/^S1/}).getByRole('img',{name:'Mastery 1',exact:true})).toBeVisible();
  await preview.getByRole('tab',{name:/^S2/}).click();
  await expect(preview.getByRole('tabpanel',{name:/^S2/}).getByRole('img',{name:'Mastery 2',exact:true})).toBeVisible();
  await preview.getByRole('tab',{name:/^S3/}).click();
  await expect(preview.getByRole('tabpanel',{name:/^S3/}).getByRole('img',{name:'Mastery 3',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'Angelina',exact:true})).toHaveCount(0);
  await expect(collection).toBeVisible();
  await expect(tile).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(collection).toHaveCount(0);
  await expect(page.getByRole('button',{name:"Show Friend Doctor#2222's operators",exact:true})).toBeFocused();
  await page.getByRole('button',{name:"Show Friend Doctor#2222's skins",exact:true}).click();
  const skins=page.getByRole('dialog',{name:'Friend Doctor#2222 · Skins',exact:true});
  await expect(skins).toBeVisible();
  const outfit=skins.getByRole('button',{name:'Angelina Summer Flower FA017',exact:true});
  await outfit.click();
  await expect(skins.getByRole('img',{name:'Angelina — Summer Flower FA017',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(outfit).toBeFocused();
  await page.getByRole('searchbox',{name:'Search friend skins'}).fill('zz-no-match');
  await expect(page.getByText('No skins match.',{exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('arkpediaAccount')!).doctor)).toBe(own.doctor);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('plannerRoster')!))).toEqual(roster);
  await page.reload();
  await expect(page.getByText('Friend Doctor#2222',{exact:true}).last()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('export shares the own profile and build data without resources; damaged imports preserve the friend',async({page})=>{
  await page.goto('/friends');
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export my account',exact:true}).click();
  const download=await downloadPromise;
  const raw=await fs.readFile((await download.path())!,'utf8');
  const shared=JSON.parse(raw);
  expect(shared.account.doctor).toBe(own.doctor);
  expect(shared.roster.Angelina).toEqual(roster.Angelina);
  expect(shared.account.wallet).toBeUndefined();
  await page.getByLabel('Friend account file').setInputFiles(file);
  await expect(page.getByRole('status')).toContainText('Imported Friend Doctor');
  await page.getByLabel('Friend account file').setInputFiles({name:'damaged.json',mimeType:'application/json',buffer:Buffer.from('{')});
  await expect(page.getByRole('alert').filter({hasText:'That file is not valid JSON.'})).toBeVisible();
  await expect(page.getByText('Friend Doctor#2222',{exact:true}).last()).toBeVisible();
});

test('own profile opens shared operator and outfit dialogs with own server builds, never friend data', async ({page}) => {
  const account = {...own, skins: ['char_291_aglina@summer#5'], operatorBuilds: roster};
  await page.addInitScript(({account, friend}) => {
    localStorage.setItem('arkpediaAccount', JSON.stringify(account));
    localStorage.setItem('arkpediaFriend', JSON.stringify(friend));
    // The planner is intentionally different: this account's saved snapshot must win.
    localStorage.setItem('plannerRoster', JSON.stringify({Angelina:{elite:0,level:1,skillLevel:1,masteries:{}}}));
  }, {account, friend});
  await page.goto('/account');
  const operatorButton = page.getByRole('button', {name:'Show your operators', exact:true}).first();
  await operatorButton.press('Enter');
  const collection = page.getByRole('tabpanel', {name:'Operators', exact:true});
  const tile = collection.getByRole('button', {name:/^Angelina: E2 Level 90/});
  await expect(tile).toBeVisible();
  await expect(collection.getByRole('button', {name:/^Kroos:/})).toHaveCount(0);
  await tile.click();
  await expect(page.getByRole('dialog', {name:'Angelina', exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tile).toBeFocused();
  await page.getByRole('tab', {name:'Skins', exact:true}).click();
  const skins = page.getByRole('tabpanel', {name:'Skins', exact:true});
  const outfit = skins.getByRole('button', {name:'Angelina Summer Flower FA017', exact:true});
  await outfit.click();
  await expect(skins.getByRole('img', {name:'Angelina — Summer Flower FA017', exact:true})).toBeVisible();
  await skins.getByRole('button', {name:'← Skins', exact:true}).click();
  await expect(outfit).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('tab', {name:'Profile', exact:true}).click();
  await expect(page.getByRole('tab', {name:'Profile', exact:true})).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpediaAccount')!))).toEqual(account);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arkpediaFriend')!))).toEqual(friend);
});


for (const theme of ['dark', 'light']) {
test(`own Nian preview follows the account build in ${theme} theme`, async ({page}, info) => {
  const nianBuild = {elite:2,level:70,skillLevel:7,masteries:{0:3,1:3,2:3},modules:{0:2,1:2}};
  await page.addInitScript(({theme,own,nianBuild}) => {
    localStorage.setItem('theme',theme);
    localStorage.setItem('arkpediaAccount',JSON.stringify({...own,operators:['Nian'],operatorBuilds:{Nian:nianBuild}}));
    localStorage.setItem('plannerRoster',JSON.stringify({Nian:{elite:0,level:1,skillLevel:1,masteries:{}}}));
  }, {theme,own,nianBuild});
  await page.goto('/account');
  await page.getByRole('tab',{name:'Operators',exact:true}).click();
  await page.getByRole('button',{name:/^Nian: E2 Level 70/}).click();
  const preview=page.getByRole('dialog',{name:'Nian',exact:true});
  await expect(preview.getByRole('heading',{name:/Stats E2 Lv 70/})).toBeVisible();
  for (const skill of [1,2,3]) {
    await preview.getByRole('tab',{name:new RegExp(`^S${skill}`)}).click();
    await expect(preview.getByRole('tabpanel',{name:new RegExp(`^S${skill}`)}).getByRole('img',{name:'Mastery 3',exact:true})).toBeVisible();
  }
  for (const module of ['PRO-X','PRO-Y']) {
    await preview.getByRole('tab',{name:new RegExp(module)}).click();
    await expect(preview.getByRole('group',{name:'Module stage',exact:true}).getByRole('button',{pressed:true})).toHaveText('Stage 3');
  }
  expect(await preview.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/nian-build-${theme}-${info.project.name}.png`});
});

test(`operator preview artwork fits visible pixels in ${theme} theme`, async ({page}, info) => {
  const names = ["Ch'en the Holungday", "Ch'en the Dawnstreak", 'Bagpipe'];
  await page.addInitScript(({own,names,theme}) => {
    localStorage.setItem('theme',theme);
    localStorage.setItem('arkpediaAccount',JSON.stringify({...own,operators:names,operatorBuilds:Object.fromEntries(names.map(name=>[name,{elite:2,level:60,skillLevel:7,masteries:{}}]))}));
  }, {own,names,theme});
  await page.goto('/account'); await page.getByRole('tab',{name:'Operators',exact:true}).click();
  for (const name of names) {
    await page.getByRole('button',{name:new RegExp(`^${name}: E2 Level 60`)}).click();
    const preview = page.getByRole('dialog',{name,exact:true});
    await expect(preview.locator('.gacha-pull-preview-art')).toHaveAttribute('data-art-framed','true');
    await expect(preview.getByRole('img',{name:`${name} base artwork`,exact:true})).toBeVisible();
    await expect(preview.getByRole('img',{name:`${name} base artwork`,exact:true})).toHaveCSS('opacity','1');
    expect(await preview.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/art-${name.replace(/[^a-zA-Z]/g,'')}-${theme}-${info.project.name}.png`});
    await preview.getByRole('button',{name:'Close operator preview',exact:true}).click();
  }
});

test(`friend sharing help uses themed links without an imported account (${theme})`, async ({page}, info) => {
  await page.addInitScript(theme => { localStorage.removeItem('arkpediaAccount'); localStorage.setItem('theme', theme); }, theme);
  await page.goto('/account');
  await page.goto('/friends');
  await expect(page.getByRole('button', {name:'Export my account', exact:true})).toBeDisabled();
  const help = page.getByRole('button', {name:'Friend sharing details', exact:true});
  await expect(help).toHaveCSS('border-top-width', '0px');
  await expect(help.locator('svg circle')).toHaveCount(2);
  await help.click();
  const importTools = page.getByRole('button', {name:'Import / export', exact:true});
  await expect(importTools).toBeVisible();
  await expect(importTools).toHaveAttribute('aria-haspopup', 'dialog');
  if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/friend-help-${theme}-${info.project.name}.png`});
  const url = page.url();
  await importTools.click();
  await expect(page.getByRole('dialog', {name:'Import / export', exact:true})).toBeVisible();
  expect(page.url()).toBe(url);
});

test(`multiple imported friends stay visible, update in place and open separate profile dialogs (${theme})`, async ({ page }, info) => {
  await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
  await page.goto('/friends');
  await expect(page.getByRole('button', {name:'Export my account', exact:true})).toBeEnabled();
  await page.getByLabel('Friend account file').setInputFiles(file);
  const second = makeFriendFile({...own, doctor:'Another Doctor#3333', profile:{...own.profile!, nameCard:'nc_as2024_throne', supports:[{name:'Angelina', rarity:6, elite:2, level:90, potential:6, skill:1}, {name:'Kroos', rarity:3, elite:1, level:55, potential:6, skill:1}, {name:'Amiya', rarity:5, elite:2, level:80, potential:6, skill:1}]}}, roster);
  await page.getByLabel('Friend account file').setInputFiles({name:'second.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(second))});
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.getByLabel('Friend account file').setInputFiles(file);
  await expect(page.getByRole('article')).toHaveCount(2);
  const row = page.getByRole('article').filter({hasText:'Friend Doctor#2222'});
  await row.getByRole('button', {name:'View Friend Doctor#2222 profile', exact:true}).click();
  await expect(page.getByRole('dialog', {name:'Friend Doctor#2222 · Profile', exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(row.getByRole('button', {name:'View Friend Doctor#2222 profile', exact:true})).toBeFocused();
  await page.reload(); await expect(page.getByRole('article')).toHaveCount(2);
  const themed = page.getByRole('article').filter({hasText:'Another Doctor#3333'}).locator('img.profile-strip-background');
  await expect(themed).toHaveAttribute('src', /nc_as2024_throne-strip-0\.webp/);
  await expect(row.locator('img.profile-strip-background')).toHaveAttribute('src', /nc_rhodes_default-strip\.webp/);
  await expect.poll(() => themed.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/friend-list-${theme}-${info.project.name}.png`});
});

}
