import { describe, it, expect } from 'vitest';
import { photosEqual, type StagedPhoto } from '../components/v9/stagedPhotos';

function p(id: string, source: 'upload' | 'sample' = 'upload'): StagedPhoto {
  return { id, src: `blob:${id}`, aspectRatio: 1, filename: `${id}.jpg`, source };
}

describe('photosEqual', () => {
  it('returns true for two empty lists', () => {
    expect(photosEqual([], [])).toBe(true);
  });

  it('returns true when both lists contain identical ids', () => {
    expect(photosEqual([p('a'), p('b')], [p('a'), p('b')])).toBe(true);
  });

  it('is order-insensitive', () => {
    expect(photosEqual([p('a'), p('b'), p('c')], [p('c'), p('a'), p('b')])).toBe(true);
  });

  it('returns false when lengths differ', () => {
    expect(photosEqual([p('a')], [p('a'), p('b')])).toBe(false);
  });

  it('returns false when ids differ', () => {
    expect(photosEqual([p('a'), p('b')], [p('a'), p('c')])).toBe(false);
  });

  it('ignores source field (id is the identity)', () => {
    expect(photosEqual([p('a', 'upload')], [p('a', 'sample')])).toBe(true);
  });
});
