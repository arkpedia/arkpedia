export interface SeasonalChallengeMode {
  /** The display code the game gives this mode's contents, e.g. 'TN'. */
  label: string;
  name: string;
  /** activity_table types this mode runs as. */
  activityTypes: string[];
  /** Its emblem in public/mode-marks/, or null. */
  mark: string | null;
}
export interface GameModes {
  version: 1;
  excludedActivityTypes: Record<string, string>;
  seasonalChallenges: SeasonalChallengeMode[];
  storyActivityTypes: string;
}
export declare function checkGameModes<T>(value: T): T & GameModes;
export declare function classifyActivity(type: string, modes: GameModes):
  { as: 'excluded' | 'story' | 'unknown'; challenge?: undefined } | { as: 'challenge'; challenge: SeasonalChallengeMode };
export declare function challengeLabels(modes: GameModes): string[];
