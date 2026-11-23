import { useState } from 'react';
import { useRouter } from 'next/router';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import { ContentContext } from '@/lib/content/context';
import { ICONS } from '@/components/layout/NavIcons';
import CampaignRotations from '@/components/dashboard/CampaignRotations';
import OperatorGuides from '@/components/dashboard/OperatorGuides';
import RecentCampaignChanges from '@/components/dashboard/RecentCampaignChanges';
import PageMaintenance from '@/components/dashboard/PageMaintenance';
import styles from '@/components/dashboard/CampaignEditor.module.css';
import PageMeta from '@/components/layout/PageMeta';
import type { GetServerSideProps } from 'next';
import CampaignEditor, { type Catalog } from '@/components/dashboard/CampaignEditor';
import PageHeader from '@/components/ui/PageHeader';
import { dashboardActor, dashboardEnv } from '@/lib/dashboard/access';
import { editorCatalog } from '@/lib/dashboard/campaignCatalog';

interface DashboardProps { catalog: Catalog | null; historyId?: string }

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

const sections = [
  { value: 'campaigns', label: 'Ad Campaigns', icon: ICONS.grid },
  { value: 'rotation', label: 'Ad rotation', icon: ICONS.transfer },
  { value: 'guides', label: 'Operator guides', icon: ICONS.profile },
  { value: 'recent', label: 'Recent changes', icon: ICONS.history },
  { value: 'maintenance', label: 'Maintenance', icon: ICONS.base },
] as const;

export default function CampaignDashboard({ catalog, historyId }: DashboardProps) {
  const router = useRouter();
  const tab = sections.find(section => section.value === router.query.tab)?.value ?? 'campaigns';
  const [openedGuides, setOpenedGuides] = useState(tab === 'guides');
  const [openedMaintenance, setOpenedMaintenance] = useState(tab === 'maintenance');
  return <><PageMeta title="Arkpedia admin" description="Edit campaigns, operator guides and published pages." path="/dashboard/campaigns" />
    <PageHeader eyebrow="Arkpedia // Editorial workspace" title="Arkpedia admin" slim compact />
    <Tabs id="dashboard" label="Admin sections" className={styles.tabStrip} options={sections} value={tab} onChange={value => {
      if (value === 'guides') setOpenedGuides(true);
      if (value === 'maintenance') setOpenedMaintenance(true);
      void router.replace({ pathname: router.pathname, query: { tab: value } }, undefined, { shallow: true, scroll: false });
    }} />
    <div {...tabPanelProps('dashboard', 'campaigns')} hidden={tab !== 'campaigns'}>
      {catalog ? <CampaignEditor key={historyId} initial={catalog} historyId={historyId} /> : <p role="alert">Campaign storage is unavailable.</p>}
    </div>
    <div {...tabPanelProps('dashboard', 'rotation')} hidden={tab !== 'rotation'}>
      <CampaignRotations active={tab === 'rotation'} />
    </div>
    <div {...tabPanelProps('dashboard', 'guides')} hidden={tab !== 'guides'}>
      {(tab === 'guides' || openedGuides) && <ContentContext.Provider value={catalog?.release ?? null}><OperatorGuides /></ContentContext.Provider>}
    </div>
    <div {...tabPanelProps('dashboard', 'recent')} hidden={tab !== 'recent'}>
      {tab === 'recent' && <RecentCampaignChanges base={catalog?.base} />}
    </div>
    <div {...tabPanelProps('dashboard', 'maintenance')} hidden={tab !== 'maintenance'}>
      {(tab === 'maintenance' || openedMaintenance) && <PageMaintenance />}
    </div></>;
}
