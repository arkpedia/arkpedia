/** Reading categories in Timo's reader, plus Arkpedia's official comics. */
export const STORY_CATEGORIES = [
  ['main', 'Main Story'], ['side', 'Side Stories'], ['mini', 'Vignettes'],
  ['manga', 'Manga'], ['rogue', 'Integrated Strategies'],
  ['sandbox', 'Reclamation Algorithm'], ['extra', 'Side Content'],
  ['record', 'Operator Records'], ['module', 'Modules'],
] as const;
export type StoryCategory = typeof STORY_CATEGORIES[number][0];
export interface StoryLibraryEntry {
  id: string;
  category: StoryCategory;
  title: string;
  url: string;
  image?: string;
  imageKind?: 'portrait' | 'art';
}
