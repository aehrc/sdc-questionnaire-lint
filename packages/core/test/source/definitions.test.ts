import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ResourceIdentity } from '../../src/report/types.js';
import { findDefinition } from '../../src/source/definitions.js';
import { fshFiles } from '../../src/source/fsh-files.js';
import { readSushiIndex } from '../../src/source/sushi-index.js';
import { tempTree } from '../support/tmp.js';

const output = 'fsh-generated/resources/Questionnaire-HC.json';
const indexFile = 'fsh-generated/data/fsh-index.json';

function index(entry: Record<string, unknown> = {}): string {
  return JSON.stringify([
    {
      outputFile: 'Questionnaire-HC.json',
      fshName: 'HealthCheck',
      fshType: 'Instance',
      fshFile: 'HC.fsh',
      startLine: 1,
      endLine: 3,
      ...entry,
    },
  ]);
}

// An Instance whose InstanceOf is a profile from a package, so only the index can find it.
const profiled = 'Instance: HealthCheck\nInstanceOf: sdc-questionnaire-render\n* id = "HC"\n';
const plain = 'Instance: HealthCheck\nInstanceOf: Questionnaire\n* id = "HC"\n';

const root: ResourceIdentity = { resourceType: 'Questionnaire', id: 'HC', pointer: '' };

// One lookup: the files of a project, the resource looked up and the FSH directories.
interface Lookup {
  readonly files: Readonly<Record<string, string>>;
  readonly resource?: ResourceIdentity;
  readonly directories?: readonly string[];
}

// Where a lookup found its definition: its file name and its name, or the reason.
async function lookup({
  files,
  resource = root,
  directories = ['input/fsh'],
}: Lookup): Promise<string> {
  const dir = await tempTree({ [output]: '{}', ...files });
  const inputPath = await realpath(path.join(dir, output));
  const result = await findDefinition(
    { resource, inputPath },
    await readSushiIndex(path.join(dir, indexFile)),
    fshFiles(directories.map((directory) => path.join(dir, directory))),
  );
  if ('reason' in result) return result.reason;
  return `${path.basename(result.file.path)} ${result.definition.name}`;
}

// A current entry, an id that differs from the Instance name, InstanceOf telling two Instances
// apart, and inline Instances are rows of the SUSHI-compiled fixture (fixtures.test.ts).
describe('findDefinition through the SUSHI index', () => {
  it.each<[string, Lookup, string]>([
    [
      'ignores an entry whose startLine is stale',
      { files: { [indexFile]: index(), 'input/fsh/HC.fsh': `// moved down\n${profiled}` } },
      'not-found',
    ],
    [
      'ignores an entry whose fshFile escapes the FSH directories',
      {
        files: {
          [indexFile]: index({ fshFile: '../../outside.fsh' }),
          'outside.fsh': profiled,
          'input/fsh/README.md': '',
        },
      },
      'not-found',
    ],
    [
      'checks the entry in every FSH directory that holds its fshFile',
      {
        files: {
          [indexFile]: index(),
          'input/fsh/HC.fsh': 'Instance: Other\nInstanceOf: Questionnaire\n',
          'shared/fsh/HC.fsh': profiled,
        },
        directories: ['input/fsh', 'shared/fsh'],
      },
      'HC.fsh HealthCheck',
    ],
    [
      'ignores an entry for another output file',
      {
        files: {
          [indexFile]: index({ outputFile: 'Questionnaire-Other.json' }),
          'input/fsh/HC.fsh': profiled,
        },
      },
      'not-found',
    ],
    [
      'searches instead of using an entry for a resource inside the file',
      {
        files: { [indexFile]: index(), 'input/fsh/HC.fsh': profiled },
        resource: { ...root, pointer: '/entry/0/resource' },
      },
      'not-found',
    ],
    [
      'searches when the index is missing',
      { files: { 'input/fsh/HC.fsh': plain } },
      'HC.fsh HealthCheck',
    ],
    [
      'searches when the index is malformed',
      { files: { [indexFile]: '{ not json', 'input/fsh/HC.fsh': plain } },
      'HC.fsh HealthCheck',
    ],
    [
      'searches when the index is not an array',
      { files: { [indexFile]: '{}', 'input/fsh/HC.fsh': plain } },
      'HC.fsh HealthCheck',
    ],
  ])('%s', async (_, target, expected) => {
    expect(await lookup(target)).toBe(expected);
  });
});

describe('findDefinition by searching the FSH directories', () => {
  it.each<[string, Lookup, string]>([
    [
      'matches the Instance name when there is no id rule',
      { files: { 'input/fsh/a.fsh': 'Instance: HC\nInstanceOf: Questionnaire\n' } },
      'a.fsh HC',
    ],
    [
      'follows the Parent chain of profiles in the FSH directories, by name or Id',
      {
        files: {
          'input/fsh/profiles.fsh':
            'Profile: Base\nParent: Questionnaire\n\nProfile: Render\nId: render\nParent: Base\n',
          'input/fsh/a.fsh': 'Instance: HealthCheck\nInstanceOf: render\n* id = "HC"\n',
        },
      },
      'a.fsh HealthCheck',
    ],
    [
      'finds nothing when two Instances match',
      { files: { 'input/fsh/a.fsh': plain, 'input/fsh/b.fsh': plain } },
      'not-found',
    ],
    [
      'finds nothing for a resource without an id',
      {
        files: { 'input/fsh/a.fsh': plain },
        resource: { resourceType: 'Questionnaire', pointer: '' },
      },
      'not-found',
    ],
    [
      'searches every FSH directory, but not node_modules',
      {
        files: { 'input/fsh/node_modules/x/a.fsh': plain, 'more/b.fsh': plain },
        directories: ['input/fsh', 'more'],
      },
      'b.fsh HealthCheck',
    ],
    [
      'finds nothing when no FSH directory exists',
      { files: {}, directories: ['missing'] },
      'not-found',
    ],
  ])('%s', async (_, target, expected) => {
    expect(await lookup(target)).toBe(expected);
  });
});
