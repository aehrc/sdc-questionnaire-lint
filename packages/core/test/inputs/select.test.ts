import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RunPaths } from '../../src/config/paths.js';
import { selectInputEntries } from '../../src/inputs/select.js';

const cwd = path.resolve('/work');
const ig = path.join(cwd, 'ig');

function runPaths(configFiles?: string[]): RunPaths {
  return {
    base: path.join(cwd, 'ig'),
    ...(configFiles === undefined ? {} : { configFiles }),
    fshDirectories: [],
    fshSourceLookup: 'enabled',
    defaultInputDirectory: path.join(cwd, 'ig', 'fsh-generated', 'resources'),
    sushiIndex: path.join(cwd, 'ig', 'fsh-generated', 'data', 'fsh-index.json'),
  };
}

describe('selectInputEntries', () => {
  it('makes a targeted run from CLI paths, resolved against the working directory', () => {
    const selected = selectInputEntries({
      cwd,
      cliPaths: ['./a.json', 'resources/*.json'],
      runPaths: runPaths([path.join(cwd, 'ig', 'b.json')]),
    });
    expect(selected).toEqual({
      runKind: 'targeted',
      entries: [
        { origin: 'cli', absolute: path.join(cwd, 'a.json'), base: cwd, display: 'a.json' },
        {
          origin: 'cli',
          absolute: path.join(cwd, 'resources', '*.json'),
          base: cwd,
          display: 'resources/*.json',
        },
      ],
    });
  });

  it('stays targeted when CLI paths cover every configured file', () => {
    const file = path.join(cwd, 'ig', 'a.json');
    expect(
      selectInputEntries({ cwd, cliPaths: ['ig/a.json'], runPaths: runPaths([file]) }).runKind,
    ).toBe('targeted');
  });

  it('makes a full run from config files', () => {
    const files = [path.join(cwd, 'ig', 'resources'), path.join(cwd, 'ig', 'extra', '*.json')];
    expect(selectInputEntries({ cwd, cliPaths: [], runPaths: runPaths(files) })).toEqual({
      runKind: 'full',
      entries: [
        { origin: 'config', absolute: files[0], base: ig, display: 'ig/resources' },
        { origin: 'config', absolute: files[1], base: ig, display: 'ig/extra/*.json' },
      ],
    });
  });

  it('makes a full run from the default directory', () => {
    expect(selectInputEntries({ cwd, cliPaths: [], runPaths: runPaths() })).toEqual({
      runKind: 'full',
      entries: [
        {
          origin: 'default',
          absolute: path.join(cwd, 'ig', 'fsh-generated', 'resources'),
          base: ig,
          display: 'ig/fsh-generated/resources',
        },
      ],
    });
  });
});
