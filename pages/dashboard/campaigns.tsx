import type { GetServerSideProps } from 'next';
import CampaignDashboard, { type DashboardProps } from '@/components/dashboard/CampaignDashboard';
import PageMeta from '@/components/layout/PageMeta';
import { dashboardActor, dashboardEnv } from '@/lib/dashboard/access';
import { editorCatalog } from '@/lib/dashboard/campaignCatalog';

export const getServerSideProps: GetServerSideProps<DashboardProps> = async ({ req, res, query }) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!await dashboardActor(dashboardEnv(), req.headers)) return { notFound: true };
  try {
    const catalog = await editorCatalog();
    const id = query.history;
    const found = typeof id === 'string' && catalog.edits.some(edit => edit.id === id);
    return { props: { catalog, ...(found && { historyId: id }) } };
  } catch { res.statusCode = 503; return { props: { catalog: null } }; }
};

export default function CampaignDashboardPage(props: DashboardProps) {
  return <>
    <PageMeta title="Arkpedia admin" description="Edit campaigns, operator guides and published pages." path="/dashboard/campaigns" />
    <CampaignDashboard {...props} />
  </>;
}
