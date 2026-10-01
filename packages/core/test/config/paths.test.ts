import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LoadedConfig } from '../../src/config/load.js';
import { resolveRunPaths } from '../../src/config/paths.js';
import type { LintConfig } from '../../src/config/types.js';

const cwd = path.resolve('/work');

function loaded(file: string, config: LintConfig): LoadedConfig {
  return { path: file, dir: path.dirname(file), display: 'unused', format: 'json', config };
}

describe('resolveRunPaths', () => {
  it('resolves config values and defaults beneath an explicit config in a subdirectory', () => {
    // sdc-lint lint --config ig/sdc-questionnaire-lint.config.json, run from the parent of ig.
    const config = loaded(path.join(cwd, 'ig', 'sdc-questionnaire-lint.config.json'), {
      files: ['fsh-generated/resources', 'extra/Questionnaire-*.json'],
      suppress: [
        { rule: 'sdc/x', file: 'fsh-generated/resources/A.json', reason: 'Why.' },
        { rule: 'sdc/y', file: '../outside/B.json', reason: 'Why.' },
      ],
    });
    expect(resolveRunPaths({ cwd, config })).toEqual({
      configFiles: [
        path.join(cwd, 'ig', 'fsh-generated', 'resources'),
        path.join(cwd, 'ig', 'extra', 'Questionnaire-*.json'),
      ],
      fshDirectories: [path.join(cwd, 'ig', 'input', 'fsh')],
      fshSourceLookup: 'enabled',
      suppressionFiles: [
        path.join(cwd, 'ig', 'fsh-generated', 'resources', 'A.json'),
        path.join(cwd, 'outside', 'B.json'),
      ],
      defaultInputDirectory: path.join(cwd, 'ig', 'fsh-generated', 'resources'),
      sushiIndex: path.join(cwd, 'ig', 'fsh-generated', 'data', 'fsh-index.json'),
    });
  });

  it('resolves against an absolute config path anywhere', () => {
    const other = path.resolve('/elsewhere/ig');
    const config = loaded(path.join(other, 'c.mjs'), { source: { fsh: ['fsh', '../shared/fsh'] } });
    const paths = resolveRunPaths({ cwd, config });
    expect(paths.fshDirectories).toEqual([
      path.join(other, 'fsh'),
      path.resolve('/elsewhere/shared/fsh'),
    ]);
    expect(paths.defaultInputDirectory).toBe(path.join(other, 'fsh-generated', 'resources'));
  });

  it('uses the working directory without a config', () => {
    expect(resolveRunPaths({ cwd, config: null })).toEqual({
      fshDirectories: [path.join(cwd, 'input', 'fsh')],
      fshSourceLookup: 'enabled',
      suppressionFiles: [],
      defaultInputDirectory: path.join(cwd, 'fsh-generated', 'resources'),
      sushiIndex: path.join(cwd, 'fsh-generated', 'data', 'fsh-index.json'),
    });
  });

  it('omits FSH lookup for source.fsh: []', () => {
    const config = loaded(path.join(cwd, 'c.json'), { source: { fsh: [] } });
    expect(resolveRunPaths({ cwd, config })).toMatchObject({
      fshDirectories: [],
      fshSourceLookup: 'omitted',
    });
  });

  it('keeps an absolute config value unchanged', () => {
    const absolute = path.resolve('/data/resources');
    const config = loaded(path.join(cwd, 'c.json'), { files: [absolute] });
    expect(resolveRunPaths({ cwd, config }).configFiles).toEqual([absolute]);
  });
});
