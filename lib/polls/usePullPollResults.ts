import type {PullPollResults} from './pull-poll';
import {usePollResults} from './usePollResults';

const isPullResults=(data:PullPollResults)=>Array.isArray(data?.banners)&&Array.isArray(data.operators)&&Number.isFinite(data.ballots);
const requestResults=(signal:AbortSignal)=>fetch('/api/cloud-account/polls/pull-or-skip?view=results',{credentials:'omit',cache:'no-store',signal});
export function usePullPollResults(){
  return usePollResults(requestResults,isPullResults);
}
