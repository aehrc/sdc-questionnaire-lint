import { describe, expect, it } from 'vitest';
import { toPointer } from '../src/json-pointer.js';
import { closestName } from '../src/suggest.js';

describe('closestName', () => {
  it('finds a near miss', () => {
    expect(closestName('sdc/undefined-varible', ['sdc/undefined-variable', 'sdc/other'])).toBe(
      'sdc/undefined-variable',
    );
    expect(closestName('file', ['files', 'rules'])).toBe('files');
  });

  it('returns nothing for distant names or an exact match', () => {
    expect(closestName('colour', ['files', 'rules'])).toBeUndefined();
    expect(closestName('files', ['files'])).toBeUndefined();
  });

  it('breaks ties by code unit order', () => {
    expect(closestName('ab', ['bb', 'Ab', 'ac'])).toBe('Ab');
  });
});

describe('toPointer', () => {
  it('escapes ~ and / in segments', () => {
    expect(toPointer(['rules', 'sdc/x~y', 0])).toBe('/rules/sdc~1x~0y/0');
    expect(toPointer([])).toBe('');
  });
});
