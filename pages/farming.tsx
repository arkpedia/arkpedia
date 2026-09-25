import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Head from 'next/head';
import Image from '@/components/content/ContentImage';
import { useEffect, useMemo, useState } from 'react';
import { TIER_1_2_FOOTNOTE, LEGEND } from '@/lib/farming/farmingConfig';
import { FarmingMaterial, FarmingStage, FarmingTier } from '@/lib/farming/farmingTypes';
import { useReleaseTable } from '@/lib/content/context';
import { getFarmingWindows } from '@/lib/schedule/materialCountdown';
import { resolveEventStoreCountdown, resolveMaterialCountdowns, type FarmingWindows, type MaterialCountdown } from '@/lib/schedule/countdownWindows';

interface Props {
  /** The event windows; "NOW" and "N days" are worked out at render from `now`. */
  windows?: FarmingWindows;
  /** Releases exported before `windows`: the countdowns as they stood at that export. */
  countdowns?: Record<string, MaterialCountdown>;
  eventStoreCountdown?: MaterialCountdown | null;
  /** The request's clock (contentPageClock), shared by the server render and hydration. */
  now: number;
}

export default function FarmingPage({ windows, countdowns: exportedCountdowns, eventStoreCountdown: exportedEventStoreCountdown, now }: Props) {
  const [openTier, setOpenTier] = useState<1 | 2 | 3 | null>(null);
  const countdowns = useMemo(() => windows ? resolveMaterialCountdowns(windows, now) : exportedCountdowns ?? {}, [windows, exportedCountdowns, now]);
  const eventStoreCountdown = useMemo(() => windows ? resolveEventStoreCountdown(windows, now) : exportedEventStoreCountdown ?? null, [windows, exportedEventStoreCountdown, now]);

  // Table fades in first, then the accordion opens itself shortly after --
  // matches the fade-in's own animation duration so the "self-opening"
  // effect reads as one continuous reveal rather than two disconnected
  // animations.
  useEffect(() => {
    const timer = setTimeout(() => setOpenTier(3), 650);
    return () => clearTimeout(timer);
  }, []);

  // The guide itself is a game record: the release's data/farming-tiers.json, in props.
  const [tier1, tier2, tier3] = useReleaseTable<FarmingTier[]>('farming-tiers');
  const tiers = [
    { n: 3 as const, tier: tier3 },
    { n: 2 as const, tier: tier2 },
    { n: 1 as const, tier: tier1 },
  ];

  // Builds the stages to actually display for a material. For Event
  // Store materials, this UPDATES the existing "Event Store" entry with
  // the real countdown rather than adding a second one (that was the
  // duplication bug). For other materials, a genuinely new stage gets
  // prepended, since there's no existing entry for that specific event
  // stage code to update.
  function displayStagesFor(material: FarmingMaterial): FarmingStage[] {
    const isEventStore = material.stages.some((s) => s.label === 'Event Store');
    if (isEventStore) {
      if (!eventStoreCountdown) return material.stages;
      return material.stages.map((s) =>
        s.label === 'Event Store' ? { ...s, countdown: eventStoreCountdown.text } : s
      );
    }
    const countdown = countdowns[material.name];
    if (countdown?.stageCode) {
      const extraStage: FarmingStage = { label: countdown.stageCode, kind: 'eventActive', countdown: countdown.text };
      return [extraStage, ...material.stages];
    }
    return material.stages;
  }

  return (
    <>
      <Head><title>Farming Guide — Arkpedia</title></Head>

      <header>
        <div className="eyebrow">Rhodes Island // Logistics Support</div>
        <h1>Farming Guide</h1>
      </header>

      <main className="farming-main">
        <div className="farming-legend farming-legend-top">
          {LEGEND.map((item) => (
            <p key={item.kind}>
              <span className={`farming-legend-label farming-kind-${item.kind}`}>{item.label}</span>{' '}
              {item.rest}
            </p>
          ))}
        </div>

        <div className="farming-accordion farming-table-enter">
          {tiers.map(({ n, tier }) => {
            const isOpen = openTier === n;
            return (
              <div key={n} className={`farming-accordion-section${isOpen ? ' open' : ''}`}>
                <button type="button" className="farming-accordion-header" onClick={() => setOpenTier(n)}>
                  <span>Tier {n}</span>
                  <span className="farming-accordion-arrow">{isOpen ? '▾' : '▸'}</span>
                </button>

                <div className={`farming-accordion-body-wrap${isOpen ? ' open' : ''}`}>
                  <div className="farming-accordion-body">
                    <div className={`farming-tile-grid farming-tile-grid-open${n === 3 ? ' farming-tile-grid-t3' : ''}`}>
                      {tier.materials.map((m) => (
                        <MaterialTile key={m.name} material={m} stages={displayStagesFor(m)} />
                      ))}
                    </div>
                    {n <= 2 && <div className="farming-footnote">{TIER_1_2_FOOTNOTE}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}

function MaterialTile({ material, stages }: { material: FarmingMaterial; stages: FarmingStage[] }) {
  return (
    <div className="farming-tile farming-tile-open" title={material.name}>
      <Image src={material.icon} alt={material.name} className="farming-material-icon farming-material-icon-open" width={96} height={96} quality={85} style={{ width: 44, height: 44 }} />
      <p className="farming-material-name-open">{material.name}</p>
      <div className="farming-stage-chips">
        {stages.map((s, i) => (
          <span key={i} className="farming-stage-wrap">
            {s.countdown && (
              <span className={s.countdown === 'NOW' ? 'farming-countdown farming-countdown-now' : 'farming-countdown'}>
                {s.countdown}
              </span>
            )}
            <span className={`farming-stage-chip farming-kind-${s.kind}`} title={s.fullLabel || s.label}>
              {s.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/farming", async () => {
  return {
    props: {
      windows: getFarmingWindows(),
    },
  };
}, {
  tables: {
    'farming-tiers': async () => (await import('@/data/farming-tiers.json')).default,
  },
});