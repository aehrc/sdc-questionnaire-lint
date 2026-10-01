import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RunPaths } from '../../src/config/paths.js';
import { selectInputs } from '../../src/inputs/select.js';

const cwd = path.resolve('/work');

function runPaths(configFiles?: string[]): RunPaths {
  return {
    ...(configFiles === undefined ? {} : { configFiles }),
    fshDirectories: [],
    fshSourceLookup: 'enabled',
    suppressionFiles: [],
    defaultInputDirectory: path.join(cwd, 'ig', 'fsh-generated', 'resources'),
    sushiIndex: path.join(cwd, 'ig', 'fsh-generated', 'data', 'fsh-index.json'),
  };
}

describe('selectInputs', () => {
  it('makes a targeted run from CLI paths, resolved against the working directory', () => {
    const selected = selectInputs({
      cwd,
      cliPaths: ['./a.json', 'resources/*.json'],
      runPaths: runPaths([path.join(cwd, 'ig', 'b.json')]),
    });
    expect(selected).toEqual({
      selection: 'targeted',
      entries: [
        { origin: 'cli', absolute: path.join(cwd, 'a.json'), display: 'a.json' },
        {
          origin: 'cli',
          absolute: path.join(cwd, 'resources', '*.json'),
          display: 'resources/*.json',
        },
      ],
    });
  });

  it('stays targeted when CLI paths cover every configured file', () => {
    const file = path.join(cwd, 'ig', 'a.json');
    expect(
      selectInputs({ cwd, cliPaths: ['ig/a.json'], runPaths: runPaths([file]) }).selection,
    ).toBe('targeted');
  });

  it('makes a full run from config files', () => {
    const files = [path.join(cwd, 'ig', 'resources'), path.join(cwd, 'ig', 'extra', '*.json')];
    expect(selectInputs({ cwd, cliPaths: [], runPaths: runPaths(files) })).toEqual({
      selection: 'full',
      entries: [
        { origin: 'config', absolute: files[0], display: 'ig/resources' },
        { origin: 'config', absolute: files[1], display: 'ig/extra/*.json' },
      ],
    });
  });

  it('makes a full run from the default directory', () => {
    expect(selectInputs({ cwd, cliPaths: [], runPaths: runPaths() })).toEqual({
      selection: 'full',
      entries: [
        {
          origin: 'default',
          absolute: path.join(cwd, 'ig', 'fsh-generated', 'resources'),
          display: 'ig/fsh-generated/resources',
        },
      ],
    });
  });
});
