import { useEffect, useMemo, useState, type ReactNode } from 'react';
import ProfileIcon from './ProfileIcon';
import StyledSelect from '@/components/ui/StyledSelect';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import { avatarCatalogue, saveProfileAvatar, useProfileAvatar } from '@/lib/account/profileAvatar';

const group = (id: string) => /^(one|two|three|four|five|six)-star-icons\//.test(id) ? 'Operators'
  : id.startsWith('enemies-icons/') ? 'Enemies' : /^(faction-icons|alliance-icons|nation-marks)\//.test(id) ? 'Factions'
  : id.startsWith('base-skill-icons/') ? 'Base Skill' : /^(item-icons|material-icons)\//.test(id) ? 'Items' : 'Others';
const facilityOrder = ['Factory', 'Trading Post', 'Power Plant', 'Control Center', 'Reception Room', 'Office', 'Workshop', 'Training Room', 'Dormitory', 'Other base skills'];
/** `head`: what heads the picker (the current picture and its title), kept on screen with the controls. */
export default function AvatarPicker({ head }: { head?: ReactNode }) {
  const selected = useProfileAvatar();
  const [icons, setIcons] = useState<string[]>([]), [search, setSearch] = useState(''), [category, setCategory] = useState('Operators');
  const [limit, setLimit] = useState(60), [message, setMessage] = useState('');
  const [facilities, setFacilities] = useState<Record<string, string>>({});
  useEffect(() => { let live = true; void Promise.all([avatarCatalogue(), import('@/lib/account/profile-avatar-base-facilities.json')]).then(([list, rooms]) => { if (live) { setIcons(list); setFacilities(rooms.default); } }).catch(() => { if (live) setMessage('Icons could not load. Close and reopen your profile to retry.'); }); return () => { live = false; }; }, []);
  const matches = useMemo(() => {
    const result = icons.filter(id => (category === 'All icons' || group(id) === category) && id.toLowerCase().includes(search.toLowerCase()));
    return category === 'Base Skill' ? result.sort((a, b) => facilityOrder.indexOf(facilities[a] ?? 'Other base skills') - facilityOrder.indexOf(facilities[b] ?? 'Other base skills') || a.localeCompare(b, 'en')) : result;
  }, [icons, category, search, facilities]);
  const visible = matches.slice(0, limit);
  const sections = category === 'Base Skill' ? facilityOrder.map(label => ({ label, icons: visible.filter(id => facilities[id] === label) })).filter(section => section.icons.length)
    : [{ label: '', icons: visible }];
  const choose = async (id: string | null) => {
    try { await saveProfileAvatar(id); setMessage('Profile picture saved in this browser.'); }
    catch { setMessage('Could not save the picture. Check that browser storage is allowed.'); }
  };
  return <section className="avatar-picker" aria-label="Profile picture">
    {/* The heading, the note and the controls stay at the top of the dialog while the
        icons scroll under them (styles/core/account-navigation.css .avatar-picker-head). */}
    <div className="avatar-picker-head">
    {head}
    <p className="hint">Saved in this browser. Choose from Arkpedia’s icon catalogue.</p>
    <div className="avatar-picker-controls">
      <StyledSelect label="Icon category" value={category} onChange={value => { setCategory(value); setLimit(60); }} options={['Operators', 'Enemies', 'Factions', 'Base Skill', 'Items', 'Others', 'All icons'].map(value => ({ value, label: value }))} />
      <input aria-label="Search profile icons" placeholder="Search icons…" type="search" value={search} onChange={event => { setSearch(event.target.value); setLimit(60); }} />
      <button type="button" className="ghost btn-sm" onClick={() => void choose(null)}>Use default</button>
    </div>
    </div>
    <p className="hint">{icons.length ? `${matches.length.toLocaleString()} icons` : 'Loading icons…'}</p>
    {sections.map(section => <section className="avatar-picker-facility" key={section.label} aria-label={section.label || undefined}>
      {section.label && <h4>{section.label}</h4>}
      <div className="avatar-picker-grid">{section.icons.map(id => <button type="button" className="avatar-choice" key={id} aria-pressed={selected === id} aria-label={id.split('/').pop()!.replace(/\.(webp|png)$/, '')} title={id.split('/').pop()} onClick={() => void choose(id)}><ProfileIcon id={id} size={48} /></button>)}</div>
    </section>)}
    <LoadOnScroll shown={Math.min(limit, matches.length)} total={matches.length} onMore={() => setLimit(value => value + 60)} />
    {message && <p role="status">{message}</p>}
  </section>;
}
