import { useSyncExternalStore } from 'react';
import { getSetting, subscribeSettings, SETTINGS_DEFAULTS, type SettingKey } from './siteSettings';
export function useSiteSetting<K extends SettingKey>(key: K) {
  return useSyncExternalStore(subscribeSettings, () => getSetting(key), () => SETTINGS_DEFAULTS[key]);
}
