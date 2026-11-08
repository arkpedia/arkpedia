import { setSetting } from '@/lib/settings/siteSettings';
import { useSiteSetting } from '@/lib/settings/useSiteSetting';

export default function MusicVisualizerSetting({ menu = false }: { menu?: boolean }) {
  const mode = useSiteSetting('musicVisualizer');
  return <label className={`check${menu ? ' site-nav-popitem' : ''}`}>
    <input type="checkbox" checked={mode === 'waves'}
      onChange={event => setSetting('musicVisualizer', event.target.checked ? 'waves' : 'spectrum')} />
    Use original visualizer waves
  </label>;
}
