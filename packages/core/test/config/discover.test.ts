import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectConfig } from '../../src/config/discover.js';
import { tempTree } from '../support/tmp.js';

const json = 'sdc-questionnaire-lint.config.json';
const mjs = 'sdc-questionnaire-lint.config.mjs';

describe('selectConfig with --config', () => {
  it('resolves a relative path against the working directory', async () => {
    const cwd = await tempTree({ [`ig/${json}`]: '{}' });
    expect(await selectConfig({ cwd, explicitPath: `ig/${json}` })).toEqual({
      path: path.join(cwd, 'ig', json),
      dir: path.join(cwd, 'ig'),
      display: `ig/${json}`,
    });
  });

  it('accepts an absolute path', async () => {
    const root = await tempTree({ [`elsewhere/${json}`]: '{}', 'work/': '' });
    const file = path.join(root, 'elsewhere', json);
    const selected = await selectConfig({ cwd: path.join(root, 'work'), explicitPath: file });
    expect(selected).toMatchObject({ path: file, display: `../elsewhere/${json}` });
  });

  it('fails when the file does not exist, without falling back to discovery', async () => {
    const cwd = await tempTree({ [json]: '{}' });
    await expect(selectConfig({ cwd, explicitPath: 'missing.json' })).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
      path: 'missing.json',
      message: 'config file missing.json does not exist',
    });
  });

  it('fails when the path is a directory', async () => {
    const cwd = await tempTree({ 'ig/': '' });
    await expect(selectConfig({ cwd, explicitPath: 'ig' })).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
      path: 'ig',
      message: 'config path ig is not a file',
    });
  });
});

describe('selectConfig discovery', () => {
  it.each([json, mjs])('finds %s in the working directory', async (name) => {
    const cwd = await tempTree({ [name]: '' });
    expect(await selectConfig({ cwd })).toEqual({
      path: path.join(cwd, name),
      dir: cwd,
      display: name,
    });
  });

  it('fails when both files exist and asks for --config', async () => {
    const cwd = await tempTree({ [json]: '{}', [mjs]: '' });
    await expect(selectConfig({ cwd })).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
      message: `found both ${json} and ${mjs} in the current directory`,
      help: 'choose one with --config, or remove the other file',
    });
  });

  it('returns null when neither exists', async () => {
    expect(await selectConfig({ cwd: await tempTree() })).toBeNull();
  });

  it('does not search parent directories', async () => {
    const root = await tempTree({ [json]: '{}', 'ig/': '' });
    expect(await selectConfig({ cwd: path.join(root, 'ig') })).toBeNull();
  });

  it('ignores a directory with a config file name', async () => {
    const cwd = await tempTree({ [`${json}/`]: '' });
    expect(await selectConfig({ cwd })).toBeNull();
  });
});
