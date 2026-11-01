import { fetchAsset } from '@/lib/assets/assetRetry';
import { useEffect, useState } from 'react';
import { useContentUrl } from '@/lib/content/context';
import { useAccount } from '@/lib/account/accountStore';
import { setSetting, type SiteSettings } from '@/lib/settings/siteSettings';
import { useSiteSetting } from '@/lib/settings/useSiteSetting';
import StyledSelect from '@/components/ui/StyledSelect';
import styles from '@/components/account/CloudAccountPanel.module.css';

export default function AudioSettings() {
  const background = useSiteSetting('backgroundMusic'), greeting = useSiteSetting('greeting'), chosen = useSiteSetting('greetingOperator');
  const account = useAccount(), url = useContentUrl();
  const [operators, setOperators] = useState<string[]>([]), [failed, setFailed] = useState(false);
  useEffect(() => {
    if (greeting !== 'chosen') return;
    const controller = new AbortController();
    void fetchAsset(url('/operator-search.json'), { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('Catalogue unavailable');
      return response.json();
    }).then(data => setOperators(data.operators.map((op: { name: string }) => op.name)))
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [greeting, url]);
  return <div className={styles.form}>
    <label className="check"><input type="checkbox" checked={background} onChange={event => setSetting('backgroundMusic', event.target.checked)} />Enable background music</label>
    <p className="hint">Quiet lobby themes on event pages and the main menu theme on the homepage. Page music stops when you leave. Playing or pausing music yourself takes priority for this visit.</p>
    <span className="label-tag">Greeting</span>
    <StyledSelect label="Greeting" value={greeting} onChange={value => setSetting('greeting', value as SiteSettings['greeting'])} options={[
      { value: 'off', label: 'Off' }, { value: 'random', label: 'Random operator' },
      { value: 'owned', label: 'Random owned operator' }, { value: 'chosen', label: 'Chosen operator' },
    ]} />
    {greeting === 'owned' && !account?.operators.length && <p className="hint">Import your game roster to use owned operators. No greeting plays until a roster is available.</p>}
    {greeting === 'chosen' && <><StyledSelect label="Greeting operator" value={chosen} placeholder={failed ? 'Operator list unavailable' : 'Choose an operator'} onChange={value => setSetting('greetingOperator', value)} options={operators.map(name => ({ value: name, label: name }))} />
      {failed && <p className="hint" role="status">Reopen Audio settings to try loading the operator list again.</p>}</>}
    <p className="hint">An “Arknights” title line once per visit, using an available Japanese recording, then English or Chinese. A visit lasts until you close this tab. Your choice is independent of analytics.</p>
    <p className="hint">Your browser may require Play before allowing sound. Some phones control volume only with their hardware buttons.</p>
  </div>;
}
