import { expect, test, type Page } from '@playwright/test';
import { readOnly, seedAccountRecord } from './census-routes';

/*
 * The account card's avatar (components/account/ProfileCard, lib/account/portraits.ts
 * avatarSources) where it is the "Assistant Operator": the assistant's icon in the outfit it
 * wears, the next picture when one fails to load, and none rather than a broken image. The
 * game stores that avatar as the assistant's skin id, which the card's first build looked up
 * in profile-avatars/: an empty box on every such account (2026-10). The icons are answered
 * here, a picture for each file a case calls published and a 404 for every other, so what is
 * on the asset host today does not decide the result.
 */

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const ICON = /^.*\/((?:\w+-star-icons|profile-avatars)\/)/;
/** An icon's folder and file name, from its address on whichever host serves it. */
const iconFile = (href: string) => decodeURIComponent(new URL(href).pathname).replace(ICON, '$1');

const VINA = 'char_1019_siege2@epoque#50';
const OUTFIT = 'six-star-icons/Vina Victoria - Glorious Path.webp';
const BASE = 'six-star-icons/Vina Victoria - Base.webp';

/** A made-up import with this profile. */
const record = (profile: Record<string, unknown>) => ({ version: 1, server: 'en', importedAt: '2026-10-01T12:00:00.000Z', doctor: null, operators: [], skins: [], cleared: [],
  profile: { level: 120, registeredAt: '2020-02-03T03:42:40.000Z', secretary: 'Vina Victoria', bio: null, uid: '00000001', nameCard: null, supports: [], ...profile } });
/** Vina Victoria in Glorious Path, the assistant and the avatar, as an import keeps it now. */
const ASSISTANT = { avatarType: 'ASSISTANT', avatar: VINA, secretarySkin: VINA };

/** Opens /account with the record, every rarity icon and profile avatar answered: the files in
 *  `published` with a picture, the rest with a 404. Gives the icons asked for, in order. */
async function openWith(page: Page, profile: Record<string, unknown>, published: string[]) {
  await readOnly(page);
  const asked: string[] = [];
  await page.route((url) => ICON.test(decodeURIComponent(url.pathname)), (route) => {
    const file = iconFile(route.request().url());
    asked.push(file);
    return published.includes(file) ? route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }) : route.fulfill({ status: 404, body: '' });
  });
  await page.goto('/account');
  await seedAccountRecord(page, record(profile));
  return asked;
}

/** What the card's avatar draws where it is on screen (the full card's; the folded card's
 *  waits behind it): its icon file, marked when it did not load, or "none" -- never read off a
 *  card that has not drawn yet. And any avatar's picture, on screen or not, that came back
 *  broken. */
async function drawn(page: Page) {
  const avatars = await page.locator('.account-card-avatar').evaluateAll((els) => els.map((el) => {
    // The avatar's own picture, not the level ring's inside it.
    const img = el.querySelector<HTMLImageElement>(':scope > img');
    return { shown: el.checkVisibility(), img: img && { src: img.src, loaded: img.complete && img.naturalWidth > 0, broken: img.complete && img.naturalWidth === 0 } };
  }));
  const label = ({ img }: (typeof avatars)[number]) => (img ? `${iconFile(img.src)}${img.loaded ? '' : ' (not loaded)'}` : 'none');
  return {
    drawn: [...new Set(avatars.filter((avatar) => avatar.shown).map(label))],
    broken: avatars.filter((avatar) => avatar.img?.broken).map(label),
  };
}

test('the "Assistant Operator" avatar is the assistant\'s icon in the outfit it wears', async ({ page }) => {
  const asked = await openWith(page, ASSISTANT, [OUTFIT, BASE]);
  // By the outfit's name in the catalogue, as the icon folders file it, not its illustration's.
  await expect.poll(() => drawn(page)).toEqual({ drawn: [OUTFIT], broken: [] });
  expect(asked).toContain(OUTFIT);
});

test("an outfit whose icon is missing draws the assistant's Base icon instead, never a broken image", async ({ page }) => {
  const asked = await openWith(page, ASSISTANT, [BASE]);
  await expect.poll(() => drawn(page)).toEqual({ drawn: [BASE], broken: [] });
  // The outfit's icon was asked for first (by each of the card's avatars), and only then the Base one.
  expect([...new Set(asked.filter((file) => file.includes('Vina Victoria')))]).toEqual([OUTFIT, BASE]);
});

test('with none of its pictures published the avatar draws nothing rather than a broken image', async ({ page }) => {
  const asked = await openWith(page, ASSISTANT, []);
  await expect.poll(() => drawn(page)).toEqual({ drawn: ['none'], broken: [] });
  expect(asked).toEqual(expect.arrayContaining([OUTFIT, BASE]));
});

test("a record imported before the avatar's type was kept draws Amiya's Elite 1 art from its skin id", async ({ page }) => {
  // The old import kept only the id: "char_002_amiya#1+", with the "+" a skin id can hold.
  const elite1 = 'five-star-icons/Amiya - Elite 1.webp';
  await openWith(page, { avatar: 'char_002_amiya#1+', secretarySkin: null, secretary: 'Amiya' }, [elite1]);
  await expect.poll(() => drawn(page)).toEqual({ drawn: [elite1], broken: [] });
});
