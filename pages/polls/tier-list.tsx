import type { GetStaticProps } from 'next';
import PageMeta from '@/components/layout/PageMeta';
import PageHeader from '@/components/ui/PageHeader';
import TierListMaker from '@/components/community/TierListMaker';
import { withContentPage } from '@/lib/content/server';
import type { TierCatalogue } from '@/lib/tier-list/catalogue';
import { TIER_LIST_STRINGS as T } from '@/lib/tier-list/strings';

interface Props { catalogue: TierCatalogue }

export default function TierListPage({ catalogue }: Props) {
  return <>
    <PageMeta title={T.title} description={T.description} path="/polls/tier-list" />
    <PageHeader slim eyebrow={T.eyebrow} title={T.title} sub={T.sub} />
    <main>
      <TierListMaker catalogue={catalogue} />
    </main>
  </>;
}

// The catalogue is compiled into the bundle (scripts/build/build-operator-search.ts), so the
// page still builds its props where a content release older than it has no page for it.
export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/polls/tier-list', async () => {
  const { tierListCatalogue } = await import('@/lib/community/catalogues');
  return { props: { catalogue: await tierListCatalogue() } };
}, { bundledWhenUnpublished: true });
