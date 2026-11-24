import type { PublicPoll } from '@/lib/polls/settings';

export default function PollTiming({poll}: {poll: PublicPoll}) {
  if (poll.closesAt === null) return null;
  const date = new Date(poll.closesAt);
  return <p className="hint">{poll.open ? 'Voting closes' : 'Voting closed'}{' '}
    <time dateTime={date.toISOString()}>{date.toLocaleString(undefined, {year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short'})}</time>.
    {poll.resultsAfterClose && <><br/>Results will appear after voting closes.</>}
  </p>;
}
