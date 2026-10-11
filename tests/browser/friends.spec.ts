import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import { makeFriendFile } from '../../lib/account/friendFile';
import type { AccountRecord } from '../../lib/account/accountStore';
import type { Roster } from '../../lib/planner/roster';

const own: AccountRecord = { version:1,server:'en',importedAt:'2026-10-09T00:00:00Z',doctor:'My Doctor#1111',operators:['Angelina'],skins:[],cleared:[],wallet:{orundum:6000,originitePrime:30,permits:10,yellowCerts:180,monthlyCardUntil:null},profile:{level:120,registeredAt:null,secretary:null,bio:'My account'} };
const roster: Roster = {Angelina:{elite:2,level:90,skillLevel:7,masteries:{1:3,2:3},modules:{0:2},potential:6}};
const friend = makeFriendFile({...own,doctor:'Friend Doctor#2222',operators:['Angelina','Kroos'],skins:['char_291_aglina@summer#5'],wallet:undefined},{...roster,Kroos:{elite:1,level:55,skillLevel:7,masteries:{}}},new Date('2026-10-09T00:00:00Z'));
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
  await page.getByLabel('Friend account file').setInputFiles(file);
  await expect(page.getByRole('status')).toContainText('Imported Friend Doctor#2222');
  await page.getByRole('button',{name:"Show friend's operators",exact:true}).click();
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
  const tile=collection.getByRole('button',{name:/^Angelina: E2 Level 90/});
  await tile.click();
  await expect(page.getByRole('dialog',{name:'Angelina',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'Angelina',exact:true})).toHaveCount(0);
  await expect(collection).toBeVisible();
  await expect(tile).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(collection).toHaveCount(0);
  await expect(page.getByRole('button',{name:"Show friend's operators",exact:true})).toBeFocused();
  await page.getByRole('button',{name:"Show friend's skins",exact:true}).click();
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
