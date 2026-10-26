import { readFileSync, writeFileSync } from 'node:fs';

// Only small catalogue icons; no full portraits, outfits, posters or user URLs.
const icons = JSON.parse(readFileSync('data/assets/public-asset-index.json', 'utf8')).files
  .filter(path => /^(?:[a-z]+-star-icons|enemies-icons|npc-icons|faction-icons|alliance-icons|nation-marks|essential-icons|stat-icons|enemy-stat-icons|class-icons|branch-icons|material-icons|item-icons|skill-icons|base-skill-icons|profile-avatars|profile-ui)\/[^/]+\.(?:webp|png)$/.test(path))
  .sort();
writeFileSync('lib/account/profile-avatar-catalogue.json', `${JSON.stringify(icons)}\n`);
console.log(`Profile avatar catalogue: ${icons.length} trusted icons`);
