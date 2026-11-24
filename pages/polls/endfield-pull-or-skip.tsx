import PullPollPage from '@/components/community/PullPollPage';
import PageMeta from '@/components/layout/PageMeta';
import { ENDFIELD_POLL, endfieldBanners } from '@/lib/polls/endfield';

export default function EndfieldPullOrSkip() {
  return <PullPollPage edition={ENDFIELD_POLL} banners={endfieldBanners} now={0}>
    <PageMeta title="Pull or Skip · Endfield" description="Vote on the nine operators in the official Endfield reveal." path="/polls/endfield-pull-or-skip" noindex/>
  </PullPollPage>;
}
