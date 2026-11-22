import PageMeta from '@/components/layout/PageMeta';
import type { GetServerSideProps } from 'next';
import CampaignEditor, { type Catalog } from '@/components/dashboard/CampaignEditor';
import PageHeader from '@/components/ui/PageHeader';
import { dashboardActor, dashboardEnv } from '@/lib/dashboard/access';
import { editorCatalog } from '@/lib/dashboard/campaignCatalog';

export const getServerSideProps: GetServerSideProps<{ catalog: Catalog | null }> = async ({ req, res }) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!await dashboardActor(dashboardEnv(), req.headers)) return { notFound: true };
  try {
    return { props: { catalog: await editorCatalog() } };
  } catch { res.statusCode = 503; return { props: { catalog: null } }; }
};

export default function CampaignDashboard({ catalog }: { catalog: Catalog | null }) {
  return <><PageMeta title="Campaign dashboard" description="Manage Arkpedia banners and refresh published pages." path="/dashboard/campaigns" />
    <PageHeader eyebrow="Arkpedia // Dashboard" title="Advertisement campaigns" slim compact />
    {catalog ? <CampaignEditor initial={catalog} /> : <p role="alert">Campaign storage is unavailable.</p>}</>;
}
