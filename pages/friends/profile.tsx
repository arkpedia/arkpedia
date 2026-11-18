import { useMemo, useState } from 'react';
import type { GetStaticProps } from 'next';
import { useRouter } from 'next/router';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import PageMeta from '@/components/layout/PageMeta';
import { SharedProfileContent } from '@/components/friends/SharedProfile';
import { useSharedFriend, useSharedFriends } from '@/lib/friends/useSharedFriends';
import { isFriendLinkId } from '@/lib/friends/sharedProfile';
import { friendOperators, type FriendOperator, type FriendSkin } from '@/lib/account/friendCatalogue';
import { withFriendDynamicArt } from '@/lib/skins/dynamicArtFallback';
import { withContentPage } from '@/lib/content/server';
import { useReleaseTable } from '@/lib/content/context';
import { DATA_DIALOG_TABLES, fillAccountMap } from '@/lib/content/dataDialogTables';
import type { GameAccountMap } from '@/lib/planner/gameAccount';

interface Props {operators?:FriendOperator[];skins:FriendSkin[]}
export default function PublicFriendPage({operators,skins}:Props) {
  const router=useRouter(),map=useReleaseTable<GameAccountMap>('game-account-map');
  const id=router.isReady&&typeof router.query.id==='string'?router.query.id:null;
  const catalogue=useMemo(()=>operators??friendOperators(map,[]),[operators,map]);
  const {record,error,retry}=useSharedFriend(id,true),friends=useSharedFriends(false);
  const [message,setMessage]=useState('');
  const importedAt=record?.profile?.account.importedAt;
  return <>
    <PageMeta title={record?`${record.player.friendTag} · Shared profile`:'Shared profile'} description="An explicitly shared Arknights profile, collection and recorded builds." path="/friends/profile" noindex />
    <PageHeader eyebrow="Rhodes Island // Following" title={record?.player.friendTag??'Shared profile'} sub={importedAt&&<>Last imported <time dateTime={importedAt}>{new Date(importedAt).toLocaleDateString(undefined,{dateStyle:'medium'})}</time></>}
      actions={<><Link className="btn btn-sm" href="/account?panel=following">Following</Link>
        {record?.followingAllowed&&id&&<button type="button" className="btn-sm" disabled={friends.ids.includes(id)} onClick={()=>{try{friends.add(id);setMessage('Following this player in this browser.');}catch(reason){setMessage(reason instanceof Error?reason.message:'This browser could not follow this player.');}}}>{friends.ids.includes(id)?'Following':'Follow'}</button>}
      </>} />
    <main>
      {record?<SharedProfileContent record={record} operators={catalogue} skins={skins} standalone />:error?<div className="waiting-box"><h2>Profile unavailable</h2><p role="alert">{error}</p><button type="button" className="btn-sm" onClick={retry}>Retry</button></div>:router.isReady&&!isFriendLinkId(id)?<div className="waiting-box"><h2>Choose a shared profile link</h2><p>Find a player in Following, or open the profile link they shared with you.</p></div>:<p role="status">Checking shared profile…</p>}
      {message&&<p role="status">{message}</p>}
    </main>
  </>;
}
export const getStaticProps:GetStaticProps<Props>=withContentPage<Props>('/friends/profile',async()=>{
  const {accountCatalogue}=await import('@/lib/community/catalogues');
  return {props:await withFriendDynamicArt(await accountCatalogue())};
},{bundledWhenUnpublished:true,tables:{'game-account-map':DATA_DIALOG_TABLES['game-account-map']},finalize:async props=>withFriendDynamicArt(await fillAccountMap(props))});
