import { describe, expect, it } from 'vitest';
import { normalizeModIds } from './autoupdatemods';

describe('autoUpdateMods', () => {
  it('normalizes legacy and multi-mod configuration without duplicates', () => {
    expect(
      normalizeModIds('3293347373', [
        '3293347373',
        '3733486657 3733541273',
        'not-a-workshop-id',
      ]),
    ).toEqual(['3293347373', '3733486657', '3733541273']);
  });

  it('supports comma-separated mod IDs', () => {
    expect(normalizeModIds(undefined, '3193475024,3293347373')).toEqual([
      '3193475024',
      '3293347373',
    ]);
  });
});
