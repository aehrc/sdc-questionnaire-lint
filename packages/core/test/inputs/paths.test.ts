/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { realpath, symlink } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadInputs } from '../../src/inputs/load-inputs.js';
import { canonicalizeInputFiles, displayPath } from '../../src/inputs/paths.js';
import { resolveRunPaths } from '../../src/config/paths.js';
import { tempTree } from '../support/tmp.js';

const questionnaire = JSON.stringify({ resourceType: 'Questionnaire', id: 'A' });

describe('displayPath', () => {
  it('renders paths relative to the working directory with / separators', () => {
    const cwd = path.resolve('/work/ig');
    expect(displayPath(path.join(cwd, 'resources', 'a.json'), cwd)).toBe('resources/a.json');
    expect(displayPath(path.resolve('/work/other/a.json'), cwd)).toBe('../other/a.json');
    expect(displayPath(cwd, cwd)).toBe('.');
  });
});

describe('canonicalizeInputFiles', () => {
  it('reads a file selected by a literal, a directory and a glob once', async () => {
    const cwd = await tempTree({ 'resources/a.json': questionnaire });
    const inputs = await loadInputs({
      cwd,
      cliPaths: ['resources/a.json', 'resources', 'resources/*.json'],
      runPaths: resolveRunPaths({ cwd, config: null }),
    });
    expect(inputs.fileCounts.read).toBe(1);
    expect(inputs.documents).toHaveLength(1);
  });

  it('treats a symlinked file and its target as one file, shown by its target', async () => {
    const cwd = await realpath(await tempTree({ 'a.json': questionnaire }));
    await symlink(path.join(cwd, 'a.json'), path.join(cwd, 'link.json'));
    expect(
      await canonicalizeInputFiles([path.join(cwd, 'link.json'), path.join(cwd, 'a.json')], {
        cwd,
        base: cwd,
      }),
    ).toEqual([{ path: path.join(cwd, 'a.json'), display: 'a.json', baseRelative: 'a.json' }]);
  });

  it('sorts by display path by code unit', async () => {
    // Distinct names, since macOS file systems are case-insensitive.
    const names = ['éclair.json', 'fig.json', 'alpha.json', 'Zeta.json'];
    const cwd = await realpath(
      await tempTree(Object.fromEntries(names.map((name) => [name, '{}']))),
    );
    const files = await canonicalizeInputFiles(
      names.map((name) => path.join(cwd, name)),
      { cwd, base: cwd },
    );
    expect(files.map((file) => file.display)).toEqual([
      'Zeta.json',
      'alpha.json',
      'fig.json',
      'éclair.json',
    ]);
  });

  it('renders relative paths beneath a symlinked temporary root', async () => {
    // On macOS the temporary directory is a symlink into /private.
    const cwd = await tempTree({ 'resources/a.json': questionnaire });
    const inputs = await loadInputs({
      cwd,
      cliPaths: ['resources/a.json'],
      runPaths: resolveRunPaths({ cwd, config: null }),
    });
    expect(inputs.documents[0]?.document.file).toBe('resources/a.json');
  });
});
