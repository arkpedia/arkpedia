import Image from 'next/image';
import Link from 'next/link';
import { GachaBannerWithWindow } from '@/lib/home/frontPageContent';

// Icon paths follow the same "<Name> - Base.webp" naming convention as
// lib/gacha/gachaIconPools.ts's own folder scan -- banner six_stars/
// five_stars/four_stars are always that exact rarity, so the path can
// be built directly without needing a server-only icon-pool read here.
function iconPathFor(name: string, rarity: 6 | 5 | 4): string {
  const folder = rarity === 6 ? 'six-star-icons' : rarity === 5 ? 'five-star-icons' : 'four-star-icons';
  return `/${folder}/${name} - Base.webp`;
}

interface FeaturedOp {
  name: string;
  rarity: 6 | 5 | 4;
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

  const sixStars = [...(banner.six_stars || []), ...(banner.rate_up_six_stars || [])];
  const fiveStars = banner.five_stars || [];
  const fourStars = banner.four_stars || [];

  // All rarities together in display order (6★ first), rather than
  // separate rows per rarity -- the rarity itself is shown per-card
  // instead.
  const featured: FeaturedOp[] = [
    ...sixStars.map((name) => ({ name, rarity: 6 as const })),
    ...fiveStars.map((name) => ({ name, rarity: 5 as const })),
    ...fourStars.map((name) => ({ name, rarity: 4 as const })),
  ];

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
      <div className="front-featured-ops-row">
        {featured.map((op) => (
          <Link prefetch={false}
            key={`${op.rarity}-${op.name}`}
            href={`/operators/${encodeURIComponent(op.name)}`}
            className="front-featured-op"
            title={op.name}
          >
            <Image src={iconPathFor(op.name, op.rarity)} alt={op.name} width={52} height={52} />
            <span className="front-featured-op-name">{op.name}</span>
            <span className="front-featured-op-rarity">{op.rarity}★</span>
          </Link>
        ))}
      </div>
    </section>
  );
}