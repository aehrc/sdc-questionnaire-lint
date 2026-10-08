import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareFindings, runCorpus, type CorpusFinding } from '../../scripts/corpus.js';
import { tempTree } from '../support/tmp.js';

function finding(overrides: Partial<CorpusFinding> = {}): CorpusFinding {
  return {
    ruleId: 'sdc/parse-error',
    severity: 'error',
    file: 'forms/A.json',
    pointer: '/item/0/extension/0/valueExpression/expression',
    ...overrides,
  };
}

describe('compareFindings', () => {
  it('reports nothing when the findings match the snapshot', () => {
    expect(compareFindings([finding()], [finding()])).toEqual({ added: [], removed: [] });
  });

  it('reports findings only in the current run as added, and only in the snapshot as removed', () => {
    const kept = finding();
    const gone = finding({ file: 'forms/B.json' });
    const fresh = finding({ ruleId: 'sdc/unknown-function' });
    expect(compareFindings([kept, gone], [fresh, kept])).toEqual({
      added: [fresh],
      removed: [gone],
    });
  });

  it('counts repeated findings at one site', () => {
    expect(compareFindings([finding()], [finding(), finding()])).toEqual({
      added: [finding()],
      removed: [],
    });
  });

  it('treats a changed severity as a removed and an added finding', () => {
    const warning = finding({ severity: 'warning' });
    expect(compareFindings([finding()], [warning])).toEqual({
      added: [warning],
      removed: [finding()],
    });
  });
});

describe('runCorpus', () => {
  const secretExpression = 'secretName.where(';
  const form = JSON.stringify({
    resourceType: 'Questionnaire',
    status: 'draft',
    item: [
      {
        linkId: 'a',
        type: 'string',
        extension: [
          {
            url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
            valueExpression: { language: 'text/fhirpath', expression: secretExpression },
          },
        ],
      },
    ],
  });
  const pointer = '/item/0/extension/0/valueExpression/expression';

  it('exits with a message when the corpus is missing', async () => {
    const root = await tempTree();
    const result = runCorpus(path.join(root, 'corpus'), false);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('corpus');
    expect(result.stderr).toContain('docs/core-rules.md');
  });

  it('lists every finding as added when there is no snapshot, without expression text', async () => {
    const corpus = await tempTree({ 'forms/A.json': form });
    const result = runCorpus(corpus, false);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('sdc/parse-error: 1 added');
    expect(result.stdout).toContain(`forms/A.json ${pointer}`);
    expect(result.stdout).toContain('--update');
    expect(result.stdout).not.toContain(secretExpression);
  });

  it('saves the snapshot with --update, after which a run reports no changes', async () => {
    const corpus = await tempTree({ 'forms/A.json': form });
    expect(runCorpus(corpus, true).code).toBe(0);
    const snapshot: unknown = JSON.parse(
      await readFile(path.join(corpus, 'findings.json'), 'utf8'),
    );
    expect(snapshot).toEqual([finding({ pointer })]);

    const result = runCorpus(corpus, false);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('No findings were added or removed.');
  });

  it('lists a finding the snapshot has and the run does not as removed', async () => {
    const corpus = await tempTree({ 'forms/A.json': form });
    const gone = finding({ file: 'forms/Gone.json', ruleId: 'sdc/query-syntax' });
    await writeFile(
      path.join(corpus, 'findings.json'),
      JSON.stringify([finding({ pointer }), gone]),
    );
    const result = runCorpus(corpus, false);
    expect(result.stdout).toContain('sdc/query-syntax: 1 removed');
    expect(result.stdout).toContain(`forms/Gone.json ${gone.pointer}`);
    expect(result.stdout).not.toContain('sdc/parse-error');
  });

  it('exits with the linter failure when the run does not complete', async () => {
    const corpus = await tempTree({ 'forms/A.json': '{' });
    const result = runCorpus(corpus, false);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('INPUT_INVALID_JSON');
  });
});
