import recordings from './menuThemeRecordings.json';
import { HOME_MUSIC_CID } from './pageMusic';
import type { SiteSettings } from '@/lib/settings/siteSettings';

/** Reviewed game background → released recording. Unknown/unreleased themes use the default. */
export function accountMenuMusic(background: string | undefined): string | null {
  return background && Object.hasOwn(recordings, background)
    ? recordings[background as keyof typeof recordings].cid : null;
}
export function menuMusicId(source: SiteSettings['menuMusicSource'], custom: string, background?: string): string {
  if (source === 'custom') return custom || HOME_MUSIC_CID;
  return source === 'account' ? accountMenuMusic(background) ?? HOME_MUSIC_CID : HOME_MUSIC_CID;
}
