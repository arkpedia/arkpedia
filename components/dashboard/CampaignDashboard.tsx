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
import ReleaseQueue, { type ReleaseQueueClient } from '@/components/dashboard/ReleaseQueue';
import styles from '@/components/dashboard/CampaignEditor.module.css';
import CampaignEditor, { type Catalog } from '@/components/dashboard/CampaignEditor';
import PageHeader from '@/components/ui/PageHeader';

export interface DashboardProps { catalog: Catalog | null; historyId?: string; sample?: boolean; sampleReleases?: ReleaseQueueClient }

const sections = [
  { value: 'campaigns', label: 'Ad Campaigns', icon: ICONS.grid },
  { value: 'guides', label: 'Operator guides', icon: ICONS.profile },
  { value: 'polls', label: 'Polls', icon: ICONS.polls },
  { value: 'visibility', label: 'Page visibility', icon: ICONS.grid },
  { value: 'releases', label: 'Releases', icon: ICONS.history },
  { value: 'maintenance', label: 'Maintenance', icon: ICONS.base },
] as const;

const campaignViews = [
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'rotation', label: 'Rotation' },
  { value: 'recent', label: 'Recent changes' },
] as const;

const releaseViews = [
  { value: 'queue', label: 'Queue' },
  { value: 'announcements', label: 'Announcements' },
] as const;

const reviewSections = sections.filter(section => section.value === 'campaigns' || section.value === 'releases');

export default function CampaignDashboard({ catalog, historyId, sample = false, sampleReleases }: DashboardProps) {
  const router = useRouter();
  const view = router.query.tab;
  const options = sample ? reviewSections : sections;
  const tab = view === 'updates' ? 'releases' : options.find(section => section.value === view)?.value ?? 'campaigns';
  const campaignView = campaignViews.find(option => option.value === view)?.value ?? 'campaigns';
  const releaseView = view === 'updates' || router.query.view === 'announcements' ? 'announcements' : 'queue';
  const announcementsActive = tab === 'releases' && releaseView === 'announcements';
  const queueActive = tab === 'releases' && releaseView === 'queue';
  const [openedGuides, setOpenedGuides] = useState(tab === 'guides');
  const [openedAnnouncements, setOpenedAnnouncements] = useState(announcementsActive);
  const [openedQueue, setOpenedQueue] = useState(queueActive);
  const [openedMaintenance, setOpenedMaintenance] = useState(tab === 'maintenance');

  function selectView(value: string, subview?: 'queue' | 'announcements') {
    // Keep in-progress drafts and release notes when switching sections.
    if (announcementsActive) setOpenedAnnouncements(true);
    if (queueActive) setOpenedQueue(true);
    const query = subview === 'announcements' ? { tab: value, view: subview } : { tab: value };
    void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false });
  }

  const title = sample ? 'Admin Preview' : 'Arkpedia admin';
  return <>
    <PageHeader eyebrow="Arkpedia // Editorial workspace" title={title} slim compact />
    {sample && <div className={styles.workspace}><p className="notice">This Preview uses sample data. Draft edits stay in this tab.</p></div>}
    <Tabs id="dashboard" label="Admin sections" className={styles.tabStrip} options={options} value={tab} onChange={value => {
      if (value === 'guides') setOpenedGuides(true);
      if (value === 'maintenance') setOpenedMaintenance(true);
      selectView(value);
    }} />
    <div {...tabPanelProps('dashboard', 'campaigns')} hidden={tab !== 'campaigns'}>
      <Tabs id="dashboard-campaigns" label="Ad campaign views" className={`${styles.tabStrip} ${styles.subTabs}`}
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
    <div {...tabPanelProps('dashboard', 'releases')} hidden={tab !== 'releases'}>
      <Tabs id="dashboard-releases" label="Release views" className={`${styles.tabStrip} ${styles.subTabs}`}
        options={releaseViews} value={releaseView} onChange={value => selectView('releases', value)} />
      <div {...tabPanelProps('dashboard-releases', 'queue')} hidden={releaseView !== 'queue'}>
        {(queueActive || openedQueue) && <ReleaseQueue client={sampleReleases} demo={sample} />}
      </div>
      <div {...tabPanelProps('dashboard-releases', 'announcements')} hidden={releaseView !== 'announcements'}>
        {(announcementsActive || openedAnnouncements) && <SiteUpdates active={announcementsActive} />}
      </div>
    </div>
    <div {...tabPanelProps('dashboard', 'maintenance')} hidden={tab !== 'maintenance'}>
      {(tab === 'maintenance' || openedMaintenance) && <PageMaintenance />}
    </div></>;
}
