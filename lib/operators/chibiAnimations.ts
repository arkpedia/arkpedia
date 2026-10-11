import type { ChibiModel } from './chibi';
import type { ChibiAnimation } from './chibiRoutine';
import { chibiAtlasText } from './chibiAtlas';

const inventories = new Map<string, Promise<ChibiAnimation[]>>();
/** Read the native animation catalogue without loading textures or creating a WebGL canvas. */
export function loadChibiAnimations(model: ChibiModel): Promise<ChibiAnimation[]> {
  const cached = inventories.get(model.skeleton);
  if (cached) return cached;
  const pending = (async () => {
    const [{ spine }, bytes, text] = await Promise.all([
      import('@/lib/vendor/spine-3.8/spine-webgl'),
      fetch(model.skeleton).then(res => { if (!res.ok) throw Error('Skeleton unavailable'); return res.arrayBuffer(); }),
      fetch(model.atlas).then(res => { if (!res.ok) throw Error('Atlas unavailable'); return res.text(); }),
    ]);
    const atlas = new spine.TextureAtlas(chibiAtlasText(text), () => ({
      getImage: () => ({ width: 2048, height: 2048 }), setFilters() {}, setWraps() {}, dispose() {},
    }));
    const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(bytes));
    atlas.dispose();
    return data.animations.map(({ name, duration }) => ({ name, duration }));
  })();
  inventories.set(model.skeleton, pending);
  pending.catch(() => inventories.delete(model.skeleton));
  return pending;
}

export function chibiAnimationLabel(name: string, base: boolean, sharedReaction = false): string {
  if (!base) return name;
  const reaction = /^(Interact|Special)(.*)$/i.exec(name);
  if (reaction) return `${sharedReaction ? 'Tap / trust tap' : reaction[1].toLowerCase() === 'interact' ? 'Normal tap' : 'Trust tap'}${reaction[2].replaceAll('_', ' ')}`;
  const labels: Record<string, string> = { Move: 'Walking', Walk: 'Walking', Sit: 'Sitting', Sleep: 'Sleeping', Relax: 'Base idle', Idle: 'Base idle', Default: 'Base pose' };
  return labels[name] ?? name;
}
