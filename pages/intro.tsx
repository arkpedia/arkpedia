import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import PageMeta from '@/components/layout/PageMeta';
import PageHeader from '@/components/ui/PageHeader';
import SiteUpdateContent from '@/components/site-updates/SiteUpdateContent';
import { siteTablesStaticProps } from '@/lib/content/server';
import styles from '@/components/site-updates/Intro.module.css';

const steps = [
  {
    title: 'Find operators and stages',
    description: 'Open Database to look up operators, enemies, stages, and skins. Use the search button in the header when you know the name.',
    action: 'Browse operators',
    href: '/operators',
  },
  {
    title: 'Plan pulls and try game modes',
    description: 'Tools brings the planners, Reward Tracker, Gacha Simulator, and Game Modes together. Guides covers farming, recruitment, and other reference pages.',
    action: 'Open Game Modes',
    href: '/game-modes',
  },
  {
    title: 'See what is happening next',
    description: 'Open Schedule to see active events and upcoming releases. The Calendar view shows their dates for your selected server.',
    action: 'Open Schedule',
    href: '/schedule',
  },
] as const;

export default function IntroPage() {
  const [index, setIndex] = useState(0);
  const title = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const step = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    title.current?.focus({ preventScroll: true });
  }, [index]);

  return <>
    <PageMeta title="Intro" description="A quick guide to finding your way around Arkpedia." path="/intro" />
    <PageHeader title="Intro" eyebrow="Arkpedia" slim />
    <main className={styles.main}>
      <section className={`panel ${styles.step}`} aria-labelledby="intro-step-title">
        <div className={styles.heading}>
          <h2 ref={title} tabIndex={-1} className="entity-title" id="intro-step-title">{step.title}</h2>
          <span className="hint" aria-label={`Step ${index + 1} of ${steps.length}`}>{index + 1} / {steps.length}</span>
        </div>
        <p>{step.description}</p>
        {index === 1 && <SiteUpdateContent content={{ title: '', body: '', major: false, images: [
          { src: '/site-updates/tools-menu-desktop.png', alt: 'The desktop Tools menu lists Gacha Simulator and Game Modes.', device: 'desktop' },
          { src: '/site-updates/tools-menu-mobile.png', alt: 'In the mobile menu, expand Tools to find Gacha Simulator and Game Modes.', device: 'mobile' },
        ] }} />}
        <div><Link className="ghost btn-sm" href={step.href}>{step.action}</Link></div>
        <div className={styles.controls}>
          {index === 0 ? <Link className="ghost btn-sm" href="/">Skip for now</Link>
            : <button className="ghost btn-sm" type="button" onClick={() => setIndex(index - 1)}>Back</button>}
          {last ? <Link className="btn primary btn-sm" href="/">Finish Intro</Link>
            : <button className="primary btn-sm" type="button" onClick={() => setIndex(index + 1)}>Next</button>}
        </div>
      </section>
    </main>
  </>;
}

export const getStaticProps = siteTablesStaticProps;
