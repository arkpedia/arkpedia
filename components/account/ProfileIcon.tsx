import { ApplicationImage, ApplicationArt, type ApplicationAsset } from '@/components/content/ContentImage';
import revisions from '@/data/assets/revisions.json';
import folders from '@/config/asset-folders.json';

/** Monochrome game emblems follow the current ink, including in the light theme. */
export default function ProfileIcon({ id, size }: { id: string; size: number }) {
  const repository = folders['arkpedia-skin-assets'].includes(id.split('/')[0]) ? 'arkpedia-skin-assets' : 'arkpedia-image-assets';
  const asset: ApplicationAsset = { repository, revision: revisions[repository], path: id };
  return /^(faction-icons|alliance-icons|nation-marks|class-icons|branch-icons|stat-icons|enemy-stat-icons)\//.test(id)
    ? <ApplicationArt asset={asset} aria-hidden="true" className="profile-avatar-glyph" style={{ width: size, height: size }} />
    : <ApplicationImage asset={asset} alt="" width={size} height={size} className="profile-avatar-image" />;
}
