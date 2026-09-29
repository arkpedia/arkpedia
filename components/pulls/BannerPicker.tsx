import { bannerDisplayName } from '@/lib/gacha/bannerDisplayName';
import { useState } from 'react';
import type { UpcomingBanner } from '@/lib/pulls/pulls';
import type { BannerOdds } from '@/lib/pulls/probability';
import styles from '@/styles/pulls/pulls-workspace.module.css';
import { ContentImg } from '@/components/content/ContentImage';
import { formatDayMonth } from '@/lib/pulls/format';
import SearchInput from '@/components/ui/SearchInput';

export default function BannerPicker({ banners, selected, odds, onAdd }: {
  banners: UpcomingBanner[]; selected: string[]; odds: Record<string, BannerOdds>; onAdd: (banner: UpcomingBanner) => void;
}) {
  const [search, setSearch] = useState('');
  const matches = banners.filter(b => `${b.name} ${b.sixStars.join(' ')} ${odds[b.name]?.operators.map(op => op.name).join(' ') ?? ''}`.toLowerCase().includes(search.toLowerCase().trim()));
  return <div className={styles.chooser}>
    <SearchInput label="Search banners by operator or banner name" placeholder="Search operators…" value={search} onChange={setSearch} />
    <div className={styles.bannerChoices}>
      {matches.map(banner => {
        const added = selected.includes(banner.name);
        const operators = odds[banner.name]?.operators.filter(op => op.kind === 'featured' && op.rarity === 6) ?? [];
        const names = operators.length ? operators.map(op => op.name).join(' · ') : banner.sixStars.join(' · ');
        return <button type="button" key={banner.name} className={`btn-bare pick-card ${styles.bannerChoice}`} onClick={() => { if (!added) onAdd(banner); }} aria-disabled={added} aria-label={`${added ? 'Added' : 'Add'} ${names || bannerDisplayName(banner.name)}`}>
          <span className={styles.pickerPortraits}>{operators.filter(op => op.icon).slice(0, 2).map(op => (
            // eslint-disable-next-line @next/next/no-img-element
            <ContentImg key={op.name} src={op.icon!} alt="" width="68" height="68" />
          ))}</span>
          <span className={styles.pickerCopy}><strong>{names || bannerDisplayName(banner.name)}</strong><small>{bannerDisplayName(banner.name).replace(/^\[[^\]]*\]\s*/, '')}</small><small>{formatDayMonth(banner.start)} – {formatDayMonth(banner.end)}{banner.datesEstimated ? ' · Estimated' : ''}</small></span>
          <span className={styles.pickerAdd} aria-hidden="true">{added ? '✓' : '+'}</span>
        </button>;
      })}
      {!matches.length && <p className={styles.empty}>No matching banners.</p>}
    </div>
  </div>;
}
