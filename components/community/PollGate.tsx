import type { ReactNode } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { pollNames, type PollId, type PublicPoll } from '@/lib/polls/settings';
import { usePublicPolls } from '@/lib/polls/usePublicPolls';

export default function PollGate({ id, children }: { id: PollId; children: (poll: PublicPoll) => ReactNode }) {
  const { polls, error } = usePublicPolls(), poll = polls?.[id];
  if (poll && (poll.open || poll.results)) return <>{children(poll)}</>;
  return <><PageHeader slim eyebrow="Rhodes Island // Community Polls" back={{href:'/polls',label:'Community polls'}} title={poll ? pollNames[id] : 'Community poll'}/>
    <main><p className="notice" role="status">{error ? 'Poll availability could not be loaded.' : !polls ? 'Loading poll…' :
      poll ? 'Voting is closed. Results are hidden.' : 'This poll is unavailable.'}</p></main></>;
}
