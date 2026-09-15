import type { AnswerMode } from './game';

export const ANSWER_MODES: { id: AnswerMode; name: string; description: string; help: string; cc: string }[] = [
  {
    id: 'all', name: 'All answers',
    description: 'Guess with a song title, artist, character, event, chapter or stage.',
    help: 'Any matching title, credited artist or composer, associated character, event, chapter or stage counts. A character or event name alone works, even when several tracks share it. Instrumental versions are excluded.',
    cc: 'Use an operation name or a numbered shortcut such as “CC3” or “CCB1”. Music roles and stage codes also work.',
  },
  {
    id: 'titles', name: 'Track Titles',
    description: 'Only the actual track or song title is accepted, in English or its original language.',
    help: 'Use the English or original title. Choose a suggestion or type your answer.',
    cc: 'Use the actual track title. Operation names with added descriptions and numbered CC shortcuts are not accepted in this mode.',
  },
  {
    id: 'events', name: 'Event Connections',
    description: 'Titles, event or chapter names with a music role, and stage codes. Try “Lone Trail boss” or “7-18”.',
    help: 'Use a track title, event or chapter with a music role, or a stage code such as “7-18”. If several tracks fit, add the stage or version; no attempt is used for an ambiguous answer.',
    cc: 'Use an operation name and music role: “Contingency Contract Wild Scales theme”, “CC Wild Scales theme”, or “Wild Scales theme”. Add “lobby” or “battle” if more than one track fits.',
  },
  {
    id: 'characters', name: 'Character Connections',
    description: 'Event answers, plus associated characters and EPs. Try “Texas alter boss theme” or “Hellagur EP”.',
    help: 'Use a title, event, chapter, associated character, or boss with a stage or music role, such as “Patriot boss 7-18”. For character EPs, use “Hellagur EP”. Instrumental versions are excluded from the quiz. Known names and operator codenames both work. Ambiguous answers do not use an attempt.',
    cc: 'Use named operations such as “CC Wild Scales theme”, or numbered shortcuts such as “CC3 lobby theme” and “CC9 lobby theme”. If “CC3 theme” or “CC9 theme” fits several tracks, add the music role or version without using an attempt.',
  },
];
