export interface RecordingLine { id: string; availablePacks?: string[] }
export interface RecordingPack { id: string; status: 'current' | 'legacy'; audioTemplate: string | null }
export function hasRecording(line: RecordingLine | undefined | null, pack: RecordingPack | undefined | null): boolean;
export function clipUrl(template: string | null | undefined, lineId: string): string | null;
export function preferredRecordingPack<T extends RecordingPack>(packs: T[]): T | undefined;
