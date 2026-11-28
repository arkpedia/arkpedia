import type { GetStaticProps } from 'next';
import { useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import PageMeta from '@/components/layout/PageMeta';
import ReleaseQueue from '@/components/dashboard/ReleaseQueue';
import { releaseQueueDemo, releaseQueueDemoKey } from '@/components/dashboard/releaseQueueDemo';

export default function ReleaseQueuePreview() {
  const [sampleRevision, setSampleRevision] = useState(0);
  return <>
    <PageMeta title="Release queue preview" description="Try reviewing and publishing a sample Arkpedia release." noindex />
    <PageHeader eyebrow="Arkpedia // Editorial workspace" title="Releases" slim compact actions={
      <button type="button" className="ghost btn-sm" onClick={() => {
        sessionStorage.removeItem(releaseQueueDemoKey);
        setSampleRevision(revision => revision + 1);
      }}>Reset demo</button>
    } />
    <ReleaseQueue key={sampleRevision} client={releaseQueueDemo} demo />
  </>;
}

export const getStaticProps: GetStaticProps = () =>
  process.env.ARKPEDIA_PREVIEW === '1' || process.env.NODE_ENV === 'development'
    ? { props: {} } : { notFound: true };
