import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { getBannerLineup, isLineupPending, lineupPendingNote, RETURNING_LIMITED_NOTE, type BannerOperator } from '@/lib/gacha/bannerLineup';
import { GachaBannerWithWindow } from '@/lib/home/frontPageContent';
import Rarity from '@/components/ui/Rarity';
import { operatorHref } from '@/lib/operators/operatorHref';

// Icon paths follow the same "<Name> - Base.webp" naming convention as
// lib/gacha/gachaIconPools.ts's own folder scan -- banner six_stars/
// five_stars/four_stars are always that exact rarity, so the path can
// be built directly without needing a server-only icon-pool read here.
function iconPathFor(name: string, rarity: 6 | 5 | 4): string {
  const folder = rarity === 6 ? 'six-star-icons' : rarity === 5 ? 'five-star-icons' : 'four-star-icons';
  return `/${folder}/${name} - Base.webp`;
}

function OperatorRow({ operators }: { operators: BannerOperator[] }) {
  return <div className="front-featured-ops-row">
    {operators.map(op => <Link prefetch={false} key={`${op.rarity}-${op.name}`} href={operatorHref(op.name, null)} className="front-featured-op" title={op.name}>
      <Image src={iconPathFor(op.name, op.rarity)} alt="" width={52} height={52} className={`tier-${op.rarity}`} />
      <span className="front-featured-op-name">{op.name}</span>
      <Rarity n={op.rarity} className="front-featured-op-rarity" />
    </Link>)}
  </div>;
}

export default function FeaturedOperatorsPanel({ banner }: { banner: GachaBannerWithWindow | null }) {
  if (!banner) {
    return (
      <section className="front-panel front-home-panel front-featured-ops-panel">
        <h2 className="section-title">Featured Operators</h2>
        <p className="hint">No ongoing banner right now.</p>
      </section>
    );
  }

  const { featured, returning } = getBannerLineup(banner);

  // A banner out before its lineup is known says so, rather than "none listed".
  if (featured.length === 0 || isLineupPending(banner)) {
    return (
      <section className="front-panel front-home-panel front-featured-ops-panel">
        <h2 className="section-title">Featured Operators</h2>
        <p className="hint">{isLineupPending(banner) ? lineupPendingNote(banner) : 'No featured operators listed for this banner.'}</p>
      </section>
    );
  }

  return (
    <section className="front-panel front-home-panel front-featured-ops-panel">
      <h2 className="section-title">Featured Operators</h2>
      <OperatorRow operators={featured} />
      {returning.length > 0 && <div className="front-returning-ops">
        <h3>Returning limited operators</h3>
        <p className="hint front-returning-note">{RETURNING_LIMITED_NOTE}</p>
        <OperatorRow operators={returning} />
      </div>}
    </section>
  );
}