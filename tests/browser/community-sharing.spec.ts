import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readOnly } from './census-routes';

const importedAt='2026-11-02T12:00:00.000Z';
async function fixture(page:Page,theme:string){
  await readOnly(page);
  await page.addInitScript(({theme,importedAt})=>{
    if(localStorage.getItem('community-test-seeded'))return;
    localStorage.setItem('community-test-seeded','1');localStorage.setItem('theme',theme);
    localStorage.setItem('arkpediaAccount',JSON.stringify({version:1,server:'en',importedAt,doctor:'Doctor#1234',operators:['Thorns'],skins:[],cleared:[],wallet:{orundum:123},operatorBuilds:{Thorns:{elite:2,level:60,skillLevel:7,masteries:{2:3},modules:{0:2}}},profile:{level:120,registeredAt:null,secretary:null,bio:'PRIVATE BIO',uid:'100',friendSlots:{used:47,limit:50},supports:[{name:'Thorns',rarity:6,elite:2,level:60,potential:1,skill:3,skillMastery:2,module:null,moduleLevel:null}]}}));
  },{theme,importedAt});
  const remote={user:{id:'test-user',name:'Private provider name'},profile:{username:'Community tester',friendTag:null,friendServer:null},linkedProviders:['google'],linkedAccounts:[{id:'g',providerId:'google'}],revision:0,syncReviewed:true,gameSync:false,personalSync:false,historySync:false,paused:false,data:{},providers:['google','discord']};
  await page.route('**/api/cloud-account',route=>route.fulfill({json:remote}));
  await page.route('**/api/account-profile**',route=>route.fulfill({json:{available:true}}));
  const state={choices:{stats:false,shareTag:false,openRequests:false,revision:0,listed:false,importedAt},writes:[] as any[],requests:[] as URL[],reports:[] as any[]};
  await page.route('**/api/community/sharing',async route=>{
    if(route.request().method()==='GET')return route.fulfill({json:state.choices});
    const body=route.request().postDataJSON();state.writes.push(body);
    state.choices={...body.choices,revision:state.choices.revision+1,listed:body.choices.shareTag&&body.choices.openRequests,importedAt:body.snapshot?.importedAt??state.choices.importedAt};
    await route.fulfill({json:state.choices});
  });
  await page.route('**/api/community/supports?**',async route=>{
    const q=new URL(route.request().url());state.requests.push(q);
    const weak=q.searchParams.get('mastery')==='0';
    await route.fulfill({json:{listings:q.searchParams.get('server')==='jp'?[]:[{id:'c79bfde1-830c-41f4-bc12-5d8747bb70be',friendTag:'Helpful#1234',appearance:{avatar:'avatar_def_01',avatarType:'ICON',secretary:null,secretarySkin:null,nameCard:'nc_as2024_throne',nameCardVariant:0,level:120,operators:417,skins:380},server:'en',slots:3,importedAt,fullReports:0,openReports:0,supports:[{operator:'Thorns',skin:'char_293_thorns#2',elite:2,level:weak?20:60,skill:3,mastery:weak?0:2,skillLevel:7,skillMasteries:weak?[0,0,0]:[1,3,2],module:null,moduleLevel:null},{operator:'Amiya',skin:'char_002_amiya#2',skillLevel:7,skillMasteries:[0,1,3],elite:2,level:80,skill:3,mastery:3,module:null,moduleLevel:null},{operator:'SilverAsh',skin:'char_172_svrash#2',skillLevel:7,skillMasteries:[3,0,3],elite:2,level:90,skill:3,mastery:3,module:null,moduleLevel:null}]}],next:null}});
  });
  await page.route('**/api/community/availability',async route=>{state.reports.push(route.request().postDataJSON());await route.fulfill({json:{fullReports:1,openReports:0,hidden:false}});});
  await page.route('**/api/community/stats?**',async route=>{
    const q=new URL(route.request().url());
    await route.fulfill({json:q.searchParams.get('server')==='jp'?{contributors:3,owned:null}:q.searchParams.has('skin')?{contributors:20,owned:10,equipmentOwners:10,equipped:3}:{contributors:50,owned:25,builds:25,e1:5,e2:20,masteryOwners:20,skills:[0,0,16],skillRanks:[[10,5,3,0],[12,4,2,0],[1,1,1,16]],skillUnknown:[1,1,1],moduleOwners:20,modules:[[3,2,5],[1,0,1]]}});
  });
  return state;
}
async function capture(page:Page,name:string,info:TestInfo){
  await page.evaluate(()=>document.fonts.ready);
  if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/${name}-${info.project.name}.png`,fullPage:false,animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
}
async function help(page:Page,label:string,info:TestInfo,name:string){
  const trigger=page.getByRole('button',{name:label,exact:true});await trigger.focus();await trigger.press('Enter');
  const region=page.getByRole('region',{name:label,exact:true});await expect(region).toBeVisible();
  if(label==='How community percentages are calculated' && await region.getByText(/Modules: among all E2 owners/).count())await expect(region).toContainText('each module counts only at its current level');
  const box=await region.boundingBox();const viewport=page.viewportSize()!;expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width+1);
  await capture(page,name,info);await page.keyboard.press('Escape');await expect(region).toHaveCount(0);await expect(trigger).toBeFocused();
}
async function choose(page:Page,label:string,option:string){await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:option,exact:true}).click();}
for(const theme of ['dark','light']){
  test(`community choices are explicit and independent of private saves (${theme})`,async({page},info)=>{
    const state=await fixture(page,theme);await page.goto('/account?settings=community');
    const dialog=page.getByRole('dialog',{name:'Account settings',exact:true});await expect(dialog.getByRole('tab',{name:'Community',exact:true})).toHaveAttribute('aria-selected','true');
    const stats=dialog.getByRole('checkbox',{name:'Contribute to community stats',exact:true}),tag=dialog.getByRole('checkbox',{name:'Share my imported friend tag',exact:true}),requests=dialog.getByRole('checkbox',{name:'Open friend requests to provide support',exact:true});
    await expect(stats).not.toBeChecked();await expect(tag).not.toBeChecked();await expect(requests).toBeDisabled();expect(state.writes).toHaveLength(0);
    for(const label of ['About community stats','About sharing your friend tag','About support listings'])await help(page,label,info,`community-${theme}-${label.replaceAll(' ','-')}`);
    await stats.check();await dialog.getByRole('button',{name:'Save community choices',exact:true}).click();await expect.poll(()=>state.writes.length).toBe(1);
    expect(state.writes[0].snapshot.operators[0].m2).toBe(3);expect(state.writes[0].snapshot.doctor).toBeNull();expect(state.writes[0].snapshot.supports).toEqual([]);expect(JSON.stringify(state.writes[0])).not.toMatch(/PRIVATE BIO|orundum/);
    await tag.check();await requests.check();await dialog.getByRole('button',{name:'Save community choices',exact:true}).click();await expect.poll(()=>state.writes.length).toBe(2);
    expect(state.writes[1].snapshot.supports[0].mastery).toBe(2);await expect(dialog.getByText('Your equipped supports are listed.',{exact:true})).toBeVisible();
    await capture(page,`community-settings-${theme}`,info);
    await dialog.getByRole('button',{name:'Stop all sharing',exact:true}).click();await expect(stats).not.toBeChecked();await expect(tag).not.toBeChecked();
    expect(state.writes.at(-1).snapshot).toBeUndefined();
  });
  test(`support finder combines exact build filters and reports availability (${theme})`,async({page},info)=>{
    const state=await fixture(page,theme);await page.goto('/community/support-units');await expect(page.getByText('Helpful#1234',{exact:true})).toBeVisible();
    await expect(page.getByRole('article').locator('img.profile-strip-background')).toHaveAttribute('src',/nc_as2024_throne-strip-0/);
    await expect(page.getByText('417 operators · 380 skins',{exact:true})).toBeVisible();
    await help(page,'About finding supports',info,`support-help-${theme}`);
    const search=page.getByRole('combobox',{name:'Support operator',exact:true});await search.fill('Thorn');await page.getByRole('option',{name:'Thorns',exact:true}).click();
    const phone=info.project.name==='mobile';if(phone)await page.getByRole('button',{name:'Filters',exact:true}).click();
    await choose(page,'Promotion','E2');await page.getByRole('spinbutton',{name:'Maximum level',exact:true}).fill('30');await choose(page,'Selected skill mastery','No mastery');await choose(page,'Selected support skill','Skill 3');
    if(phone)await page.getByRole('button',{name:'Done',exact:true}).click();
    await expect(page.getByRole('button',{name:'View Helpful#1234 support units',exact:true})).toBeVisible();
    await expect.poll(()=>new URL(page.url()).searchParams.get('mastery')).toBe('0');
    expect(state.requests.at(-1)!.searchParams.get('operator')).toBe('Thorns');expect(state.requests.at(-1)!.searchParams.get('maxLevel')).toBe('30');expect(state.requests.at(-1)!.searchParams.get('elite')).toBe('2');
    await capture(page,`supports-filtered-${theme}`,info);
    if(phone){
      const viewport=page.viewportSize()!;await page.setViewportSize({width:320,height:800});
      const card=page.getByRole('article');await card.scrollIntoViewIfNeeded();
      expect(await card.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
      await capture(page,`supports-narrow-${theme}`,info);await page.setViewportSize(viewport);
    }
    await page.reload();
    const support=page.getByRole('button',{name:'View Helpful#1234 support units',exact:true});await support.focus();await support.press('Enter');
    const builds=page.getByRole('dialog',{name:'Helpful#1234 · Support units',exact:true});await expect(builds).toBeVisible();
    const thorns=builds.getByRole('region',{name:'Thorns support build',exact:true});
    const skillButtons=thorns.getByRole('button',{name:/^Thorns Skill/});await expect(skillButtons).toHaveCount(3);
    await expect(skillButtons.nth(0)).toHaveText(/Skill 1 · Lv 7/);await expect(skillButtons.nth(2)).toHaveAttribute('aria-current','true');
    const positions=await skillButtons.evaluateAll(elements=>elements.map(e=>e.getBoundingClientRect().top));expect(positions[0]).toBeLessThan(positions[1]);expect(positions[1]).toBeLessThan(positions[2]);
    await expect(thorns.getByText('Loading…',{exact:true})).toHaveCount(0);
    await expect(builds.getByText('Loading…',{exact:true})).toHaveCount(0);
    await expect(builds.getByRole('region',{name:'Amiya support build',exact:true}).getByRole('img',{name:'Mastery 1',exact:true})).toBeVisible();
    await expect(builds.getByText('M3',{exact:true})).toHaveCount(0);
    for(const section of await builds.getByRole('region').all()){
      await section.scrollIntoViewIfNeeded();
      await expect.poll(()=>section.locator('img').evaluateAll(images=>images.every(img=>(img as HTMLImageElement).complete&&(img as HTMLImageElement).naturalWidth>0))).toBe(true);
    }
    await thorns.scrollIntoViewIfNeeded();
    await capture(page,`support-builds-${theme}`,info);
    await skillButtons.nth(0).focus();await skillButtons.nth(0).press('Enter');
    const preview=page.getByRole('dialog',{name:'Thorns',exact:true});await expect(preview).toBeVisible();
    await expect(preview.getByRole('region',{name:'Equipped support build',exact:true})).toContainText('E2 Lv20');
    await expect(preview.getByRole('region',{name:'Equipped support build',exact:true})).toContainText('Skill 3 · M0');
    const art=preview.getByRole('img',{name:'Thorns base artwork',exact:true});
    await expect(art).toHaveCSS('opacity','1');await expect.poll(()=>art.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
    await capture(page,`support-details-${theme}`,info);await page.keyboard.press('Escape');await expect(builds).toBeVisible();await expect(skillButtons.nth(0)).toBeFocused();
    await page.keyboard.press('Escape');await expect(builds).toHaveCount(0);await expect(support).toBeFocused();
    const report=page.getByRole('button',{name:'Report availability for Helpful#1234',exact:true});await report.click();await page.getByRole('button',{name:'Friend list full',exact:true}).click();
    await expect(page.getByText('Reported: friend list full.',{exact:true})).toBeVisible();expect(state.reports[0]).toMatchObject({owner:'test-user',status:'full'});
    await capture(page,`supports-report-${theme}`,info);await page.keyboard.press('Escape');await expect(report).toBeFocused();
    if(phone)await page.getByRole('button',{name:/^Filters/}).click();await choose(page,'Support server','Japan');if(phone)await page.getByRole('button',{name:'Done',exact:true}).click();
    await expect(page.getByRole('heading',{name:'No matching support units',exact:true})).toBeVisible();
  });
  test(`small community groups show real zeroes and distinguish empty denominators (${theme})`,async({page},info)=>{
    await fixture(page,theme);let empty=false;
    await page.route('**/api/community/stats?**',route=>route.fulfill({json:empty
      ?{contributors:11,owned:0,builds:0,e1:0,e2:0,masteryOwners:0,skills:[0,0,0],moduleOwners:0,modules:Array.from({length:8},()=>[0,0,0])}
      :{contributors:11,owned:6,builds:6,e1:1,e2:5,masteryOwners:5,skills:[0,0,4],skillRanks:[[1,1,2,0],[2,2,0,0],[0,0,0,4]],skillUnknown:[1,1,1],moduleOwners:5,modules:[[1,1,1],...Array.from({length:7},()=>[0,0,0])]}}));
    await page.goto('/operators/Thorns#community');const stats=page.locator('#operator-community');await stats.scrollIntoViewIfNeeded();
    const metric=(label:string)=>stats.locator('[data-community-metric]').filter({has:page.getByText(label,{exact:true})}).locator('dd,strong');
    await expect(metric('Owned')).toHaveText('54.5%');await expect(metric('E1')).toHaveText('16.7%');await expect(metric('E2')).toHaveText('83.3%');
    await expect(metric('Skill 1 M3')).toHaveText('0.0%');await expect(metric('Skill 3 M3')).toHaveText('80.0%');
    await expect(metric('LOR-X Level 1')).toHaveText('20.0%');await expect(metric('LOR-X Level 2')).toHaveText('20.0%');await expect(metric('LOR-X Level 3')).toHaveText('20.0%');
    await expect(stats.getByText(/percentages need 10/)).toHaveCount(0);await expect(stats.locator('dd').filter({hasText:'—'})).toHaveCount(0);
    const mode=stats.getByRole('button',{name:'Cumulative percentages',exact:true});
    await expect(mode).toHaveAttribute('aria-pressed','false');
    await expect(mode).toHaveText('Exclusive ⇄');
    await expect(stats.locator('img[src*="skill-icons"]')).toHaveCount(3);
    for(const rank of ['M1','M2','M3'])await expect(stats.locator(`dt img[alt="${rank}"]`)).toHaveCount(3);
    await expect(metric('Skill 1 Rank 7')).toHaveText('20.0%');await expect(metric('Skill 1 M1')).toHaveText('20.0%');await expect(metric('Skill 1 M2')).toHaveText('40.0%');
    await expect(stats.locator('dt [role="img"][aria-label="Elite 1"]')).toHaveCount(1);
    await mode.focus();await page.keyboard.press('Enter');
    await expect(mode).toHaveAttribute('aria-pressed','true');
    await expect(metric('Skill 1 Rank 7')).toHaveText('80.0%');await expect(metric('Skill 1 M1')).toHaveText('60.0%');
    await expect(metric('E1')).toHaveText('100.0%');await expect(metric('E2')).toHaveText('83.3%');
    await expect(metric('LOR-X Level 1')).toHaveText('60.0%');await expect(metric('LOR-X Level 2')).toHaveText('40.0%');await expect(metric('LOR-X Level 3')).toHaveText('20.0%');
    await expect(metric('Skill 3 M3')).toHaveText('80.0%');await expect(metric('Owned')).toHaveText('54.5%');
    await capture(page,`cumulative-community-${theme}`,info);
    await mode.click();await expect(metric('LOR-X Level 1')).toHaveText('20.0%');
    if(info.project.name==='mobile'){await page.setViewportSize({width:320,height:800});await stats.scrollIntoViewIfNeeded();const serverBox=await stats.getByRole('combobox',{name:'Community stats server'}).boundingBox();const modeBox=await mode.boundingBox();expect(Math.abs(serverBox!.y+serverBox!.height/2-modeBox!.y-modeBox!.height/2)).toBeLessThan(2);await capture(page,`narrow-community-${theme}`,info);}
    await capture(page,`small-community-${theme}`,info);await help(page,'How community percentages are calculated',info,`small-community-help-${theme}`);
    empty=true;await choose(page,'Community stats server','Korea');await expect(metric('Owned')).toHaveText('0.0%');
    await expect(metric('Skill 3 M3')).toHaveText('—');await expect(metric('LOR-X Level 1')).toHaveText('—');
    await expect(stats.getByText('— means no eligible owners with known data yet.',{exact:true})).toBeVisible();
  });
  test(`operator stats explain in-progress M3 and skin details show equipped percentages (${theme})`,async({page},info)=>{
    await fixture(page,theme);await page.goto('/operators/Thorns#community');const stats=page.locator('#operator-community');await stats.scrollIntoViewIfNeeded();await expect(stats.locator('[data-community-metric]').filter({has:page.getByText('Owned',{exact:true})}).getByText('50.0%',{exact:true})).toBeVisible();
    expect(await page.locator('[data-operator-section]').evaluateAll(elements=>{const names=elements.map(e=>e.getAttribute('data-operator-section'));return names.indexOf('community')>names.indexOf('talents')&&(names.indexOf('mastery')<0||names.indexOf('community')<names.indexOf('mastery'));})).toBe(true);
    await expect(stats.locator('[data-community-metric]').filter({has:page.getByText('Skill 3 M3',{exact:true})}).getByText('80.0%',{exact:true})).toBeVisible();
    await expect(stats.locator('[data-community-metric]').filter({has:page.getByText('LOR-X Level 1',{exact:true})}).getByText('15.0%',{exact:true})).toBeVisible();
    await help(page,'How community percentages are calculated',info,`operator-stats-help-${theme}`);await capture(page,`operator-stats-${theme}`,info);
    await choose(page,'Community stats server','Japan');await expect(stats.getByText('Waiting for at least 10 contributors on this server.',{exact:true})).toBeVisible();
    await page.goto('/skins');const skin=await page.evaluate(()=>{const skins=(window as any).__NEXT_DATA__.props.pageProps.skins;return skins.find((s:any)=>s.skinId)?.name as string;});await page.goto(`/skins?skin=${encodeURIComponent(skin)}`);
    const skinStats=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Community stats',exact:true})});await expect(skinStats.getByText('30.0%',{exact:true})).toBeVisible();
    await help(page,'How community percentages are calculated',info,`skin-stats-help-${theme}`);await capture(page,`skin-stats-${theme}`,info);
  });
}

test('an opted-in snapshot refreshes after import while the settings dialog is closed',async({page})=>{
  const state=await fixture(page,'dark');await page.goto('/account?settings=community');
  const dialog=page.getByRole('dialog',{name:'Account settings',exact:true});
  await dialog.getByRole('checkbox',{name:'Contribute to community stats',exact:true}).check();
  await dialog.getByRole('button',{name:'Save community choices',exact:true}).click();await expect.poll(()=>state.writes.length).toBe(1);
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  await page.evaluate(()=>{const account=JSON.parse(localStorage.getItem('arkpediaAccount')!);account.importedAt='2026-11-02T12:10:00.000Z';localStorage.setItem('arkpediaAccount',JSON.stringify(account));window.dispatchEvent(new Event('arkpediaAccountChanged'));});
  await expect.poll(()=>state.writes.length).toBe(2);expect(state.writes[1].action).toBe('refresh');expect(state.writes[1].choices).toEqual({stats:true,shareTag:false,openRequests:false});
});
