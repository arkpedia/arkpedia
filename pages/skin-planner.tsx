import { useMemo } from 'react';
import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import SkinPlanner from '@/components/skins/SkinPlanner';
import { withContentPage } from '@/lib/content/server';
import { useReaderClock } from '@/lib/time/readerClock';
import { useAccount } from '@/lib/account/accountStore';
import { useSkinPlan } from '@/lib/skins/skinPlan';
import type { PlannedSkin } from '@/lib/pulls/skins';
import type { SkinCollection } from '@/lib/pulls/skinCollections';

/*
 * The Skin Planner (Planner menu): the outfits the reader means to buy, by the event shops
 * that sell them for Originite Prime and when (components/skins/SkinPlanner), on the plan the
 * Skins page's ☆ and the Pull Planner's skin section share (lib/skins/skinPlan).
 */

interface Props {
  catalogue: PlannedSkin[];
  collections: SkinCollection[];
  /** The request's clock, unix milliseconds, rounded to the minute (contentPageClock). */
  now: number;
}

export default function SkinPlannerPage({ catalogue, collections, now }: Props) {
  const clock = useReaderClock(now);
  const today = new Date(clock).toISOString().slice(0, 10);
  const byName = useMemo(() => new Map(catalogue.map((skin) => [skin.name, skin.id])), [catalogue]);
  const [ids, setIds] = useSkinPlan((name) => byName.get(name));
  const account = useAccount();
  const owned = useMemo(() => (account ? new Set(account.skins) : null), [account]);
  return (
    <>
      <Head><title>Skin Planner — Arkpedia</title></Head>
      <PageHeader eyebrow="Rhodes Island // Skin Planner" title="Skin planner"
        sub={<>The outfits you want, by the event shop that sells them and when. The <Link prefetch={false} href="/pulls">Pull Planner</Link> sets your OP against the same plan.</>} />
      <main>
        <section className="op-section">
          <SkinPlanner catalogue={catalogue} collections={collections} today={today} ids={ids} onChange={setIds} owned={owned} />
        </section>
      </main>
    </>
  );
}

/* bundledWhenUnpublished: no release before this has /skin-planner, and on Vercel there is no
   data/ to build it from. The builder reads the skins and events compiled into the bundle and
   the shop rotations' module imports. */
export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/skin-planner', async () => {
  const [{ getAllSkins }, { getAllEvents }, { getEventCalendar }, { pullSkinCatalogue }, { pullSkinCollections, skinReleaseDates }] = await Promise.all([
    import('@/lib/skins/skins'), import('@/lib/schedule/schedule'), import('@/lib/home/frontPageContent'), import('@/lib/pulls/skins'), import('@/lib/pulls/skinCollections'),
  ]);
  const skins = getAllSkins();
  const events = getAllEvents();
  const catalogue = pullSkinCatalogue(skins, skinReleaseDates(events, skins));
  const predicted = new Set(getEventCalendar().filter((event) => event.isPredicted).map((event) => event.name));
  // `now` is the request's clock, from contentPageClock (lib/content/pageClock.ts).
  return { props: { catalogue, collections: pullSkinCollections(events, skins, catalogue, predicted) } };
}, { bundledWhenUnpublished: true });
