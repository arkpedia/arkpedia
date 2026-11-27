import { expect, test } from '@playwright/test';
import type { Catalog } from '../../components/dashboard/CampaignEditor';
import type { RecentCampaignChange } from '../../lib/dashboard/campaignStore';
import type { SponsorCampaign } from '../../lib/sponsors/campaigns';

const campaign: SponsorCampaign = {
  id: 'sample-campaign', sponsor: 'Sample', status: 'active', url: '/',
  image: '/site-updates/tools-menu-desktop.png', alt: 'Sample artwork', width: 588, height: 602,
  placements: ['header'], startAt: null, endAt: null,
};
const catalog: Catalog = {
  base: [campaign], edits: [{ id: campaign.id, revision: 1, followsRelease: true, campaign }],
  events: [], groups: {},
};
const change: RecentCampaignChange = {
  id: campaign.id, sponsor: campaign.sponsor, revision: 1, actor: 'Fixture editor',
  updatedAt: '2026-11-26T16:00:00Z', cleared: false, changes: ['Page artwork'],
};

for (const theme of ['dark', 'light']) {
  test(`Ad Campaigns groups the campaign views and preserves history links (${theme})`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    await page.route('**/_next/data/**/dashboard/campaigns.json*', route => {
      const history = new URL(route.request().url()).searchParams.get('history');
      const pageProps = { catalog, ...(history === campaign.id && { historyId: history }) };
      return route.fulfill({ json: { pageProps, __N_SSP: true } });
    });
    await page.route('**/api/dashboard/campaigns?**', route => {
      const view = new URL(route.request().url()).searchParams.get('view');
      if (view === 'recent') return route.fulfill({ json: [change] });
      if (view === 'rotation') return route.fulfill({ json: { table: { version: 1, campaigns: [campaign] }, plans: {} } });
      return route.fulfill({ json: { versions: [], nextBefore: null } });
    });
    await page.goto('/game-modes');
    const open = (path: string) => page.evaluate(url => (window as unknown as {
      next: { router: { push: (path: string) => Promise<void> } };
    }).next.router.push(url), path);
    await open('/dashboard/campaigns?tab=recent');

    const sections = page.getByRole('tablist', { name: 'Admin sections' });
    const ads = sections.getByRole('tab', { name: 'Ad Campaigns' });
    const views = page.getByRole('tabpanel', { name: 'Ad Campaigns' }).getByRole('tablist', { name: 'Ad campaign views' });
    const recent = views.getByRole('tab', { name: 'Recent changes' });
    const campaigns = views.getByRole('tab', { name: 'Campaigns' });
    const rotation = views.getByRole('tab', { name: 'Rotation' });
    await expect(ads).toHaveAttribute('aria-selected', 'true');
    await expect(sections.getByRole('tab', { name: /rotation|recent changes/i })).toHaveCount(0);
    await expect(recent).toHaveAttribute('aria-selected', 'true');
    const historyLink = page.getByRole('link', { name: 'Sample Campaign' });
    const historyPath = `/dashboard/campaigns?history=${campaign.id}`;
    await expect(historyLink).toHaveAttribute('href', historyPath);
    await open(historyPath);
    await expect(campaigns).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Campaign history' })).toBeVisible();
    await page.goBack();
    await expect(recent).toHaveAttribute('aria-selected', 'true');

    await campaigns.click();
    const description = page.getByLabel('Image description');
    await description.fill('Unsaved description');
    await campaigns.focus();
    await campaigns.press('ArrowRight');
    await expect(rotation).toBeFocused();
    await expect(page).toHaveURL(/\?tab=rotation$/);
    await expect(page.getByRole('region', { name: 'Page banner rotation' }).getByText('Sample Campaign')).toBeVisible();
    await rotation.press('ArrowLeft');
    await expect(description).toHaveValue('Unsaved description');

    await sections.getByRole('tab', { name: 'Page visibility' }).click();
    await expect(views).toBeHidden();
    await ads.click();
    await expect(description).toHaveValue('Unsaved description');
    await page.evaluate(() => scrollTo(0, 0));
    expect(await views.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  });
}
