import type {PullPollResults} from './pull-poll';
import {usePollResults} from './usePollResults';

const isPullResults=(data:PullPollResults)=>Array.isArray(data?.banners)&&Array.isArray(data.operators)&&Number.isFinite(data.ballots);
export function usePullPollResults(){
  return usePollResults('/api/cloud-account/polls/pull-or-skip?view=results',isPullResults);
}
