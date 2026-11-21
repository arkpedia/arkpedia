import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import CampaignEditor, { type Catalog } from '@/components/dashboard/CampaignEditor';
import PageHeader from '@/components/ui/PageHeader';
import { dashboardActor, dashboardEnv } from '@/lib/dashboard/access';
import { campaignCatalog } from '@/lib/dashboard/campaignCatalog';

export const getServerSideProps: GetServerSideProps<{ catalog: Catalog | null }> = async ({ req, res }) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!await dashboardActor(dashboardEnv(), req.headers)) return { notFound: true };
  try {
    const { base, edits } = await campaignCatalog();
    return { props: { catalog: { base: base.campaigns, edits } } };
  } catch { res.statusCode = 503; return { props: { catalog: null } }; }
};

export default function CampaignDashboard({ catalog }: { catalog: Catalog | null }) {
  return <><Head><title>Campaigns | Arkpedia Dashboard</title></Head>
    <PageHeader eyebrow="Arkpedia // Dashboard" title="Advertisement campaigns" slim compact />
    {catalog ? <CampaignEditor initial={catalog} /> : <p role="alert">Campaign storage is unavailable.</p>}</>;
}
