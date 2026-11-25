import references from '@/config/pull-poll-art.json';
import type {ApplicationAsset} from '@/components/content/ContentImage';
import type {PollBanner} from './pull-poll';
/** Poll-specific artwork takes precedence when marked preferred. Other references fill missing catalogue images. */
export function applicationBannerArt(banner:PollBanner):ApplicationAsset|null{
  const name=banner.name.replace(/^\[[^\]]*\]\s*/,'');
  const art=(references as Record<string,ApplicationAsset & {preferred?:boolean}>)[name];
  return art && (!banner.image || art.preferred) ? art : null;
}
