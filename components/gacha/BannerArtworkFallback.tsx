import ResponsiveSkinArtwork from '@/components/skins/ResponsiveSkinArtwork';
import Rarity from '@/components/ui/Rarity';
import type { BannerArtworkOperator } from '@/lib/gacha/bannerArtwork';

function OperatorArtwork({ operator, sizes }: { operator: BannerArtworkOperator; sizes: string }) {
  return operator.art && (
    <ResponsiveSkinArtwork src={operator.art} alt="" fill sizes={sizes} className="gacha-composite-art" />
  );
}

export function BannerArtworkThumbnail({ operators }: { operators: BannerArtworkOperator[] }) {
  const leads = operators.some(operator => operator.rarity === 6)
    ? operators.filter(operator => operator.rarity === 6)
    : operators;
  return (
    <span className="gacha-composite-thumb" aria-hidden="true">
      {leads.slice(0, 4).map(operator => (
        <span key={operator.name}><OperatorArtwork operator={operator} sizes="140px" /></span>
      ))}
    </span>
  );
}

export default function BannerArtworkFallback({ operators, kernel }: { operators: BannerArtworkOperator[]; kernel: boolean }) {
  const highest = operators[0]?.rarity;
  const leads = operators.filter(operator => operator.rarity === highest);
  const supporting = operators.filter(operator => operator.rarity !== highest);
  const shopLabel = kernel ? 'Certificate shop' : 'Distinctions shop';
  return (
    <figure className="gacha-composite">
      <div className="gacha-composite-panel gacha-banner-main-image">
        <div className="gacha-composite-leads">
          {leads.map(operator => (
            <div key={operator.name} className="gacha-composite-lead">
              <OperatorArtwork operator={operator} sizes="(max-width: 720px) 48vw, 420px" />
              <div className="gacha-composite-caption art-meta-ink">
                <div>
                  <Rarity n={operator.rarity} format="stars" />
                  <div className="entity-title entity-title-sm gacha-composite-name">{operator.name}</div>
                </div>
                <div className="gacha-composite-notes">
                  {operator.shop && <span className="art-meta-accent">{shopLabel}</span>}
                  {operator.elite !== null && <span>Elite {operator.elite}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
        {supporting.length > 0 && (
          <div className="gacha-composite-support">
            {supporting.map(operator => (
              <div key={operator.name} className="gacha-composite-support-item">
                <div className="gacha-composite-support-art"><OperatorArtwork operator={operator} sizes="92px" /></div>
                <div>
                  <Rarity n={operator.rarity} /> <span className="entity-title entity-title-xs entity-title-name">{operator.name}</span>
                  {operator.shop && <div className="gacha-composite-shop">{shopLabel}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <figcaption className="hint">Arkpedia lineup preview · Operator artwork © Hypergryph and Yostar</figcaption>
    </figure>
  );
}
