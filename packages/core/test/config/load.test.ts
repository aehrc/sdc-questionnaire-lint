import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/load.js';
import { tempTree } from '../support/tmp.js';

const name = 'sdc-questionnaire-lint.config.json';

describe('loadConfig', () => {
  it('gives null when the working directory has no config', async () => {
    expect(await loadConfig({ cwd: await tempTree() })).toBeNull();
  });

  it('does not discover a config in a parent directory', async () => {
    const root = await tempTree({ [name]: '{}', 'ig/': '' });
    expect(await loadConfig({ cwd: path.join(root, 'ig') })).toBeNull();
  });

  it('discovers the config in the working directory', async () => {
    const cwd = await tempTree({ [name]: '{ "files": ["a.json"] }' });
    expect(await loadConfig({ cwd })).toEqual({
      path: path.join(cwd, name),
      dir: cwd,
      display: name,
      config: { files: ['a.json'] },
    });
  });

  it('resolves --config against the working directory', async () => {
    const cwd = await tempTree({ [`ig/${name}`]: '{}' });
    expect(await loadConfig({ cwd, explicitPath: `ig/${name}` })).toEqual({
      path: path.join(cwd, 'ig', name),
      dir: path.join(cwd, 'ig'),
      display: `ig/${name}`,
      config: {},
    });
  });

  it('loads a config with a byte order mark', async () => {
    const cwd = await tempTree({ [name]: '﻿{ "rules": {} }' });
    expect((await loadConfig({ cwd }))?.config).toEqual({ rules: {} });
  });

  it.each([
    ['a missing path', {}, 'missing.json', 'config missing.json does not exist'],
    ['a directory', { 'dir.json/': '' }, 'dir.json', 'config dir.json is not a file'],
    ['a .mjs path', { 'c.mjs': '' }, 'c.mjs', 'config c.mjs is not a JSON file'],
    ['invalid JSON', { 'c.json': '{ files' }, 'c.json', /^config c\.json is not valid JSON: \S/],
  ])('fails for %s with CONFIG_INVALID', async (_, files, explicitPath, message) => {
    const cwd = await tempTree(files);
    await expect(loadConfig({ cwd, explicitPath })).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
      path: explicitPath,
      message,
    });
  });

  it('fails for an explicit config that is missing even when one would be discovered', async () => {
    const cwd = await tempTree({ [name]: '{}' });
    await expect(loadConfig({ cwd, explicitPath: 'other.json' })).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
    });
  });

  it('validates the discovered config', async () => {
    const cwd = await tempTree({ [name]: '{ "rulez": {} }' });
    await expect(loadConfig({ cwd })).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
      message: `config ${name} is invalid at /rulez: unknown key rulez`,
    });
  });
});
