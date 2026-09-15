export type HintType =
  | 'skillDescription'
  | 'skillIcon'
  | 'tags'
  | 'talentName'
  | 'talentDescription'
  | 'faction'
  | 'jpVA'
  | 'enVA'
  | 'cnVA'
  | 'krVA'
  | 'dateOfBirth'
  | 'height'
  | 'howToObtain'
  | 'branch'
  | 'letterCount'
  | 'placeOfBirth'
  | 'skinName'
  | 'race'
  | 'ep'
  | 'illustrator'
  | 'releaseDate'
  | 'rarity'
  | 'class'
  | 'baseSkillName'
  | 'operatorRecord'
  | 'paradoxSimulation'
  | 'infectionStatus';

export interface Hint {
  type: HintType;
  label: string;
  value: string;
  isImage?: boolean;
}

export const ALL_HINT_TYPES: { type: HintType; label: string }[] = [
  { type: 'baseSkillName', label: 'Base Skill Name' },
  { type: 'branch', label: 'Branch' },
  { type: 'class', label: 'Class' },
  { type: 'cnVA', label: 'Chinese VA' },
  { type: 'dateOfBirth', label: 'Date of Birth' },
  { type: 'enVA', label: 'English VA' },
  { type: 'ep', label: 'EP' },
  { type: 'faction', label: 'Faction' },
  { type: 'height', label: 'Height' },
  { type: 'howToObtain', label: 'How to Obtain' },
  { type: 'illustrator', label: 'Illustrator' },
  { type: 'infectionStatus', label: 'Infection Status' },
  { type: 'jpVA', label: 'Japanese VA' },
  { type: 'krVA', label: 'Korean VA' },
  { type: 'letterCount', label: 'Number of Letters' },
  { type: 'operatorRecord', label: 'Operator Record' },
  { type: 'paradoxSimulation', label: 'Paradox Simulation' },
  { type: 'placeOfBirth', label: 'Place of Birth' },
  { type: 'race', label: 'Race' },
  { type: 'rarity', label: 'Rarity' },
  { type: 'releaseDate', label: 'Global Release Date' },
  { type: 'skillDescription', label: 'Skill Description' },
  { type: 'skillIcon', label: 'Skill Icon' },
  { type: 'skinName', label: 'Skin Name' },
  { type: 'tags', label: 'Tags' },
  { type: 'talentName', label: 'Talent Name' },
  { type: 'talentDescription', label: 'Talent Description' },
];

export const HINT_GROUPS: { label: string; types: HintType[] }[] = [
  { label: 'Game Systems', types: ['baseSkillName', 'branch', 'class', 'howToObtain', 'rarity', 'skillDescription', 'skillIcon', 'tags', 'talentName', 'talentDescription'] },
  { label: 'Identity', types: ['dateOfBirth', 'ep', 'faction', 'height', 'infectionStatus', 'letterCount', 'operatorRecord', 'paradoxSimulation', 'placeOfBirth', 'race'] },
  { label: 'Meta', types: ['cnVA', 'enVA', 'illustrator', 'jpVA', 'krVA', 'releaseDate', 'skinName'] },
];

export type ThemedLevel = 'baby' | 'easy' | 'normal' | 'hard' | 'extreme' | 'agony';

export interface ThemedModeConfig {
  level: ThemedLevel;
  label: string;
  // takeAll: true shows every hint of that type at once (e.g. every
  // skill icon); false caps it down to exactly one instance, for
  // hint types that can produce several (skinName, talentName,
  // baseSkillName, skillDescription).
  hints: { type: HintType; takeAll: boolean }[];
}

export const THEMED_MODES: ThemedModeConfig[] = [
  {
    level: 'baby',
    label: 'Baby',
    hints: [
      { type: 'rarity', takeAll: true },
      { type: 'branch', takeAll: true },
      { type: 'skillDescription', takeAll: true },
    ],
  },
  {
    level: 'easy',
    label: 'Easy',
    hints: [
      { type: 'rarity', takeAll: true },
      { type: 'branch', takeAll: true },
      { type: 'skillIcon', takeAll: true },
    ],
  },
  {
    level: 'normal',
    label: 'Normal',
    hints: [
      { type: 'letterCount', takeAll: true },
      { type: 'faction', takeAll: true },
      { type: 'tags', takeAll: true },
    ],
  },
  {
    level: 'hard',
    label: 'Hard',
    hints: [
      { type: 'skinName', takeAll: false },
      { type: 'talentName', takeAll: false },
      { type: 'baseSkillName', takeAll: false },
    ],
  },
  {
    level: 'extreme',
    label: 'Extreme',
    hints: [
      { type: 'illustrator', takeAll: true },
      { type: 'operatorRecord', takeAll: true },
      { type: 'paradoxSimulation', takeAll: true },
    ],
  },
  {
    level: 'agony',
    label: 'Agony',
    hints: [
      { type: 'enVA', takeAll: true },
      { type: 'jpVA', takeAll: true },
      { type: 'illustrator', takeAll: true },
    ],
  },
];
