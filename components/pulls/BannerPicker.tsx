import { bannerDisplayName } from '@/lib/gacha/bannerDisplayName';
import { useState } from 'react';
import type { UpcomingBanner } from '@/lib/pulls/pulls';
import type { BannerOdds } from '@/lib/pulls/probability';
import styles from '@/styles/pulls/pulls-workspace.module.css';
import { ContentImg } from '@/components/content/ContentImage';

export default function BannerPicker({ banners, selected, odds, onAdd }: {
  banners: UpcomingBanner[]; selected: string[]; odds: Record<string, BannerOdds>; onAdd: (banner: UpcomingBanner) => void;
}) {
  const [search, setSearch] = useState('');
  const matches = banners.filter(b => `${b.name} ${b.sixStars.join(' ')} ${odds[b.name]?.operators.map(op => op.name).join(' ') ?? ''}`.toLowerCase().includes(search.toLowerCase().trim()));
  return <div className={styles.chooser}>
    <input className={styles.bannerSearch} type="search" aria-label="Search banners by operator or banner name" placeholder="Search operators…" value={search} onChange={e => setSearch(e.target.value)} />
    <div className={styles.bannerChoices}>
      {matches.map(banner => {
        const added = selected.includes(banner.name);
        const operators = odds[banner.name]?.operators.filter(op => op.kind === 'featured' && op.rarity === 6) ?? [];
        const names = operators.length ? operators.map(op => op.name).join(' · ') : banner.sixStars.join(' · ');
        return <button type="button" key={banner.name} className={styles.bannerChoice} onClick={() => { if (!added) onAdd(banner); }} aria-disabled={added} aria-label={`${added ? 'Added' : 'Add'} ${names || bannerDisplayName(banner.name)}`}>
          <span className={styles.pickerPortraits}>{operators.filter(op => op.icon).slice(0, 2).map(op => (
            // eslint-disable-next-line @next/next/no-img-element
            <ContentImg key={op.name} src={op.icon!} alt="" width="68" height="68" />
          ))}</span>
          <span className={styles.pickerCopy}><strong>{names || bannerDisplayName(banner.name)}</strong><small>{bannerDisplayName(banner.name).replace(/^\[[^\]]*\]\s*/, '')}</small><small>{new Date(`${banner.start}T12:00:00Z`).toLocaleDateString('en-GB', {day:'numeric',month:'short'})} – {new Date(`${banner.end}T12:00:00Z`).toLocaleDateString('en-GB', {day:'numeric',month:'short'})}</small></span>
          <span className={styles.pickerAdd} aria-hidden="true">{added ? '✓' : '+'}</span>
        </button>;
      })}
      {!matches.length && <p className={styles.empty}>No matching banners.</p>}
    </div>
  </div>;
}
