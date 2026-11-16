import references from '@/config/pull-poll-art.json';
import type {ApplicationAsset} from '@/components/content/ContentImage';
import type {PollBanner} from './pull-poll';
/** Code-owned illustrations supplied by the design reference, until the live catalogue adopts them. */
export function applicationBannerArt(banner:PollBanner):ApplicationAsset|null{
  if(banner.image)return null;
  const name=banner.name.replace(/^\[[^\]]*\]\s*/,'');
  return (references as Record<string,ApplicationAsset>)[name]??null;
}
