import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useCloudSync } from '@/lib/cloud-account/SyncProvider';
import styles from './AvatarPicker.module.css';
import InfoPopover from '@/components/ui/InfoPopover';
import ProfileIcon from './ProfileIcon';
import StyledSelect from '@/components/ui/StyledSelect';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import { AVATAR_CATALOGUE, avatarCatalogue, saveProfileAvatar, useProfileAvatar } from '@/lib/account/profileAvatar';
import { useContentUrl } from '@/lib/content/context';

const group = (id: string) => /^(one|two|three|four|five|six)-star-icons\//.test(id) ? 'Operators'
  : id.startsWith('enemies-icons/') ? 'Enemies' : /^(faction-icons|alliance-icons|nation-marks)\//.test(id) ? 'Factions'
  : id.startsWith('base-skill-icons/') ? 'Base Skill' : /^(item-icons|material-icons)\//.test(id) ? 'Items' : 'Others';
const facilityOrder = ['Factory', 'Trading Post', 'Power Plant', 'Control Center', 'Reception Room', 'Office', 'Workshop', 'Training Room', 'Dormitory', 'Other base skills'];
/** `head`: what heads the picker (the current picture and its title), kept on screen with the controls. */
export default function AvatarPicker({ head }: { head?: ReactNode }) {
  const selected = useProfileAvatar();
  const sync = useCloudSync();
  const account = !!sync.remote;
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const disabled = saving || sync.status === 'loading' || (account && !sync.remote?.profile);
  const [icons, setIcons] = useState<string[]>([]), [search, setSearch] = useState(''), [category, setCategory] = useState('Operators');
  const [limit, setLimit] = useState(60), [message, setMessage] = useState('');
  const [facilities, setFacilities] = useState<Record<string, string>>({});
  const catalogueUrl = useContentUrl()(AVATAR_CATALOGUE);
  useEffect(() => { let live = true; void avatarCatalogue(catalogueUrl).then(catalogue => { if (live) { setIcons(catalogue.icons); setFacilities(catalogue.facilities); } }).catch(() => { if (live) setMessage('Icons could not load. Close and reopen your profile to retry.'); }); return () => { live = false; }; }, [catalogueUrl]);
  const matches = useMemo(() => {
    const result = icons.filter(id => (category === 'All icons' || group(id) === category) && id.toLowerCase().includes(search.toLowerCase()));
    return category === 'Base Skill' ? result.sort((a, b) => facilityOrder.indexOf(facilities[a] ?? 'Other base skills') - facilityOrder.indexOf(facilities[b] ?? 'Other base skills') || a.localeCompare(b, 'en')) : result;
  }, [icons, category, search, facilities]);
  const visible = matches.slice(0, limit);
  const sections = category === 'Base Skill' ? facilityOrder.map(label => ({ label, icons: visible.filter(id => facilities[id] === label) })).filter(section => section.icons.length)
    : [{ label: '', icons: visible }];
  const choose = async (id: string | null) => {
    if (disabled) return;
    setSaving(true); setFailed(false); setMessage('Saving picture…');
    try {
      if (account) await sync.saveAvatar(id);
      else await saveProfileAvatar(id, catalogueUrl);
      setMessage(account ? 'Profile picture saved to your account.' : 'Profile picture saved in this browser.');
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Could not save the picture. Try again.'); }
    finally { setSaving(false); }
  };
  return <section className="avatar-picker" aria-label="Profile picture">
    {/* The heading, the note and the controls stay at the top of the dialog while the
        icons scroll under them (styles/core/account-navigation.css .avatar-picker-head). */}
    <div className="avatar-picker-head">
    {head}
    <div className={styles.description}><p role={failed ? 'alert' : 'status'}>{message || (account ? 'Choose your Arkpedia profile picture.' : 'Choose a picture for this browser.')}</p><InfoPopover label="About your profile picture"><p>{account ? 'Your picture saves when you select it and follows your Arkpedia login across devices, even with cloud saving paused. It does not change your in-game or Google/Discord picture.' : 'This picture stays on this browser. Sign in and select a picture to save it to an Arkpedia account.'}</p></InfoPopover></div>
    <div className="avatar-picker-controls">
      <StyledSelect label="Icon category" value={category} onChange={value => { setCategory(value); setLimit(60); }} options={['Operators', 'Enemies', 'Factions', 'Base Skill', 'Items', 'Others', 'All icons'].map(value => ({ value, label: value }))} />
      <input aria-label="Search profile icons" placeholder="Search icons…" type="search" value={search} onChange={event => { setSearch(event.target.value); setLimit(60); }} />
      <button type="button" className="ghost btn-sm" disabled={disabled} onClick={() => void choose(null)}>Use default</button>
    </div>
    </div>
    <p className="hint">{icons.length ? `${matches.length.toLocaleString()} ${matches.length === 1 ? 'icon' : 'icons'}` : 'Loading icons…'}</p>
    {sections.map(section => <section className="avatar-picker-facility" key={section.label} aria-label={section.label || undefined}>
      {section.label && <h4>{section.label}</h4>}
      <div className="avatar-picker-grid">{section.icons.map(id => <button type="button" className="avatar-choice" disabled={disabled} key={id} aria-pressed={selected === id} aria-label={id.split('/').pop()!.replace(/\.(webp|png)$/, '')} title={id.split('/').pop()} onClick={() => void choose(id)}><ProfileIcon id={id} size={48} /></button>)}</div>
    </section>)}
    <LoadOnScroll shown={Math.min(limit, matches.length)} total={matches.length} onMore={() => setLimit(value => value + 60)} />
  </section>;
}
