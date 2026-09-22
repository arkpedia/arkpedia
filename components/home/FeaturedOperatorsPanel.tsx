import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { getBannerLineup, RETURNING_LIMITED_NOTE, type BannerOperator } from '@/lib/gacha/bannerLineup';
import { GachaBannerWithWindow } from '@/lib/home/frontPageContent';

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
    {operators.map(op => <Link prefetch={false} key={`${op.rarity}-${op.name}`} href={`/operators/${encodeURIComponent(op.name)}`} className="front-featured-op" title={op.name}>
      <Image src={iconPathFor(op.name, op.rarity)} alt="" width={52} height={52} />
      <span className="front-featured-op-name">{op.name}</span>
      <span className="front-featured-op-rarity">{op.rarity}★</span>
    </Link>)}
  </div>;
}

export default function FeaturedOperatorsPanel({ banner }: { banner: GachaBannerWithWindow | null }) {
  if (!banner) {
    return (
      <section className="front-panel front-featured-ops-panel">
        <h2>Featured Operators</h2>
        <p className="hint">No ongoing banner right now.</p>
      </section>
    );
  }

  const { featured, returning } = getBannerLineup(banner);

  if (featured.length === 0) {
    return (
      <section className="front-panel front-featured-ops-panel">
        <h2>Featured Operators</h2>
        <p className="hint">No featured operators listed for this banner.</p>
      </section>
    );
  }

  return (
    <section className="front-panel front-featured-ops-panel">
      <h2>Featured Operators</h2>
      <OperatorRow operators={featured} />
      {returning.length > 0 && <div className="front-returning-ops">
        <h3>Returning limited operators</h3>
        <p className="hint">{RETURNING_LIMITED_NOTE}</p>
        <OperatorRow operators={returning} />
      </div>}
    </section>
  );
}