import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ResourceIdentity } from '../../src/report/types.js';
import { findDefinition, type DefinitionLookup } from '../../src/source/definitions.js';
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

async function lookup(
  files: Record<string, string>,
  resource: ResourceIdentity = root,
  fshDirectories = ['input/fsh'],
): Promise<DefinitionLookup> {
  const dir = await tempTree({ [output]: '{}', ...files });
  const inputPath = await realpath(path.join(dir, output));
  return findDefinition(
    { resource, inputPath },
    await readSushiIndex(path.join(dir, indexFile)),
    fshFiles(fshDirectories.map((directory) => path.join(dir, directory))),
  );
}

// Where a lookup found its definition: its file, relative to input/fsh, and its name.
function found(result: DefinitionLookup): string {
  if ('reason' in result) return result.reason;
  return `${path.basename(result.file.path)} ${result.definition.name}`;
}

describe('findDefinition through the SUSHI index', () => {
  it('uses a current entry, even for an Instance a search could not identify', async () => {
    const result = await lookup({ [indexFile]: index(), 'input/fsh/HC.fsh': profiled });
    expect(found(result)).toBe('HC.fsh HealthCheck');
  });

  it('ignores an entry whose startLine is stale', async () => {
    const result = await lookup({
      [indexFile]: index(),
      'input/fsh/HC.fsh': `// moved down\n${profiled}`,
    });
    expect(found(result)).toBe('not-found');
  });

  it('ignores an entry whose fshFile escapes the FSH directories', async () => {
    const result = await lookup({
      [indexFile]: index({ fshFile: '../../outside.fsh' }),
      'outside.fsh': profiled,
      'input/fsh/README.md': '',
    });
    expect(found(result)).toBe('not-found');
  });

  it('ignores an entry for another output file', async () => {
    const result = await lookup({
      [indexFile]: index({ outputFile: 'Questionnaire-Other.json' }),
      'input/fsh/HC.fsh': profiled,
    });
    expect(found(result)).toBe('not-found');
  });

  it('searches instead of using an entry for a resource inside the file', async () => {
    const result = await lookup(
      { [indexFile]: index(), 'input/fsh/HC.fsh': profiled },
      { ...root, pointer: '/entry/0/resource' },
    );
    expect(found(result)).toBe('not-found');
  });

  it.each([
    ['missing', {}],
    ['malformed', { [indexFile]: '{ not json' }],
    ['not an array', { [indexFile]: '{}' }],
  ])('searches the FSH directories when the index is %s', async (_, files) => {
    const result = await lookup({ ...files, 'input/fsh/HC.fsh': plain });
    expect(found(result)).toBe('HC.fsh HealthCheck');
  });
});

describe('findDefinition by searching the FSH directories', () => {
  it('matches the id rule rather than the Instance name', async () => {
    const result = await lookup({
      'input/fsh/a.fsh': 'Instance: HC\nInstanceOf: Questionnaire\n* id = "other"\n',
      'input/fsh/b.fsh': plain,
    });
    expect(found(result)).toBe('b.fsh HealthCheck');
  });

  it('matches the Instance name when there is no id rule', async () => {
    const result = await lookup({ 'input/fsh/a.fsh': 'Instance: HC\nInstanceOf: Questionnaire\n' });
    expect(found(result)).toBe('a.fsh HC');
  });

  it('tells two Instances with the same id apart by InstanceOf', async () => {
    const result = await lookup({
      'input/fsh/a.fsh': 'Instance: PatientHC\nInstanceOf: Patient\n* id = "HC"\n',
      'input/fsh/b.fsh': plain,
    });
    expect(found(result)).toBe('b.fsh HealthCheck');
  });

  it('finds an inline Instance in a Bundle entry or contained resource', async () => {
    const inline = 'Instance: Inline\nInstanceOf: Questionnaire\nUsage: #inline\n* id = "in"\n';
    const resource = { resourceType: 'Questionnaire', id: 'in' };
    for (const pointer of ['/entry/0/resource', '/contained/0']) {
      const result = await lookup({ 'input/fsh/a.fsh': inline }, { ...resource, pointer });
      expect(found(result)).toBe('a.fsh Inline');
    }
  });

  it('follows the Parent chain of profiles in the FSH directories, by name or Id', async () => {
    const result = await lookup({
      'input/fsh/profiles.fsh':
        'Profile: Base\nParent: Questionnaire\n\nProfile: Render\nId: render\nParent: Base\n',
      'input/fsh/a.fsh': 'Instance: HealthCheck\nInstanceOf: render\n* id = "HC"\n',
    });
    expect(found(result)).toBe('a.fsh HealthCheck');
  });

  it('finds nothing when two Instances match', async () => {
    const result = await lookup({ 'input/fsh/a.fsh': plain, 'input/fsh/b.fsh': plain });
    expect(found(result)).toBe('not-found');
  });

  it('finds nothing for a resource without an id', async () => {
    const result = await lookup(
      { 'input/fsh/a.fsh': plain },
      { resourceType: 'Questionnaire', pointer: '' },
    );
    expect(found(result)).toBe('not-found');
  });

  it('searches every FSH directory, but not node_modules', async () => {
    const result = await lookup(
      {
        'input/fsh/node_modules/x/a.fsh': plain,
        'more/b.fsh': plain,
      },
      root,
      ['input/fsh', 'more'],
    );
    expect(found(result)).toBe('b.fsh HealthCheck');
  });

  it('finds nothing when no FSH directory exists', async () => {
    expect(found(await lookup({}, root, ['missing']))).toBe('not-found');
  });
});
