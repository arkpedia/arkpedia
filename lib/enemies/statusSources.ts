/** Enemy recommendations require an application, not immunity or a damage bonus
 * against an enemy which somebody else has already disabled. */
export function appliesEnemyStatus(status: string, source: string | null): boolean {
  if (!source) return false;
  const text = source.replace(/<[^>]*>/g, ' ')
    .replace(/\bputs?\s+(?:herself|himself|itself|themselves|self)\b[^.;]*/gi, '');
  switch (status) {
    case 'Sleep':
      return /(?:puts?|inflicts?|apply|applies)\b[^.;]{0,120}\bsleep\b|(?:enemies|targets?)[^.;]{0,70}\b(?:put|inflicted)[^.;]{0,20}\bsleep\b/i.test(text);
    case 'Levitate':
      return /\blevitat(?:e|es)\s+(?:the |all |it|them)|\b(?:caus(?:e|es|ing)|appl(?:y|ies))\b[^.;]{0,110}\blevitate\b|\b(?:enemies|targets?)[^.;]{0,80}\b(?:are|become)\s+levitated\b/i.test(text);
    case 'Frozen':
      return /\b(?:inflict\w*|appl(?:y|ies))\b[^.;]{0,100}\b(?:cold|freez\w*|frozen)\b|\bfreez(?:e|es|ing)\s+(?:all |the |nearby |surrounding )?enemies/i.test(text);
    case 'Stun': {
      const enemyText = text
        .replace(/\b(?:immune|immunity|resistant|resistance)\s+to\s+stun\b/gi, '')
        .replace(/stun\w*\s+(?:(?:all|other|nearby|surrounding)\s+)*(?:self|themselves|herself|himself|allied\s+(?:units|operators))\b[^.;]*/gi, '')
        .replace(/(?:stun\w*\s*(?:\/|and|,)\s*)?frozen\s+(?:immunity|effect)|stun\w*\s+(?:immunity|resistance|effect duration)/gi, '');
      return /\bstun(?:s|ning)?\b|\b(?:targets?|enemies)[^.;]{0,40}\b(?:is|are)\s+stunned\b/i.test(enemyText);
    }
    case 'Fear':
      return /\binflicts?\s+fear\b|\bcasting\s+fear\b/i.test(text);
    case 'Lure':
      return /\blures?\s+(?:up to |all |the |nearby )?\d*\s*enemies/i.test(text);
    case 'Silence':
      return /\bsilenc(?:e|es|ed)\b|\bdisables?\b[^.;]{0,60}\bspecial abilit/i.test(text);
    default: return false;
  }
}
