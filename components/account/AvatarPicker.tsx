import { useEffect, useMemo, useState } from 'react';
import ProfileIcon from './ProfileIcon';
import StyledSelect from '@/components/ui/StyledSelect';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import { avatarCatalogue, saveProfileAvatar, useProfileAvatar } from '@/lib/account/profileAvatar';

const group = (id: string) => /^(one|two|three|four|five|six)-star-icons\//.test(id) ? 'Operators'
  : id.startsWith('enemies-icons/') ? 'Enemies' : /^(faction-icons|alliance-icons|nation-marks)\//.test(id) ? 'Factions' : 'Interface & items';
export default function AvatarPicker() {
  const selected = useProfileAvatar();
  const [icons, setIcons] = useState<string[]>([]), [search, setSearch] = useState(''), [category, setCategory] = useState('Operators');
  const [limit, setLimit] = useState(60), [message, setMessage] = useState('');
  useEffect(() => { let live = true; void avatarCatalogue().then(list => { if (live) setIcons(list); }).catch(() => { if (live) setMessage('Icons could not load. Close and reopen your profile to retry.'); }); return () => { live = false; }; }, []);
  const matches = useMemo(() => icons.filter(id => (category === 'All icons' || group(id) === category) && id.toLowerCase().includes(search.toLowerCase())), [icons, category, search]);
  const choose = async (id: string | null) => {
    try { await saveProfileAvatar(id); setMessage('Profile picture saved in this browser.'); }
    catch { setMessage('Could not save the picture. Check that browser storage is allowed.'); }
  };
  return <section className="avatar-picker" aria-label="Profile picture">
    <h3>Profile picture</h3>
    <p className="hint">Saved in this browser. Choose from Arkpedia’s icon catalogue.</p>
    <div className="avatar-picker-controls">
      <StyledSelect label="Icon category" value={category} onChange={value => { setCategory(value); setLimit(60); }} options={['Operators', 'Enemies', 'Factions', 'Interface & items', 'All icons'].map(value => ({ value, label: value }))} />
      <input aria-label="Search profile icons" placeholder="Search icons…" type="search" value={search} onChange={event => { setSearch(event.target.value); setLimit(60); }} />
      <button type="button" className="ghost btn-sm" onClick={() => void choose(null)}>Use default</button>
    </div>
    <p className="hint">{icons.length ? `${matches.length.toLocaleString()} icons` : 'Loading icons…'}</p>
    <div className="avatar-picker-grid">
      {matches.slice(0, limit).map(id => <button type="button" className="avatar-choice" key={id} aria-pressed={selected === id} aria-label={id.split('/').pop()!.replace(/\.(webp|png)$/, '')} title={id.split('/').pop()} onClick={() => void choose(id)}><ProfileIcon id={id} size={48} /></button>)}
    </div>
    <LoadOnScroll shown={Math.min(limit, matches.length)} total={matches.length} onMore={() => setLimit(value => value + 60)} />
    {message && <p role="status">{message}</p>}
  </section>;
}
