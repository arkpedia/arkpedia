import type { GetStaticProps } from 'next';
import PageMeta from '@/components/layout/PageMeta';
import PullPollPage, { type PullPollProps } from '@/components/community/PullPollPage';
import { withContentPage } from '@/lib/content/server';

export default function PullOrSkip(props: PullPollProps) {
  return <PullPollPage {...props}>
    <PageMeta title="Pull or Skip poll" description="Share your next Arknights pulls. Vote by banner or choose a potential for each featured operator." path="/polls/pull-or-skip"/>
  </PullPollPage>;
}
export const getStaticProps:GetStaticProps<PullPollProps> = withContentPage<PullPollProps>('/polls/pull-or-skip',async()=>{
  const {pullPollPageCatalogue} = await import('@/lib/polls/pull-poll-catalogue');
  return {props:await pullPollPageCatalogue()};
},{bundledWhenUnpublished:true,finalize:async props=>props.portraits?props:{...props,portraits:await (await import('@/lib/polls/pull-poll-catalogue')).pullPollPortraits(props.banners)}});
