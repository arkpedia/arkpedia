import Link from 'next/link';
import { useCommunitySharing } from '@/lib/community/SharingProvider';
import { useCloudSync } from '@/lib/cloud-account/SyncProvider';

export default function CommunityContributionFooter() {
  const sharing = useCommunitySharing();
  const sync = useCloudSync();
  const contributing = !!sync.remote && !!sharing.state?.stats;

  return <div className="account-shortcuts">
    {contributing && <span>You’re currently contributing!</span>}
    <Link className="ghost btn-sm" href="/account?settings=community">
      {contributing ? 'Turn off sharing?' : 'Do you want to contribute?'}
    </Link>
  </div>;
}
