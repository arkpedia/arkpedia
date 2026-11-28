import { useState } from 'react';
import { useRouter } from 'next/router';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import { ContentContext } from '@/lib/content/context';
import { ICONS } from '@/components/layout/NavIcons';
import CampaignRotations from '@/components/dashboard/CampaignRotations';
import OperatorGuides from '@/components/dashboard/OperatorGuides';
import RecentCampaignChanges from '@/components/dashboard/RecentCampaignChanges';
import PollControls from '@/components/dashboard/PollControls';
import PageMaintenance from '@/components/dashboard/PageMaintenance';
import PageVisibility from '@/components/dashboard/PageVisibility';
import SiteUpdates from '@/components/dashboard/SiteUpdates';
import ReleaseQueue from '@/components/dashboard/ReleaseQueue';
import styles from '@/components/dashboard/CampaignEditor.module.css';
import PageMeta from '@/components/layout/PageMeta';
import CampaignEditor, { type Catalog } from '@/components/dashboard/CampaignEditor';
import PageHeader from '@/components/ui/PageHeader';

export interface DashboardProps { catalog: Catalog | null; historyId?: string; sample?: boolean }


const sections = [
  { value: 'campaigns', label: 'Ad Campaigns', icon: ICONS.grid },
  { value: 'guides', label: 'Operator guides', icon: ICONS.profile },
  { value: 'polls', label: 'Polls', icon: ICONS.polls },
  { value: 'visibility', label: 'Page visibility', icon: ICONS.grid },
  { value: 'updates', label: 'Site updates', icon: ICONS.changelog },
  { value: 'releases', label: 'Releases', icon: ICONS.history },
  { value: 'maintenance', label: 'Maintenance', icon: ICONS.base },
] as const;

const campaignViews = [
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'rotation', label: 'Rotation' },
  { value: 'recent', label: 'Recent changes' },
] as const;

const reviewSections = sections.filter(section => section.value === 'campaigns' || section.value === 'updates');

export default function CampaignDashboard({ catalog, historyId, sample = false }: DashboardProps) {
  const router = useRouter();
  const view = router.query.tab;
  const options = sample ? reviewSections : sections;
  const tab = options.find(section => section.value === view)?.value ?? 'campaigns';
  const campaignView = campaignViews.find(option => option.value === view)?.value ?? 'campaigns';
  const [openedGuides, setOpenedGuides] = useState(tab === 'guides');
  const [openedUpdates, setOpenedUpdates] = useState(tab === 'updates');
  const [openedMaintenance, setOpenedMaintenance] = useState(tab === 'maintenance');

  function selectView(value: string) {
    void router.replace({ pathname: router.pathname, query: { tab: value } }, undefined, { shallow: true, scroll: false });
  }

  const title = sample ? 'Admin Preview' : 'Arkpedia admin';
  return <><PageMeta title={title} description="Edit campaigns, operator guides and published pages." path={router.pathname} noindex={sample} />
    <PageHeader eyebrow="Arkpedia // Editorial workspace" title={title} slim compact />
    {sample && <div className={styles.workspace}><p className="notice">This Preview uses sample campaign data. Draft edits stay in this tab.</p></div>}
    <Tabs id="dashboard" label="Admin sections" className={styles.tabStrip} options={options} value={tab} onChange={value => {
      if (value === 'guides') setOpenedGuides(true);
      if (value === 'updates') setOpenedUpdates(true);
      if (value === 'maintenance') setOpenedMaintenance(true);
      selectView(value);
    }} />
    <div {...tabPanelProps('dashboard', 'campaigns')} hidden={tab !== 'campaigns'}>
      <Tabs id="dashboard-campaigns" label="Ad campaign views" className={`${styles.tabStrip} ${styles.campaignTabs}`}
        options={campaignViews} value={campaignView} onChange={selectView} />
      <div {...tabPanelProps('dashboard-campaigns', 'campaigns')} hidden={campaignView !== 'campaigns'}>
        {catalog ? <CampaignEditor key={historyId} initial={catalog} historyId={historyId} /> : <p role="alert">Campaign storage is unavailable.</p>}
      </div>
      <div {...tabPanelProps('dashboard-campaigns', 'rotation')} hidden={campaignView !== 'rotation'}>
        <CampaignRotations active={tab === 'campaigns' && campaignView === 'rotation'} />
      </div>
      <div {...tabPanelProps('dashboard-campaigns', 'recent')} hidden={campaignView !== 'recent'}>
        {tab === 'campaigns' && campaignView === 'recent' && <RecentCampaignChanges base={catalog?.base} historyPath={router.pathname} />}
      </div>
    </div>
    <div {...tabPanelProps('dashboard', 'guides')} hidden={tab !== 'guides'}>
      {(tab === 'guides' || openedGuides) && <ContentContext.Provider value={catalog?.release ?? null}><OperatorGuides /></ContentContext.Provider>}
    </div>
    <div {...tabPanelProps('dashboard', 'polls')} hidden={tab !== 'polls'}>
      {tab === 'polls' && <PollControls />}
    </div>
    <div {...tabPanelProps('dashboard', 'visibility')} hidden={tab !== 'visibility'}>
      {tab === 'visibility' && <PageVisibility />}
    </div>
    <div {...tabPanelProps('dashboard', 'updates')} hidden={tab !== 'updates'}>
      {(tab === 'updates' || openedUpdates) && <SiteUpdates />}
    </div>
    <div {...tabPanelProps('dashboard', 'releases')} hidden={tab !== 'releases'}>
      {tab === 'releases' && <ReleaseQueue />}
    </div>
    <div {...tabPanelProps('dashboard', 'maintenance')} hidden={tab !== 'maintenance'}>
      {(tab === 'maintenance' || openedMaintenance) && <PageMaintenance />}
    </div></>;
}
