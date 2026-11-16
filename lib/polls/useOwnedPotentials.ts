import {useEffect,useState} from 'react';
import {useAccount,ACCOUNT_EVENT} from '@/lib/account/accountStore';
import {readRoster,ROSTER_EVENT} from '@/lib/planner/roster';
import type {OwnedPotentials,PollPortrait} from './pull-poll';
/** Account imports and accepted cloud restores share the browser's roster. */
export function useOwnedPotentials(portraits:Record<string,PollPortrait>):OwnedPotentials{
  const account=useAccount(),[owned,setOwned]=useState<OwnedPotentials>({});
  useEffect(()=>{
    const refresh=()=>{const roster=account?.operatorBuilds??readRoster();setOwned(Object.fromEntries(Object.entries(portraits).flatMap(([name,portrait])=>{
      const record=roster[name]??portrait.charIds?.map(id=>roster[id]).find(Boolean);
      const has=!!account?.operatorBuilds?.[name]||account?.operators.includes(name)||portrait.charIds?.some(id=>account?.operatorIds?.includes(id));
      return has?[[name,record?.potential??1]]:[];
    })));};
    refresh();const events=[ROSTER_EVENT,ACCOUNT_EVENT,'arkpedia:cloud-restored','storage','focus'];for(const event of events)window.addEventListener(event,refresh);
    return()=>{for(const event of events)window.removeEventListener(event,refresh);};
  },[account,portraits]);return owned;
}
