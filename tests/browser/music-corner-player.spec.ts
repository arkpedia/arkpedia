import { expect, test } from '@playwright/test';
import { stubYouTube } from './youtube-stub';

/*
 * The corner player keeps every control inside its card. On a desktop its buttons and volume
 * slider shared one row that could not wrap, and the slider ran out of the card's right edge,
 * cut off (2026-10-14). Edges only, so it holds for any arrangement of the controls.
 */
test('the corner player keeps every control inside its card', async ({ page }) => {
  await stubYouTube(page);
  await page.goto("/pull-planner");
  const shell = page.locator('.music-player');
  await shell.getByRole('button', { name: 'Expand player' }).click();
  await expect(shell.locator('.music-play-btn')).toBeVisible();
  const out = await shell.evaluate((card) => {
    const box = card.getBoundingClientRect();
    return Array.from(card.querySelectorAll('button, input, a'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0)
      .filter(({ r }) => r.left < box.left - 0.5 || r.right > box.right + 0.5)
      .map(({ el, r }) => `${el.getAttribute('aria-label') ?? el.textContent?.trim()}: ${Math.round(r.left)}-${Math.round(r.right)} in ${Math.round(box.left)}-${Math.round(box.right)}`);
  });
  expect(out, 'controls outside the card').toEqual([]);
  // The volume is there on a desktop (it was dropped once, 2026-10-14), not on a touch screen.
  const volume = shell.getByRole('slider', { name: 'Volume', exact: true });
  if (await page.evaluate(() => matchMedia('(pointer: fine)').matches)) {
    await expect(volume).toBeVisible();
    expect((await volume.boundingBox())!.width, 'the volume has room to set').toBeGreaterThanOrEqual(56);
  } else {
    await expect(volume).toBeHidden();
  }
});

for (const theme of ['dark', 'light']) {
  test(`the same corner opens and closes the player (${theme})`, async ({page}, info) => {
    await stubYouTube(page);
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.goto('/pull-planner');
    const shell = page.locator('.music-player');
    const opener = shell.getByRole('button', {name:'Expand player'});
    const box = (await opener.boundingBox())!; const point = {x:box.x+box.width/2,y:box.y+box.height/2};
    await page.mouse.click(point.x, point.y);
    await expect(shell.getByRole('link', {name:'Queue',exact:true})).toBeVisible();
    const closer = shell.getByRole('button', {name:'Collapse player'});
    const closeBox = (await closer.boundingBox())!;
    expect(point.x).toBeGreaterThan(closeBox.x); expect(point.x).toBeLessThan(closeBox.x+closeBox.width);
    expect(point.y).toBeGreaterThan(closeBox.y); expect(point.y).toBeLessThan(closeBox.y+closeBox.height);
    if(process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({animations:'disabled',path:`${process.env.ARKPEDIA_QA_CAPTURE}/${info.project.name}-${theme}-corner-player.png`});
    await page.mouse.click(point.x, point.y); await expect(opener).toBeVisible();
    await opener.focus(); await page.keyboard.press('Enter'); await expect(closer).toBeFocused();
    await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
    await opener.click(); await shell.getByRole('link',{name:'Queue',exact:true}).click();
    await expect(page).toHaveURL(/\/music\?view=queue/);
  });
}
