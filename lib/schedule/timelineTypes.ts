export interface InGameEvent {
  name: string;
  startDate: string; // ISO date, e.g. "2026-08-10"
  weeks: 1 | 2 | 3;
  url?: string;
}

export interface OperatorBirthday {
  name: string;
  month: number; // 1-12
  day: number; // 1-31
}