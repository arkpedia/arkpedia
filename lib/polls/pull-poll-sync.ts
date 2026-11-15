import {MAX_GOALS,type SavedPullPlan,type BannerGoal} from '@/lib/pulls/plan';
import {importGoals,type Ballot,type PollBanner} from './pull-poll';
export const PULL_POLL_SYNC='arkpedia.pull-poll.sync.v1';
export const PULL_PLAN_EVENT='arkpedia:pull-plan-changed';
export function emptyPullPlan():SavedPullPlan{
  return {version:1,orundum:'',originite:'',permits:'',reservedOP:'',until:'',manualEventDate:'',bannerName:'',monthlyCard:false,includeBacklog:false,annihilationDone:false,doneEvents:[],doneKeys:[],clearedReruns:[],future:{},goals:[]};
}
/** Sync acquisitions only; a planner has no representation for Maybe. Preserve its budgets and other plans. */
export function pollIntoPlanner(plan:SavedPullPlan,ballot:Ballot,banners:readonly PollBanner[]):SavedPullPlan{
  let goals=[...plan.goals];
  for(const banner of banners){
    const choices=ballot[banner.id];if(!choices||!banner.operators.length)continue;
    const index=goals.findIndex(g=>g.banner===banner.name||banner.aliases.includes(g.banner));
    const targets=banner.operators.filter(name=>(choices[name]??0)>0).map(name=>({name,copies:choices[name]}));
    if(!targets.length){if(index>=0)goals.splice(index,1);continue;}
    const previous=index>=0?goals[index]:undefined;
    const goal:BannerGoal={...previous,banner:banner.name,spendOn:banner.end,...(banner.endAt?{bannerEndAt:banner.endAt}:{}),pulls:previous?.pulls??0,targets};
    if(index>=0)goals[index]=goal;else goals.push(goal);
  }
  if(goals.length>MAX_GOALS)throw Error('Your pull planner is full. Remove a banner there before syncing more.');
  return {...plan,goals};
}
/** Planner removals clear old acquisition goals while retaining local Maybe/Not want choices. */
export function plannerIntoPoll(ballot:Ballot,plan:SavedPullPlan,banners:readonly PollBanner[]):Ballot{
  const imported=importGoals(plan.goals,banners),next:Ballot={...ballot};
  for(const banner of banners){
    const choices={...ballot[banner.id]},from=imported[banner.id];
    for(const name of banner.operators){
      if((from?.[name]??0)>0)choices[name]=from[name];
      else if((choices[name]??0)>0)choices[name]=0;
    }
    if(Object.keys(choices).length)next[banner.id]=choices;
  }
  return next;
}
