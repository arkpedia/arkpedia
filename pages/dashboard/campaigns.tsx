import { useState } from 'react';
import { useRouter } from 'next/router';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import PageMaintenance from '@/components/dashboard/PageMaintenance';
import styles from '@/components/dashboard/CampaignEditor.module.css';
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

const sections = [{ value: 'campaigns', label: 'Campaigns' }, { value: 'maintenance', label: 'Maintenance' }] as const;

export default function CampaignDashboard({ catalog }: { catalog: Catalog | null }) {
  const router = useRouter();
  const tab = router.query.tab === 'maintenance' ? 'maintenance' : 'campaigns';
  const [openedMaintenance, setOpenedMaintenance] = useState(tab === 'maintenance');
  return <><PageMeta title="Arkpedia admin" description="Manage Arkpedia banners and refresh published pages." path="/dashboard/campaigns" />
    <PageHeader eyebrow="Arkpedia // Dashboard" title="Arkpedia admin" slim compact />
    <Tabs id="dashboard" label="Admin sections" className={styles.tabStrip} options={sections} value={tab} onChange={value => {
      if (value === 'maintenance') setOpenedMaintenance(true);
      void router.replace({ pathname: router.pathname, query: { tab: value } }, undefined, { shallow: true, scroll: false });
    }} />
    <div {...tabPanelProps('dashboard', 'campaigns')} hidden={tab !== 'campaigns'}>
      {catalog ? <CampaignEditor initial={catalog} /> : <p role="alert">Campaign storage is unavailable.</p>}
    </div>
    <div {...tabPanelProps('dashboard', 'maintenance')} hidden={tab !== 'maintenance'}>
      {(tab === 'maintenance' || openedMaintenance) && <PageMaintenance />}
    </div></>;
}
