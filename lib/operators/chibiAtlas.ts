/** Spine 3.8 rejects this optional client-export page header. The renderer uses
 * the model's explicit premultipliedAlpha flag; geometry and texture bytes stay intact. */
export function chibiAtlasText(text: string): string {
  return text.replace(/^[\t ]*pma:[\t ]*(?:true|false)[\t ]*(?:\r?\n|$)/gm, '');
}
import type { spine as Spine } from '../vendor/spine-3.8/spine-webgl';


/** This runtime reads UTF-8 bytes as signed characters. Recover the original
 * path only after exact lookup fails; its atlas reader also trims region names. */
export function chibiAtlas(runtime: typeof Spine, text: string, texture: ConstructorParameters<typeof Spine.TextureAtlas>[1]): Spine.TextureAtlas {
  const atlas = new runtime.TextureAtlas(chibiAtlasText(text), texture);
  const find = atlas.findRegion.bind(atlas);
  atlas.findRegion = name => {
    const exact = find(name);
    if (exact) return exact;
    let native = name;
    if (/[\uff80-\uffff]/u.test(name) && [...name].every(char => char.charCodeAt(0) < 128 || char.charCodeAt(0) >= 0xff80)) {
      try { native = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from([...name], char => char.charCodeAt(0) & 255)); }
      catch { /* Not a complete UTF-8 path: retain exact native spelling. */ }
    }
    return find(native) ?? find(native.trim());
  };
  return atlas;
}
