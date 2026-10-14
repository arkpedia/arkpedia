export declare const CHARACTER_PORTRAITS: Readonly<Record<string, readonly string[]>>;
export function characterPortrait(name: string, served: (file: string) => boolean): string | null;
export function characterInitials(name: string): string;
