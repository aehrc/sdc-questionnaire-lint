import { chmod } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { selectConfig } from '../../src/config/discover.js';
import { loadConfig } from '../../src/config/load.js';
import { tempTree } from '../support/tmp.js';

const fixtures = fileURLToPath(new URL('../fixtures/config/', import.meta.url));

async function load(cwd: string, explicitPath: string) {
  const selected = await selectConfig({ cwd, explicitPath });
  if (selected === null) throw new Error('no config selected');
  return loadConfig(selected);
}

describe('loading a JSON config', () => {
  it('parses and validates the file', async () => {
    const cwd = await tempTree({ 'c.json': '{ "files": ["a.json"], "source": { "fsh": [] } }' });
    expect(await load(cwd, 'c.json')).toMatchObject({
      format: 'json',
      display: 'c.json',
      config: { files: ['a.json'], source: { fsh: [] } },
    });
  });

  it('fails on malformed JSON with the line and column', async () => {
    const cwd = await tempTree({ 'c.json': '{\n  "files": [,]\n}' });
    await expect(load(cwd, 'c.json')).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
      path: 'c.json',
      message: 'config c.json is not valid JSON: unexpected "," at line 2, column 13',
    });
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'fails on an unreadable file',
    async () => {
      const cwd = await tempTree({ 'c.json': '{}' });
      await chmod(path.join(cwd, 'c.json'), 0o000);
      await expect(load(cwd, 'c.json')).rejects.toMatchObject({
        code: 'CONFIG_INVALID',
        message: expect.stringMatching(/^cannot read config c\.json: .*EACCES/) as unknown,
      });
    },
  );

  it('fails on a config that is neither .json nor .mjs', async () => {
    const cwd = await tempTree({ 'c.yaml': 'files: []' });
    await expect(load(cwd, 'c.yaml')).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
      path: 'c.yaml',
      message: 'config c.yaml is neither a .json nor an .mjs file',
    });
  });
});

describe('loading an .mjs config', () => {
  it('uses the default export made with defineConfig', async () => {
    expect(await load(fixtures, 'define-config.mjs')).toMatchObject({
      format: 'mjs',
      config: { files: ['fsh-generated/resources'], source: { fsh: [] } },
    });
  });

  it('uses a plain default export', async () => {
    expect((await load(fixtures, 'plain-object.mjs')).config).toEqual({
      rules: { 'lint/stale-suppression': 'error' },
    });
  });

  it('reports an exception during import by message, without a stack trace', async () => {
    const failure = load(fixtures, 'throws.mjs');
    await expect(failure).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
      path: 'throws.mjs',
      message: 'config throws.mjs failed to load: the config module is broken',
    });
  });

  it('fails without a default export', async () => {
    await expect(load(fixtures, 'no-default.mjs')).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
      message: 'config no-default.mjs has no default export',
    });
  });

  it('fails when the default export is not an object', async () => {
    await expect(load(fixtures, 'not-object.mjs')).rejects.toMatchObject({
      code: 'CONFIG_INVALID',
      message:
        'config not-object.mjs is invalid at the top level: expected a config object, got a number',
      help: 'export the config object: export default defineConfig({ … })',
    });
  });
});
