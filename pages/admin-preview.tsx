import type { GetStaticProps } from 'next';
import { useRouter } from 'next/router';
import { useState } from 'react';
import CampaignDashboard from '@/components/dashboard/CampaignDashboard';
import { DashboardRequest } from '@/components/dashboard/DashboardRequest';
import type { Catalog } from '@/components/dashboard/CampaignEditor';
import type { SponsorCampaign } from '@/lib/sponsors/campaigns';
import type { UpdateContent, UpdateDraft } from '@/lib/site-updates/types';

const campaign: SponsorCampaign = {
  id: 'lootbar-violet-orchid', sponsor: 'LootBar', status: 'active', url: 'https://www.lootbar.com/shop/kukkikaze',
  startAt: null, endAt: null, placements: ['home', 'header', 'support'],
  image: '/advertisements/lootbar/violet-orchid-page-banner.webp', alt: 'LootBar Violet Orchid page artwork', width: 1800, height: 400,
  mainArtwork: { image: '/advertisements/lootbar/violet-orchid-main.webp', alt: 'LootBar Violet Orchid main artwork', width: 1920, height: 640 },
  mobileArtwork: { image: '/advertisements/lootbar/violet-orchid-mobile.webp', alt: 'LootBar Violet Orchid mobile artwork', width: 900, height: 200 },
};
const change = { id: campaign.id, sponsor: campaign.sponsor, revision: 1, actor: 'Sample editor',
  updatedAt: '2026-11-27T12:00:00Z', cleared: false, changes: ['Page artwork'] };
const catalog: Catalog = {
  base: [campaign], edits: [{ id: campaign.id, revision: 1, followsRelease: true, campaign }],
  events: [], groups: { [campaign.id]: 'Live now' },
};

/** No Preview request reaches the private dashboard APIs. */
function createSampleRequest(): typeof fetch {
  const drafts: UpdateDraft[] = [{ id: 'sample-update', revision: 1, publishedAt: null, images: [], major: false,
    title: 'Sample site update', body: 'Review the draft and open its preview before publishing.' }];
  return async (input, init) => {
    const url = new URL(String(input), 'https://preview.arkpedia.net');
    if (url.pathname === '/api/dashboard/site-updates') {
      if (init?.method === 'POST') {
        const command = JSON.parse(String(init.body)) as { action: string; id: string | null; revision: number; content: UpdateContent };
        if (command.action !== 'save') return Response.json({ error: 'This Preview keeps site updates as drafts.' }, { status: 403 });
        const existing = drafts.findIndex(draft => draft.id === command.id);
        const next: UpdateDraft = { ...command.content, id: command.id ?? crypto.randomUUID(), revision: command.revision + 1, publishedAt: null };
        if (existing === -1) drafts.unshift(next);
        else drafts[existing] = next;
        return Response.json(next);
      }
      const id = url.searchParams.get('id');
      return id ? Response.json(drafts.find(draft => draft.id === id) ?? null)
        : Response.json(drafts.map(({ id, title, publishedAt }) => ({ id, title, publishedAt })));
    }
    if (url.pathname === '/api/dashboard/campaigns') {
      if (init?.method === 'POST') return Response.json({ error: 'Campaign saves are disabled in this Preview.' }, { status: 403 });
      if (url.searchParams.get('view') === 'rotation') return Response.json({ table: { version: 1, campaigns: [campaign] }, plans: {} });
      if (url.searchParams.get('view') === 'recent') return Response.json([change]);
      if (url.searchParams.get('history') === campaign.id) return Response.json({ versions: [{ ...change, campaign }], nextBefore: null });
    }
    return Response.json({ error: 'This action is unavailable in the sample.' }, { status: 404 });
  };
}

export default function AdminPreview() {
  const { query } = useRouter();
  const [request] = useState(createSampleRequest);
  return <DashboardRequest.Provider value={request}>
    <CampaignDashboard catalog={catalog} historyId={query.history === campaign.id ? campaign.id : undefined} sample />
  </DashboardRequest.Provider>;
}

export const getStaticProps: GetStaticProps = () =>
  process.env.ARKPEDIA_PREVIEW === '1' || process.env.NODE_ENV === 'development'
    ? { props: {} } : { notFound: true };
