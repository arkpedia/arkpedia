import type { ReactNode } from 'react';
import FriendCard, { FriendSupports } from './FriendCard';
import { avatarSources, profileArtPath } from '@/lib/account/portraits';
import type { FriendOperator } from '@/lib/account/friendCatalogue';
import { SERVERS } from '@/lib/account-import/yostar';
import { playerSupportUnits } from '@/lib/community/supportUnits';
import type { SharedFriendSummary } from '@/lib/friends/sharedProfile';
import type { GameAccountMap } from '@/lib/planner/gameAccount';

export default function SharedFriendCard({summary,map,operators,actions,onOpen}:{summary:SharedFriendSummary;map:GameAccountMap;operators:FriendOperator[];actions:ReactNode;onOpen:()=>void}) {
  const row=summary.player,appearance=row.appearance,card=appearance?.nameCard??'nc_rhodes_default',variants=map.nameCardVariants?.[card];
  const strip=`${card}-strip${variants?`-${Math.min(appearance?.nameCardVariant??0,variants-1)}`:''}`;
  return <FriendCard name={row.friendTag} avatar={avatarSources(appearance??{},map.chars,new Map())[0]} background={profileArtPath('profile-namecards',strip)}
    onProfile={onOpen} profileLabel={`View ${row.friendTag} shared profile`}
    metadata={<><span className="hint">{SERVERS[row.server].label}{appearance?.level?` · Level ${appearance.level}`:''} · {row.slots??0} open slots</span><span className="hint">{summary.collectionShared?'Shared collection':'Supports only'} · Imported {new Date(row.importedAt).toLocaleDateString()}</span></>}
    supports={<FriendSupports units={playerSupportUnits(row,operators)} map={map} />} actions={actions} />;
}
