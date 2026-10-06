import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import DataLink from '@/components/account/DataLink';
import { PastRewards } from '@/components/pulls/PastRewards';
import { withContentPage } from '@/lib/content/server';
import { formatNumber, formatOneDecimal } from '@/lib/pulls/format';
import { fillFromDeployment, ORUNDUM_PER_ORIGINITE, ORUNDUM_PER_PULL, type BacklogSources } from '@/lib/pulls/pulls';
import { usePastRewards } from '@/lib/pulls/usePastRewards';

/*
 * The OP Tracker (the Planner menu): every first-clear reward the game still owes the
 * reader -- the main story's and the playable events' Originite Prime, the resource stages',
 * and Annihilation's Orundum -- as its own page, the way the Skin Planner is the Pull
 * Planner's skin section on its own. The ticks are the ones the Pull Planner's Past events
 * popup shows (lib/pulls/usePastRewards.ts): one list, two places to keep it.
 */

interface Props {
  /** The release's back catalogue (lib/pulls/sources.ts), as /pulls carries it. */
  backlogSources: BacklogSources;
}

export default function FreeOpPage({ backlogSources }: Props) {
  const past = usePastRewards(backlogSources);
  const { originitePrime, annihilationOrundum } = past.remaining;
  const pulls = (originitePrime * ORUNDUM_PER_ORIGINITE + annihilationOrundum) / ORUNDUM_PER_PULL;
  return (
    <>
      <Head><title>OP Tracker — Arkpedia</title></Head>
      <PageHeader eyebrow="Rhodes Island // OP Tracker" title="OP Tracker"
        sub={<>The Originite Prime and Orundum the game still owes you for first clears. The <Link prefetch={false} href="/pulls">Pull Planner</Link> counts the same list into your forecast.</>}
        actions={<DataLink />} />
      <main>
        <section className="op-section" aria-labelledby="free-op-left">
          <h2 id="free-op-left">Still to claim</h2>
          <dl className="free-op-summary">
            <div><dt>Originite Prime</dt><dd>{formatNumber(originitePrime)}</dd></div>
            <div><dt>Orundum from Annihilation</dt><dd>{formatNumber(annihilationOrundum)}</dd></div>
            <div><dt>Worth, in pulls</dt><dd>{formatOneDecimal(pulls)}</dd></div>
          </dl>
        </section>
        <PastRewards backlog={past.counting} doneKeys={past.doneKeys} doneEvents={past.doneEvents} annihilationDone={past.annihilationDone}
          onKeys={past.onKeys} onEvents={past.onEvents} onAnnihilation={past.onAnnihilation} imported={past.imported} cleared={past.cleared} layout="page" />
      </main>
    </>
  );
}

/* bundledWhenUnpublished: no release before this has /free-op, and on Vercel there is no data/
   to build it from. The builder reads only the back catalogue compiled into the bundle (JSON
   imports). finalize fills what an older release lacks, as /pulls does. */
export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/free-op', async () => {
  const { bundledBacklogSources } = await import('@/lib/pulls/sources');
  return { props: { backlogSources: bundledBacklogSources() } };
}, {
  bundledWhenUnpublished: true,
  finalize: async (props) => {
    const { bundledBacklogSources } = await import('@/lib/pulls/sources');
    return { ...props, backlogSources: fillFromDeployment(props.backlogSources, bundledBacklogSources()) };
  },
});
