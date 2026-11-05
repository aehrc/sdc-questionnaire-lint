/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fshFiles } from '../../src/source/fsh-files.js';
import { tempTree } from '../support/tmp.js';

// Parsing a file that holds THROW throws, as an unexpected input could.
vi.mock('../../src/source/fsh-document.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/source/fsh-document.js')>();
  return {
    ...actual,
    parseFshDocument: (text: string) => {
      if (text.includes('THROW')) throw new Error('cannot parse');
      return actual.parseFshDocument(text);
    },
  };
});

describe('fshFiles', () => {
  it('leaves out a file that cannot be parsed, and keeps the others and their aliases', async () => {
    const dir = await tempTree({
      'input/fsh/A.fsh': 'Alias: $a = http://example.org/a\n',
      'input/fsh/B.fsh': 'THROW\n',
    });
    const files = fshFiles([path.join(dir, 'input/fsh')]);
    expect((await files.all()).map((file) => path.basename(file.path))).toEqual(['A.fsh']);
    expect(await files.aliases()).toEqual(new Map([['$a', 'http://example.org/a']]));
    expect(await files.file(path.join(dir, 'input/fsh/B.fsh'))).toBeUndefined();
  });
});
