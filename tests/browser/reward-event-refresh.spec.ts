import { test, expect } from '@playwright/test';

for (const theme of ['dark','light']) {
  test(`reward cards and sanity amounts use canonical routes (${theme})`, async ({page}, info) => {
    await page.addInitScript(theme => localStorage.setItem('theme',theme), theme);
    await page.goto('/free-op?view=stages');
    await expect(page).toHaveURL(/\/reward-tracker\?view=stages/);
    // The bundled fallback predates welfare rows; exercise the current release shape.
    await page.route('**/reward-tracker?view=stages', async route => {
      const response=await route.fetch(); const html=await response.text();
      const match=/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html)!;
      const data=JSON.parse(match[1]); const props=data.props.pageProps;
      props.now=Date.now()-300_000;
      props.freeRewards=[...props.freeRewards,{id:'qa:gladiia',group:'Welfare operators',name:'Gladiia · Record Restoration: 15 stars',event:'Under Tides',source:'trail',forecast:false,startAt:Date.now()-120_000,
        href:'/events/%5BSide%20Story%5D%20Under%20Tides',rewards:[{id:'char_474_glady',name:'Gladiia',rarity:6,count:1}]}];
      props.rewardIcons.char_474_glady='/six-star-icons/Gladiia - Base.webp';
      await route.fulfill({response,body:html.replace(match[1],JSON.stringify(data).replace(/</g,'\\u003c'))});
    });
    await page.reload();
    const welfare=page.getByRole('list',{name:'Welfare operators to claim',exact:true});
    const card=welfare.locator('.free-op-welfare-card').first();
    await expect(card).toBeVisible();
    await expect(card).toHaveCSS('border-top-width','1px');
    expect(await card.evaluate(el=>getComputedStyle(el).borderTopColor)).not.toBe('rgba(0, 0, 0, 0)');
    await expect(card.locator('.rarity-frame')).toHaveCSS('border-top-width','2px');
    await expect(card.locator('.selector-score')).toHaveCSS('position','absolute');
    await expect(card.locator('.selector-score')).toHaveText('+3');
    await expect(card.locator('.selector-howto')).toHaveAttribute('href',/^\/events\//);
    const stage=page.locator('.pulls-past-row').first();
    await expect(stage.locator('.pulls-reward-amount[title="Originite Prime"]')).toBeVisible();
    await expect(stage.locator('.pulls-reward-amount[title="Sanity"] img')).toHaveAttribute('src',/sanity\.webp/);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/reward-refresh-${theme}-${info.project.name}.png`,fullPage:true});
  });

  test(`Relaunch Anchor official guide opens full-size images (${theme})`, async ({page},info) => {
    await page.addInitScript(theme => localStorage.setItem('theme',theme), theme);
    await page.goto('/events/%5BReclamation%20Algorithm%5D%20Relaunch%20Anchor#overview');
    await expect(page.locator('.event-mode-gallery img')).toHaveCount(8);
    await expect(page.getByRole('link',{name:'Mechanics post ↗',exact:true})).toHaveClass('ghost');
    const panel=page.getByRole('button',{name:'Enlarge Rebuilding New Rhodes Island',exact:true});
    await panel.scrollIntoViewIfNeeded();
    await expect.poll(()=>panel.locator('img').evaluate((image: HTMLImageElement)=>image.naturalWidth),{timeout:20000}).toBe(1920);
    await panel.click();
    const zoom=page.getByRole('dialog',{name:'Rebuilding New Rhodes Island artwork',exact:true});
    await expect(zoom).toBeVisible();
    await expect.poll(()=>zoom.locator('img').first().evaluate((image: HTMLImageElement)=>image.naturalWidth),{timeout:20000}).toBe(1920);
    await page.keyboard.press('Escape');
    await expect(zoom).not.toBeVisible();
    await expect(panel).toBeFocused();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(process.env.ARKPEDIA_QA_CAPTURE)await page.screenshot({path:`${process.env.ARKPEDIA_QA_CAPTURE}/anchor-refresh-${theme}-${info.project.name}.png`});
  });

}
