import { chmod, symlink } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { expandEntries } from '../../src/inputs/expand.js';
import { type EntryOrigin, type InputEntry } from '../../src/inputs/select.js';
import { tempTree } from '../support/tmp.js';

function entries(cwd: string, paths: string[], origin: EntryOrigin = 'cli'): InputEntry[] {
  return paths.map((display) => ({ origin, absolute: path.resolve(cwd, display), display }));
}

async function expand(cwd: string, paths: string[], origin?: EntryOrigin): Promise<string[]> {
  const files = await expandEntries(entries(cwd, paths, origin));
  return files.map((file) => path.relative(cwd, file).split(path.sep).join('/')).sort();
}

const tree = {
  'resources/Questionnaire-A.json': '{}',
  'resources/Questionnaire-B.json': '{}',
  'resources/Bundle-C.json': '{}',
  'resources/notes.txt': '',
  'resources/nested/Questionnaire-D.json': '{}',
  'resources/.hidden/Questionnaire-E.json': '{}',
  'resources/node_modules/pkg/Questionnaire-F.json': '{}',
  'resources/.git/Questionnaire-G.json': '{}',
  'outside/Questionnaire-H.json': '{}',
};

describe('expandEntries', () => {
  it('reads a literal file, even inside node_modules or .git', async () => {
    const cwd = await tempTree(tree);
    expect(
      await expand(cwd, [
        'resources/Questionnaire-A.json',
        'resources/node_modules/pkg/Questionnaire-F.json',
        'resources/.git/Questionnaire-G.json',
      ]),
    ).toEqual([
      'resources/.git/Questionnaire-G.json',
      'resources/Questionnaire-A.json',
      'resources/node_modules/pkg/Questionnaire-F.json',
    ]);
  });

  it('treats an existing path with glob characters as a literal', async () => {
    const cwd = await tempTree({ 'a[1].json': '{}', 'a1.json': '{}' });
    expect(await expand(cwd, ['a[1].json'])).toEqual(['a[1].json']);
  });

  it('expands a directory to its .json files, skipping .git, node_modules and directory symlinks', async () => {
    const cwd = await tempTree(tree);
    await symlink(path.join(cwd, 'outside'), path.join(cwd, 'resources', 'linked'), 'dir');
    expect(await expand(cwd, ['resources'])).toEqual([
      'resources/.hidden/Questionnaire-E.json',
      'resources/Bundle-C.json',
      'resources/Questionnaire-A.json',
      'resources/Questionnaire-B.json',
      'resources/nested/Questionnaire-D.json',
    ]);
  });

  it('expands quoted globs with *, ?, ** and character classes', async () => {
    const cwd = await tempTree(tree);
    expect(await expand(cwd, ['resources/Questionnaire-*.json'])).toEqual([
      'resources/Questionnaire-A.json',
      'resources/Questionnaire-B.json',
    ]);
    expect(await expand(cwd, ['resources/Questionnaire-?.json'])).toHaveLength(2);
    expect(await expand(cwd, ['resources/Questionnaire-[B].json'])).toEqual([
      'resources/Questionnaire-B.json',
    ]);
    expect(await expand(cwd, ['resources/**/Questionnaire-*.json'])).toEqual([
      'resources/.hidden/Questionnaire-E.json',
      'resources/Questionnaire-A.json',
      'resources/Questionnaire-B.json',
      'resources/nested/Questionnaire-D.json',
    ]);
  });

  it('expands an absolute glob', async () => {
    const cwd = await tempTree(tree);
    const files = await expandEntries([
      { origin: 'cli', absolute: path.join(cwd, 'resources', '*-A.json'), display: 'x' },
    ]);
    expect(files).toEqual([path.join(cwd, 'resources', 'Questionnaire-A.json')]);
  });

  it('fails on a missing literal, naming the path', async () => {
    const cwd = await tempTree(tree);
    await expect(expand(cwd, ['missing.json'])).rejects.toMatchObject({
      code: 'INPUT_NOT_FOUND',
      path: 'missing.json',
      message: 'input missing.json does not exist',
      help: 'check the path; it is relative to the current directory',
    });
  });

  it('points a missing config entry at the config directory', async () => {
    const cwd = await tempTree(tree);
    await expect(expand(cwd, ['missing.json'], 'config')).rejects.toMatchObject({
      code: 'INPUT_NOT_FOUND',
      help: 'check files in the config; its paths are relative to the config directory',
    });
  });

  it('fails on a glob that matches nothing', async () => {
    const cwd = await tempTree(tree);
    await expect(expand(cwd, ['resources/Patient-*.json'])).rejects.toMatchObject({
      code: 'INPUT_PATTERN_UNMATCHED',
      path: 'resources/Patient-*.json',
      message: 'pattern resources/Patient-*.json matched no files',
    });
  });

  it('fails on a glob below a directory that does not exist', async () => {
    const cwd = await tempTree(tree);
    await expect(expand(cwd, ['nowhere/*.json'])).rejects.toMatchObject({
      code: 'INPUT_PATTERN_UNMATCHED',
    });
  });

  it('fails on a directory without .json files', async () => {
    const cwd = await tempTree({ 'empty/': '', 'text/notes.txt': '' });
    for (const directory of ['empty', 'text']) {
      await expect(expand(cwd, [directory])).rejects.toMatchObject({
        code: 'INPUT_PATTERN_UNMATCHED',
        path: directory,
        message: `directory ${directory} contains no .json files`,
      });
    }
  });

  it('fails when one entry is missing even though another is valid', async () => {
    const cwd = await tempTree(tree);
    await expect(
      expand(cwd, ['resources/Questionnaire-A.json', 'missing.json']),
    ).rejects.toMatchObject({ code: 'INPUT_NOT_FOUND', path: 'missing.json' });
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'fails when a directory cannot be traversed',
    async () => {
      const cwd = await tempTree(tree);
      const locked = path.join(cwd, 'resources', 'nested');
      await chmod(locked, 0o000);
      try {
        await expect(expand(cwd, ['resources'])).rejects.toMatchObject({
          code: 'INPUT_UNREADABLE',
          path: 'resources',
          message: expect.stringContaining('EACCES') as unknown,
        });
      } finally {
        await chmod(locked, 0o755);
      }
    },
  );

  it('returns nothing for a missing or empty default directory', async () => {
    const cwd = await tempTree({ 'fsh-generated/resources/': '' });
    expect(await expand(cwd, ['fsh-generated/resources'], 'default')).toEqual([]);
    expect(await expand(cwd, ['missing/resources'], 'default')).toEqual([]);
  });
});
