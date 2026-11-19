import type { GetStaticProps } from 'next';
import PageMeta from '@/components/layout/PageMeta';
import PageHeader from '@/components/ui/PageHeader';
import ChartMaker from '@/components/community/ChartMaker';
import { withContentPage } from '@/lib/content/server';
import type { TierCatalogue } from '@/lib/tier-list/catalogue';
import { CHART_STRINGS as C } from '@/lib/tier-list/chartStrings';

interface Props { catalogue: TierCatalogue }

export default function ChartMakerPage({ catalogue }: Props) {
  return <>
    <PageMeta title={C.title} description={C.description} path="/polls/chart-maker" />
    <PageHeader slim eyebrow={C.eyebrow} title={C.title} sub={C.sub} />
    <main>
      <ChartMaker catalogue={catalogue} />
    </main>
  </>;
}

// The Tier List maker's catalogue (scripts/build/build-operator-search.ts), compiled into the
// bundle, so the page builds its props where a content release older than it has no page for it.
export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/polls/chart-maker', async () => {
  const { tierListCatalogue } = await import('@/lib/community/catalogues');
  return { props: { catalogue: await tierListCatalogue() } };
}, { bundledWhenUnpublished: true });
