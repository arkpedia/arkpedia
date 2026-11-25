import type {PullPollResults} from './pull-poll';
import {usePollResults} from './usePollResults';

const isPullResults=(data:PullPollResults)=>Array.isArray(data?.banners)&&Array.isArray(data.operators)&&Number.isFinite(data.ballots);
const requestResults=(signal:AbortSignal)=>fetch('/api/cloud-account/polls/pull-or-skip?view=results',{credentials:'omit',cache:'no-store',signal});
const requestEndfieldResults=(signal:AbortSignal)=>fetch('/api/cloud-account/polls/endfield-pull-or-skip?view=results',{credentials:'omit',cache:'no-store',signal});
export function usePullPollResults(edition: 'pull-or-skip' | 'endfield-pull-or-skip' = 'pull-or-skip'){
  return usePollResults(edition === 'endfield-pull-or-skip' ? requestEndfieldResults : requestResults,isPullResults);
}
