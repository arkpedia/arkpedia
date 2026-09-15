export function getClassIconPath(className: string | null | undefined): string | null {
  if (!className) return null;
  return `/class-icons/${className}.webp`;
}

export function getBranchIconPath(branchName: string | null | undefined): string | null {
  if (!branchName) return null;
  return `/branch-icons/${branchName}.webp`;
}

export function getFactionIconPath(factionName: string | null | undefined): string | null {
  if (!factionName) return null;
  return `/faction-icons/${factionName}.webp`;
}