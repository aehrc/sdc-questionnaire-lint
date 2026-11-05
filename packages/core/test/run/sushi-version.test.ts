/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findSushiVersion } from '../../src/run/sushi-version.js';
import { tempTree } from '../support/tmp.js';

const manifest = 'node_modules/fsh-sushi/package.json';

function sushi(version: unknown): string {
  return JSON.stringify({ name: 'fsh-sushi', version });
}

describe('findSushiVersion', () => {
  it('reads the fsh-sushi installed in the base', async () => {
    const base = await tempTree({ [manifest]: sushi('3.20.1') });
    expect(await findSushiVersion(base)).toBe('3.20.1');
  });

  it('looks in each directory above the base, as Node does', async () => {
    const root = await tempTree({ [manifest]: sushi('3.20.1'), 'ig/input/fsh/': '' });
    expect(await findSushiVersion(path.join(root, 'ig'))).toBe('3.20.1');
  });

  it('takes the nearest install', async () => {
    const root = await tempTree({
      [manifest]: sushi('3.0.0'),
      [`ig/${manifest}`]: sushi('3.20.1'),
    });
    expect(await findSushiVersion(path.join(root, 'ig'))).toBe('3.20.1');
  });

  it('is undefined when no fsh-sushi is installed', async () => {
    const base = await tempTree({ 'node_modules/other/package.json': '{}' });
    expect(await findSushiVersion(base)).toBeUndefined();
  });

  it.each([
    ['malformed', '{'],
    ['another package', JSON.stringify({ name: 'other', version: '1.0.0' })],
    ['without a version', JSON.stringify({ name: 'fsh-sushi' })],
    ['with an empty version', sushi('')],
    ['with a version that is not a string', sushi(3)],
  ])(
    'is undefined, without looking further up, for a nearest package.json %s',
    async (_case, text) => {
      const root = await tempTree({ [manifest]: sushi('3.0.0'), [`ig/${manifest}`]: text });
      expect(await findSushiVersion(path.join(root, 'ig'))).toBeUndefined();
    },
  );
});
