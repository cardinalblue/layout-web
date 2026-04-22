export interface StagedPhoto {
  id: string;
  src: string;
  aspectRatio: number;
  filename: string;
  source: 'upload' | 'sample';
}

export function photosEqual(a: StagedPhoto[], b: StagedPhoto[]): boolean {
  if (a.length !== b.length) return false;
  const aIds = a.map((p) => p.id).sort();
  const bIds = b.map((p) => p.id).sort();
  for (let i = 0; i < aIds.length; i += 1) {
    if (aIds[i] !== bIds[i]) return false;
  }
  return true;
}
