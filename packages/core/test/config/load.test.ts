/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/load.js';
import { tempTree } from '../support/tmp.js';

const name = 'sdc-questionnaire-lint.config.json';
const mjsName = 'sdc-questionnaire-lint.config.mjs';

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
      format: 'json',
      config: { files: ['a.json'] },
    });
  });

  it('resolves --config against the working directory', async () => {
    const cwd = await tempTree({ [`ig/${name}`]: '{}' });
    expect(await loadConfig({ cwd, explicitPath: `ig/${name}` })).toEqual({
      path: path.join(cwd, 'ig', name),
      dir: path.join(cwd, 'ig'),
      display: `ig/${name}`,
      format: 'json',
      config: {},
    });
  });

  it('loads a config with a byte order mark', async () => {
    const cwd = await tempTree({ [name]: '﻿{ "rules": {} }' });
    expect((await loadConfig({ cwd }))?.config).toEqual({ rules: {} });
  });

  it.each([
    ['a missing path', {}, 'missing.json', 'config missing.json does not exist'],
    ['a missing path with no extension', {}, 'missing', 'config missing does not exist'],
    ['a directory', { 'dir.json/': '' }, 'dir.json', 'config dir.json is not a file'],
    ['a .js path', { 'c.js': '' }, 'c.js', 'config c.js is neither a .json nor an .mjs file'],
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

  it('discovers an .mjs config and loads its default export', async () => {
    const cwd = await tempTree({ [mjsName]: "export default { files: ['a.json'] };" });
    expect(await loadConfig({ cwd })).toEqual({
      path: path.join(cwd, mjsName),
      dir: cwd,
      display: mjsName,
      format: 'mjs',
      config: { files: ['a.json'] },
    });
  });

  it('loads an .mjs config given with --config', async () => {
    const cwd = await tempTree({ 'ig/lint.mjs': 'export default { rules: {} };' });
    expect(await loadConfig({ cwd, explicitPath: 'ig/lint.mjs' })).toMatchObject({
      display: 'ig/lint.mjs',
      format: 'mjs',
      config: { rules: {} },
    });
  });

  it('loads a config that imports defineConfig from the package', async () => {
    const cwd = fileURLToPath(new URL('../fixtures/config/', import.meta.url));
    const loaded = await loadConfig({ cwd, explicitPath: 'define-config.mjs' });
    expect(loaded?.config).toEqual({ files: ['fsh-generated/resources'] });
  });

  it('fails for an .mjs config without a default export', async () => {
    const cwd = await tempTree({ [mjsName]: 'export const config = {};' });
    await expect(loadConfig({ cwd })).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
      path: mjsName,
      message: `config ${mjsName} has no default export`,
      help: 'export the config object: export default defineConfig({ … })',
    });
  });

  it('fails for an .mjs config that throws while it is imported', async () => {
    const cwd = await tempTree({ [mjsName]: "throw new Error('boom');" });
    await expect(loadConfig({ cwd })).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
      path: mjsName,
      message: `config ${mjsName} failed to load: boom`,
    });
  });

  it('fails when both default configs exist', async () => {
    const cwd = await tempTree({ [name]: '{}', [mjsName]: 'export default {};' });
    await expect(loadConfig({ cwd })).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
      message: `found both ${name} and ${mjsName} in the current directory`,
      help: 'choose one with --config, or remove the other file',
    });
  });

  it('uses --config when both default configs exist', async () => {
    const cwd = await tempTree({ [name]: '{}', [mjsName]: 'export default {};' });
    expect(await loadConfig({ cwd, explicitPath: mjsName })).toMatchObject({ format: 'mjs' });
  });
});
