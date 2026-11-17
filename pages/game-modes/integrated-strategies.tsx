import dynamic from 'next/dynamic';
import type { GetStaticProps } from 'next';
import ModeMark from '@/components/stages/ModeMark';
import PageMeta from '@/components/layout/PageMeta';
import PageHeader from '@/components/ui/PageHeader';
import type { IsTheme } from '@/components/gamemodes/IsReference';
// Its own two rules: importing the reference's stylesheet here would put that whole class map in the server file.
import styles from '@/components/gamemodes/IsReferenceLoading.module.css';

/*
 * The reference reads its records in the browser (one generated file per theme), so the
 * server has only ever rendered its frame. Its code would otherwise be compiled into the
 * Worker's one server file, which a cold start loads whole and which has a size budget
 * (scripts/audits/check-worker-bundle.mjs; next.config.js keeps the module out of the
 * server build). The server renders the heading and a placeholder of the hero's height.
 */
const IsReference = dynamic(() => import('@/components/gamemodes/IsReference'), {
  ssr: false,
  loading: () => <main className={styles.page}><p className={styles.loading} role="status">Loading Integrated Strategies…</p></main>,
});

export default function IntegratedStrategies({ themes }: { themes: IsTheme[] }) {
  return <>
    <PageMeta title="Integrated Strategies" description="Themes, stages, collectibles and special mechanics from the game data." path="/game-modes/integrated-strategies" />
    <PageHeader title="Integrated Strategies" eyebrow={<><ModeMark name="integrated-strategies.svg" className="head-mark" />Rhodes Island // Game modes</>} sub="Explore each theme’s stages, collectibles, squads and special mechanics." />
    <IsReference themes={themes} />
  </>;
}
export const getStaticProps: GetStaticProps = async () => {
  const { readPublicJson } = await import('@/lib/content/shippedTable');
  return { props: { themes: await readPublicJson('_is/manifest.json') } };
};
