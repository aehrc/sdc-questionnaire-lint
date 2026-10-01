import { chmod, realpath } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalFiles } from '../../src/inputs/paths.js';
import { readInputs } from '../../src/inputs/read.js';
import { tempTree } from '../support/tmp.js';

const questionnaire = (id: string) => ({ resourceType: 'Questionnaire', id });

const kinds = {
  'Questionnaire-A.json': JSON.stringify(questionnaire('A')),
  'Bundle-B.json': JSON.stringify({
    resourceType: 'Bundle',
    entry: [
      { resource: questionnaire('B1') },
      { resource: { resourceType: 'Patient', id: 'p' } },
      { fullUrl: 'urn:no-resource' },
      { resource: questionnaire('B2') },
    ],
  }),
  'Bundle-ValueSets.json': JSON.stringify({
    resourceType: 'Bundle',
    entry: [{ resource: { resourceType: 'ValueSet', id: 'v' } }],
  }),
  'Patient-P.json': JSON.stringify({ resourceType: 'Patient', id: 'P' }),
  'array.json': '[1, 2]',
  'number.json': '42',
  'bom.json': `\uFEFF${JSON.stringify(questionnaire('Bom'))}`,
};

async function read(files: Record<string, string>) {
  const cwd = await realpath(await tempTree(files));
  const inputs = await canonicalFiles(
    Object.keys(files).map((name) => path.join(cwd, name)),
    cwd,
  );
  return { cwd, result: await readInputs(inputs) };
}

describe('readInputs', () => {
  it('classifies each kind of file and counts read and skipped files', async () => {
    const { result } = await read(kinds);
    expect(result.files).toEqual({ read: 7, skipped: 3 });
    expect(
      result.documents.map((document) => [
        document.file,
        document.resourcePointer,
        document.resource.id,
      ]),
    ).toEqual([
      ['Bundle-B.json', '/entry/0/resource', 'B1'],
      ['Bundle-B.json', '/entry/3/resource', 'B2'],
      ['Questionnaire-A.json', '', 'A'],
      ['bom.json', '', 'Bom'],
    ]);
  });

  it('keeps every Bundle entry resource as a local reference target', async () => {
    const { result } = await read(kinds);
    const [first] = result.documents;
    expect(first?.localResources.map((local) => local.pointer)).toEqual([
      '/entry/0/resource',
      '/entry/1/resource',
      '/entry/3/resource',
    ]);
    expect(
      result.documents.find((document) => document.resource.id === 'A')?.localResources,
    ).toEqual([]);
  });

  it('fails on malformed JSON with the position', async () => {
    await expect(
      read({ 'bad.json': '{\n  "resourceType": "Questionnaire",\n}' }),
    ).rejects.toMatchObject({
      code: 'INPUT_INVALID_JSON',
      path: 'bad.json',
      message: 'input bad.json is not valid JSON: unexpected "}" at line 3, column 1',
    });
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'fails on an unreadable file',
    async () => {
      const cwd = await realpath(await tempTree({ 'a.json': '{}' }));
      await chmod(path.join(cwd, 'a.json'), 0o000);
      const files = await canonicalFiles([path.join(cwd, 'a.json')], cwd);
      await expect(readInputs(files)).rejects.toMatchObject({
        code: 'INPUT_UNREADABLE',
        path: 'a.json',
      });
    },
  );
});
