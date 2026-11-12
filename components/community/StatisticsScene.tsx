import { useEffect, useRef, useState } from 'react';
import ResponsiveSkinArtwork from '@/components/skins/ResponsiveSkinArtwork';
import type { CommunityRankings } from '@/lib/community/rankings';
import type { RankingRow } from './statisticsModel';
import styles from './StatisticsRankings.module.css';

const REDUCED = '(prefers-reduced-motion: reduce)';
const motionAllowedNow = () => typeof window !== 'undefined' && !window.matchMedia(REDUCED).matches;

/** False on the server and for a reader who asked for less motion; true once mounted otherwise. */
function useMotionAllowed(): boolean {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(REDUCED);
    const update = () => setAllowed(!query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return allowed;
}

/** A number that counts up to its value (from the value it last showed) over `duration` ms,
 *  easing out, and takes its final value at once under reduced motion. The box reserves the
 *  width of the final text in ch, so the digits never move what is beside them. */
export function CountUp({ value, format, duration = 900 }: { value: number; format: (value: number) => string; duration?: number }) {
  const [shown, setShown] = useState(() => (motionAllowedNow() ? 0 : value));
  const painted = useRef(shown);
  useEffect(() => {
    if (!motionAllowedNow()) { painted.current = value; setShown(value); return; }
    const start = performance.now(), from = painted.current, delta = value - from, whole = Number.isInteger(value);
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / duration), eased = 1 - (1 - t) ** 3;
      const next = t < 1 ? from + delta * eased : value;
      painted.current = next;
      setShown(whole ? Math.round(next) : next);
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    // A tab in the background gets no animation frames: the number lands on time regardless.
    const settle = setTimeout(() => { cancelAnimationFrame(frame); painted.current = value; setShown(value); }, duration + 400);
    return () => { cancelAnimationFrame(frame); clearTimeout(settle); };
  }, [value, duration]);
  return <span className={styles.count} style={{ minWidth: `${format(value).length}ch` }}>{format(shown)}</span>;
}

/** Stagger the six ranking cards once their content arrives. This changes paint only;
 * every card remains in the layout and available to readers throughout. */
export function useStaggerReveal<T extends HTMLElement>(key: string) {
  const ref = useRef<T>(null), motion = useMotionAllowed();
  useEffect(() => {
    const root = ref.current;
    if (!motion || !root) return;
    root.setAttribute('data-stats-live', '');
    root.querySelectorAll<HTMLElement>('[data-stats-reveal]').forEach((el, i) => {
      el.style.setProperty('--stats-i', String(i));
      el.dataset.statsReveal = 'in';
    });
    return () => { root.removeAttribute('data-stats-live'); };
  }, [key, motion]);
  return ref;
}

const sum = (rows: RankingRow[] | undefined) => (rows ?? []).reduce((total, row) => total + row.count, 0);

/** The band above the cards: three totals that count up, and the illustration of the operator
 *  leading the section's first ranking. One height in every state (loading, unavailable, roster,
 *  operator usage), so the data arriving or the tab changing never moves the cards below it. */
export function StatisticsHero({ data, battle, rankings, lead, leadLabel }: { data: CommunityRankings | null; battle: boolean; rankings: Map<string, RankingRow[]>; lead: RankingRow | undefined; leadLabel: string }) {
  const rosterReady=data?.roster!=null,replayReady=data?.battles!=null;
  const eligibleIds=new Set((rankings.get('deployed')??[]).flatMap(row=>row.operator?.charIds??[]));
  const deployments=replayReady?data.battles!.filter(row=>eligibleIds.has(row.charId)).reduce((n,row)=>n+row.deployments,0):null;
  const totals=battle
    ? [{label:'Contributors',value:data?.replayContributors??null},{label:'Saved runs',value:data?.replays??null},{label:'Deployments',value:deployments}]
    : [{label:'Contributors',value:data?.contributors??null},{label:'6★ operators',value:rosterReady?(rankings.get('owned')??[]).length:null},{label:'E2 promotions',value:rosterReady?sum(rankings.get('e2')):null}];
  return <section className={`panel ${styles.hero}`} aria-label="Community totals">
    <dl className={styles.heroStats}>{totals.map((total) => <div key={total.label} className={styles.heroStat}>
      <dt className={styles.heroLabel}>{total.label}</dt>
      <dd className={styles.heroNumber}>{total.value === null ? <span className={styles.count}>—</span> : <CountUp value={total.value} format={(v) => v.toLocaleString('en-US')} />}</dd>
    </div>)}</dl>
    <div className={styles.heroArt} data-stats-hero-art>{lead?.entity.art && <ResponsiveSkinArtwork key={lead.entity.name} src={lead.entity.art} alt="" sizes="360px" className={styles.heroImage} />}</div>
    {lead && <p className={styles.heroCaption}><span className="eyebrow">{leadLabel}</span><strong className="entity-title entity-title-sm entity-title-name">{lead.entity.name}</strong></p>}
  </section>;
}
