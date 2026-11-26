import dynamic from 'next/dynamic';
import type { GetStaticProps } from 'next';
import PageMeta from '@/components/layout/PageMeta';
import ModeMark from '@/components/stages/ModeMark';
import PageHeader from '@/components/ui/PageHeader';
import { CCB_TEXT as T } from '@/components/ccb/strings';
import BattleplanLoading from '@/components/ccb/BattleplanLoading';

interface BattleplanPageProps {
  catalogueUrl: string;
}

// Keep the interactive calculator out of the Worker and the archive out of Next's HTML props.
const BattleplanLoader = dynamic(() => import('@/components/ccb/BattleplanLoader'), {
  ssr: false,
  loading: () => <BattleplanLoading />,
});

export default function BattleplanPage(props: BattleplanPageProps) {
  return <>
    <PageMeta title={T.title} description="Select Contingency Contract Battleplan maps and contracts, then compare original and modified operator and enemy stats." path="/game-modes/ccb" />
    <PageHeader
      slim
      inlineTrail
      back={{ href: '/game-modes', label: 'Game Modes' }}
      eyebrow={<><ModeMark name="contingency-contract.svg" className="head-mark" />{T.eyebrow}</>}
      title={T.title}
    />
    <BattleplanLoader {...props} />
  </>;
}

export const getStaticProps: GetStaticProps<BattleplanPageProps> = async () => {
  const { readCcbManifest } = await import('@/lib/content/shippedTable');
  return { props: await readCcbManifest<BattleplanPageProps>() };
};
