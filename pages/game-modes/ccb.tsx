import dynamic from 'next/dynamic';
import type { GetStaticProps } from 'next';
import PageMeta from '@/components/layout/PageMeta';
import ModeMark from '@/components/stages/ModeMark';
import PageHeader from '@/components/ui/PageHeader';
import { CCB_TEXT as T } from '@/components/ccb/strings';
import type { BattleplanData } from '@/lib/ccb/types';
// Its own two rules: importing the workspace's stylesheet here would put that whole class map in the server file.
import styles from '@/components/ccb/BattleplanLoading.module.css';

/*
 * The workspace is a calculator: every part of it answers to a press, the page is not
 * indexed, and its code (the contract maths, the build editor, the board) would otherwise
 * be compiled into the Worker's one server file, which a cold start loads whole
 * (scripts/audits/check-worker-bundle.mjs). So the server renders the heading and a
 * placeholder of the hub's height, and the browser loads the tool.
 */
const BattleplanWorkspace = dynamic(() => import('@/components/ccb/BattleplanWorkspace'), {
  ssr: false,
  loading: () => <main className={styles.workspace}><p className={styles.loading} role="status">{T.loading}</p></main>,
});

export default function BattleplanPage(props: BattleplanData) {
  return <>
    <PageMeta title={T.title} description="Select Contingency Contract Battleplan maps and contracts, then compare original and modified operator and enemy stats." noindex />
    <PageHeader slim eyebrow={<><ModeMark name="contingency-contract.svg" className="head-mark" />{T.eyebrow}</>} title={T.title} sub={T.sub} />
    <BattleplanWorkspace {...props} />
  </>;
}

export const getStaticProps: GetStaticProps<BattleplanData> = async () => {
  const { readPublicJson } = await import('@/lib/content/shippedTable');
  return { props: await readPublicJson<BattleplanData>('_ccb/catalogue.json') };
};
