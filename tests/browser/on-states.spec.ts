import { expect, test, type Page } from '@playwright/test';

/*
 * One look for "on". A pressed, checked, selected or current control is the chip's
 * picked state: --teal-dim fill with teal border and text. The solid --teal-fill
 * belongs to .primary, the action that runs something, and never marks a state.
 *
 * Found by the 2026-09-26 verification: 121 selected controls used the chip state and
 * 8 used the primary fill -- button.tgl.is-on for Daily missions, Weekly missions and
 * Annihilation on /pulls and "Prioritize 4★+ and robots" on /recruitment, where a
 * switched-on toggle looked exactly like "+ Add banner" beside it. The /stages/browse
 * map toggles swapped ghost/primary with no aria-pressed at all; they are aria-pressed
 * chips now, and audit:styles (primaryToggle) rejects the swap in source, which this
 * census cannot see.
 *
 * A checked checkbox is an on state too (2026-09-26: the /pulls and /recruitment
 * settings above went back from .tgl buttons to checkboxes at the maintainer's
 * request). It is the .check box: a teal border and tick over --teal-dim, so it must
 * compute that border and that fill -- a native box, or one painted in the primary
 * fill, fails.
 */

const ROUTES = [
  '/pulls', '/recruitment', '/operators', '/operators/Amiya', '/gacha', '/enemies', '/planner', '/base',
  '/schedule', '/skins', '/techniques', '/synergies', '/farming', '/results', '/obtain-method',
  '/games/operator-guesser', '/games/recruitment-guesser', '/music/discover', '/gamemodes/stronghold-protocol',
];

/** Every visible on-state element whose background is the primary action's fill. */
async function primaryLookingStates(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement('button');
    probe.type = 'button';
    probe.className = 'primary';
    probe.textContent = 'probe';
    (document.querySelector('main') ?? document.body).appendChild(probe);
    const primary = getComputedStyle(probe);
    const fill = { image: primary.backgroundImage, colour: primary.backgroundColor };
    probe.remove();
    // The on colours, read off a plain span: a button would report them mid-transition.
    const swatch = document.createElement('span');
    swatch.style.cssText = 'border: 1px solid var(--teal); background-color: var(--teal-dim)';
    document.body.appendChild(swatch);
    const on = { border: getComputedStyle(swatch).borderTopColor, fill: getComputedStyle(swatch).backgroundColor };
    swatch.remove();
    const states = Array.from(document.querySelectorAll<HTMLElement>(
      '[aria-pressed="true"], [aria-checked="true"], [aria-selected="true"], [aria-current="page"], [aria-current="true"], .is-on, input[type="checkbox"]:checked',
    )).filter((el) => el.getClientRects().length > 0);
    const name = (el: HTMLElement) => `${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 3).join('.')} "${(el.textContent || el.getAttribute('aria-label') || el.closest('label')?.textContent || '').trim().slice(0, 30)}"`;
    const offenders = states.filter((el) => {
      const s = getComputedStyle(el);
      if (fill.image !== 'none') return s.backgroundImage === fill.image;
      return s.backgroundImage === 'none' && s.backgroundColor === fill.colour && fill.colour !== 'rgba(0, 0, 0, 0)';
    }).map(name);
    for (const box of states.filter((el) => el.matches('input[type="checkbox"]'))) {
      const s = getComputedStyle(box);
      if (s.borderTopColor !== on.border || s.backgroundColor !== on.fill) offenders.push(`${name(box)}: checked, but not the .check box (border ${s.borderTopColor}, fill ${s.backgroundColor})`);
    }
    const checked = states.filter((el) => el.matches('input[type="checkbox"]')).length;
    return { fill, states: states.length, checked, offenders };
  });
}

for (const theme of ['dark', 'light'] as const) {
  test(`no on-state looks like a primary action (${theme})`, async ({ page }, info) => {
    test.setTimeout(180000);
    if (info.project.name === 'mobile') await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch { /* private mode */ } }, theme);
    let states = 0;
    let checked = 0;
    const offenders: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route);
      await page.waitForTimeout(300);
      const found = await primaryLookingStates(page);
      expect(found.fill.image !== 'none' || found.fill.colour !== 'rgba(0, 0, 0, 0)', 'the probe took the primary fill').toBe(true);
      states += found.states;
      checked += found.checked;
      offenders.push(...found.offenders.map((o) => `${route}: ${o}`));
    }
    // The map toggles only show their on state once pressed: turn each one on.
    await page.goto('/stages/browse?s=1-7');
    const tools = page.locator('.stage-map-tools');
    // A cold server can take a while to fetch the stage's map data the first time.
    await expect(tools.getByRole('button', { name: /Legend/ })).toBeVisible({ timeout: 45_000 });
    for (const name of [/Legend/, /Deploy/, /Description/]) {
      const button = tools.getByRole('button', { name });
      if (!(await button.count())) continue;
      if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      const found = await primaryLookingStates(page);
      states += found.states;
      offenders.push(...found.offenders.map((o) => `/stages/browse (${name.source} on): ${o}`));
    }
    expect(states, 'on-state controls were found, or this proves nothing').toBeGreaterThan(40);
    // /pulls starts with Daily, Weekly and Annihilation checked.
    expect(checked, 'checked checkboxes were found, or the checkbox rule proves nothing').toBeGreaterThanOrEqual(3);
    expect([...new Set(offenders)]).toEqual([]);
  });
}
