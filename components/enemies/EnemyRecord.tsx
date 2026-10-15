import { useEffect, useState, type ReactNode } from 'react';
import { useContentUrl } from '@/lib/content/context';
import EnemyDetailPanel, { type EnemyDetailData } from '@/components/enemies/EnemyDetailPanel';
import RecordDialog from '@/components/ui/RecordDialog';
import { fetchAsset } from '@/lib/assets/assetRetry';

/**
 * The enemy handbook's own record, over the page it was opened from: a Stronghold
 * Protocol pool, a stage's enemies.
 *
 * Those pages carry a name, a code and a picture, and nothing a player actually asks --
 * how much HP, what it is immune to, whether it flies. The handbook draws all of that from
 * a static JSON file per creature, so the record opens the real thing instead of
 * paraphrasing it. Fetched on open rather than shipped with the page: a stage fields up
 * to forty creatures and a visit reads one or two.
 */
export default function EnemyRecord({ slug, name, intro, fieldedLevel = null, onClose }: {
  /** The handbook's slug, or null for a creature the handbook has no record of: the
   *  record then holds only what the page itself knows (intro). */
  slug: string | null;
  name: string;
  /** Drawn above the handbook's panel, for what the opening page knows that the handbook
   *  does not -- a boss's HP at each Stronghold difficulty, the level a stage fields. */
  intro?: ReactNode;
  /** The level the opening stage fields: the handbook panel shows only that version. */
  fieldedLevel?: number | null;
  onClose: () => void;
}) {
  const contentUrl = useContentUrl();
  const [detail, setDetail] = useState<EnemyDetailData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!slug) return;
    let live = true;
    setDetail(null);
    setFailed(false);
    fetchAsset(contentUrl(`/enemy-detail/${encodeURIComponent(slug)}.json`))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: EnemyDetailData) => { if (live) setDetail(d); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [slug, contentUrl]);

  return (
    <RecordDialog label={name} onClose={onClose}>
      {/* Before the fetch resolves, not after: the page's own numbers are already here
          and there is no reason to make them wait on a network round trip. */}
      {intro}
      {!slug
        ? <p className="hint record-dialog-wait">The enemy handbook has no record of {name}.</p>
        : detail
          ? <EnemyDetailPanel key={detail.enemy.slug} {...detail} fieldedLevel={fieldedLevel} />
          : <p className="hint record-dialog-wait">{failed ? `${name} could not be loaded.` : 'Loading...'}</p>}
    </RecordDialog>
  );
}
