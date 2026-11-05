/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { describe, expect, it } from 'vitest';
import { closestName } from '../src/suggest.js';

describe('closestName', () => {
  const ids = ['sdc/parse-error', 'sdc/uncatalogued-expression'];

  it('finds a near miss', () => {
    expect(closestName('sdc/parse-eror', ids)).toBe('sdc/parse-error');
  });

  it('finds nothing for a distant name', () => {
    expect(closestName('sdc/undefined-variable', ids)).toBeUndefined();
  });

  it('does not suggest an exact match', () => {
    expect(closestName('sdc/parse-error', ids)).toBeUndefined();
  });

  it('breaks ties by code-unit order', () => {
    expect(closestName('sdc/b', ['sdc/c', 'sdc/a'])).toBe('sdc/a');
    expect(closestName('sdc/b', ['sdc/a', 'sdc/c'])).toBe('sdc/a');
  });
});
