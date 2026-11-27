type GitHubReader = (path: string) => Promise<unknown>;
export function approvePreviewSource(source: string, github: GitHubReader): Promise<{ source: string; checkRun: number }>;
