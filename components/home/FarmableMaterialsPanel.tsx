import Image from '@/components/content/ContentImage';
import { activeEventFarming } from '@/lib/farming/eventFarming';
import type { FarmingMaterial } from '@/lib/farming/farmingTypes';

/** More than one active event may offer the same material. */
function farmLocationLabel(material: FarmingMaterial): string {
  return [...new Set(material.stages.map(stage => stage.label))].join(' · ');
}

/** `now` is the homepage's request clock on first paint and reader clock after mount. */
export default function FarmableMaterialsPanel({ materials: allMaterials, now }: { materials: FarmingMaterial[]; now: number }) {
  const materials = activeEventFarming(allMaterials, now);
  if (materials.length === 0) {
    return (
      <section className="front-panel front-home-panel front-farmable-panel">
        <h2 className="section-title">Currently Farmable</h2>
        <p className="hint">No event-boosted materials right now, play any stage you would like.</p>
      </section>
    );
  }
  return (
    <section className="front-panel front-home-panel front-farmable-panel">
      <h2 className="section-title">Currently Farmable</h2>
      <div className="front-materials-grid">
        {materials.map((m) => (
          <div className="front-material-item" key={m.name} title={m.name}>
            {/* Twice the box. These icons are the ringed art, so the material
                itself occupies only the middle ~two thirds of the frame -- asking
                for exactly 40px left the object rendered at about 26. */}
            <Image src={m.icon} alt={m.name} width={80} height={80} quality={85} style={{ width: 40, height: 40 }} />
            <span>{farmLocationLabel(m)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
