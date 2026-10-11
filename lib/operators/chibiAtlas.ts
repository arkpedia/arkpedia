/** Spine 3.8 rejects this optional client-export page header. The renderer uses
 * the model's explicit premultipliedAlpha flag; geometry and texture bytes stay intact. */
export function chibiAtlasText(text: string): string {
  return text.replace(/^[\t ]*pma:[\t ]*(?:true|false)[\t ]*(?:\r?\n|$)/gm, '');
}
