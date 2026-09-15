/**
 * Skill icon path, built from the operator name + skill name -- the
 * new schema dropped the embedded icon URL entirely, so this is
 * reconstructed from the skill-icons/ folder's naming convention
 * instead of read from the operator's own JSON.
 */
/**
 * Essential icons (M1/M2/M3, Potential 2-6, Elite 0/1/2) -- these
 * replace plain text labels with small icon images. "Base" is a
 * special case since the base-skills eliteLevel field uses that word
 * for what's otherwise labeled "Elite 0" everywhere else.
 */
export function getEssentialIconPath(label: string | null | undefined): string | null {
  if (!label) return null;
  const normalized = label.trim().toLowerCase() === 'base' ? 'Elite 0' : label.trim();
  return `/essential-icons/${normalized}.webp`;
}

export function getMaterialIconPath(materialName: string | null | undefined): string | null {
  if (!materialName) return null;
  const safe = materialName.replace(/[\\/*?:"<>|]/g, '').trim();
  return `/material-icons/${safe}.webp`;
}

export function getSkillIconPath(operatorName: string, skillName: string | null | undefined): string | null {
  if (!skillName) return null;
  const safe = skillName.replace(/[\\/*?:"<>|]/g, '').trim();
  return `/skill-icons/${encodeURIComponent(`${operatorName} - ${safe}.webp`)}`;
}

/**
 * Base skill icon path, same convention, base-skill-icons/ folder.
 * Encode the filename before passing it through Next image optimization: a raw
 * Greek letter in the inner URL otherwise fails its internal image request.
 */
export function getBaseSkillIconPath(operatorName: string, baseSkillName: string | null | undefined): string | null {
  if (!baseSkillName) return null;
  const safe = baseSkillName.replace(/[\\/*?:"<>|]/g, '').trim();
  return `/base-skill-icons/${encodeURIComponent(`${operatorName} - ${safe}.webp`)}`;
}