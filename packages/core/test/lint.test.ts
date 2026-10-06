import { describe, expect, it } from 'vitest';
import { lint, type QuestionnaireFinding } from '../src/index.js';
import { expectValidReport } from './support/report.js';
import { tempTree } from './support/tmp.js';

const questionnaire = JSON.stringify({ resourceType: 'Questionnaire', id: 'A', status: 'draft' });

describe('lint', () => {
  it('returns a valid completed report for a clean run with built-in defaults', async () => {
    const cwd = await tempTree({ 'fsh-generated/resources/Questionnaire-A.json': questionnaire });
    const report = await lint({ cwd });
    expectValidReport(report);
    expect(report).toMatchObject({
      status: 'completed',
      run: {
        tool: { name: 'sdc-questionnaire-lint' },
        plugins: [{ name: 'sdc' }],
        compat: {},
        selection: 'full',
      },
      findings: [],
      summary: {
        files: { read: 1, skipped: 0 },
        questionnaires: 1,
        expressions: { analysed: 0, unchecked: 0 },
        errors: 0,
        config: null,
        fshSources: [],
        fshSourceLookup: 'enabled',
      },
    });
  });
});

describe('FSH sources in the summary', () => {
  const resources = { 'fsh-generated/resources/Questionnaire-A.json': questionnaire };

  it('lists the default input/fsh when it exists', async () => {
    const cwd = await tempTree({ ...resources, 'input/fsh/': '' });
    expect((await lint({ cwd })).summary).toMatchObject({
      fshSources: ['input/fsh'],
      fshSourceLookup: 'enabled',
    });
  });

  it('lists none when input/fsh is absent', async () => {
    const cwd = await tempTree(resources);
    expect((await lint({ cwd })).summary.fshSources).toEqual([]);
  });
});

describe('expression findings', () => {
  const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
  const fhirPath = (expression: string) => ({ language: 'text/fhirpath', expression });

  async function lintQuestionnaire(resource: Record<string, unknown>) {
    const cwd = await tempTree({
      'fsh-generated/resources/Questionnaire-A.json': JSON.stringify({
        resourceType: 'Questionnaire',
        id: 'A',
        status: 'draft',
        ...resource,
      }),
    });
    const report = await lint({ cwd });
    expectValidReport(report);
    return { report, findings: report.findings as QuestionnaireFinding[] };
  }

  it('reports broken FHIRPath in an uncatalogued site twice, at the same pointer', async () => {
    const { report, findings } = await lintQuestionnaire({
      item: [
        {
          linkId: 'q',
          answerOption: [
            {
              valueString: 'Yes',
              extension: [{ url: 'http://example.org/x', valueExpression: fhirPath('a.where(') }],
            },
          ],
        },
      ],
    });
    const pointer = '/item/0/answerOption/0/extension/0/valueExpression/expression';
    expect(findings).toMatchObject([
      {
        ruleId: 'sdc/parse-error',
        severity: 'error',
        jsonLocation: { pointer, linkId: 'q', resource: { id: 'A', pointer: '' } },
        expression: { text: 'a.where(', range: { startOffset: 8, endOffset: 8 } },
        sourceLocation: { status: 'unmapped', reason: 'source-unavailable' },
      },
      { ruleId: 'sdc/uncatalogued-expression', severity: 'info', jsonLocation: { pointer } },
    ]);
    expect(report.summary).toMatchObject({
      expressions: { analysed: 0, unchecked: 1 },
      errors: 1,
      info: 1,
    });
  });

  it('names the contained resource that holds a site', async () => {
    const { findings } = await lintQuestionnaire({
      contained: [
        {
          resourceType: 'Library',
          id: 'lib',
          extension: [{ url: 'http://example.org/x', valueExpression: fhirPath('1 + 1') }],
        },
      ],
    });
    expect(findings).toMatchObject([
      {
        ruleId: 'sdc/uncatalogued-expression',
        jsonLocation: {
          pointer: '/contained/0/extension/0/valueExpression/expression',
          resource: { resourceType: 'Library', id: 'lib', pointer: '/contained/0' },
        },
      },
    ]);
  });

  it('gives two broken repeated catalogued sites distinct fingerprints', async () => {
    const toggle = (expression: string) => ({
      url: `${sdc}answerOptionsToggleExpression`,
      extension: [{ url: 'expression', valueExpression: fhirPath(expression) }],
    });
    const { report, findings } = await lintQuestionnaire({
      item: [{ linkId: 'q', extension: [toggle('a.where('), toggle('b.where(')] }],
    });
    expect(findings.map(({ ruleId }) => ruleId)).toEqual(['sdc/parse-error', 'sdc/parse-error']);
    expect(findings[0]?.fingerprint).not.toBe(findings[1]?.fingerprint);
    expect(report.summary.expressions).toEqual({ analysed: 2, unchecked: 0 });
  });
});

describe('config', () => {
  const config = 'sdc-questionnaire-lint.config.json';
  const broken = JSON.stringify({
    resourceType: 'Questionnaire',
    id: 'A',
    status: 'draft',
    item: [
      {
        linkId: 'q',
        extension: [
          {
            url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
            valueExpression: { language: 'text/fhirpath', expression: 'a.where(' },
          },
        ],
      },
    ],
  });

  it('applies a configured severity', async () => {
    const cwd = await tempTree({
      [config]: JSON.stringify({ rules: { 'sdc/parse-error': 'warning' } }),
      'fsh-generated/resources/Questionnaire-A.json': broken,
    });
    const report = await lint({ cwd });
    expect(report.findings).toMatchObject([{ ruleId: 'sdc/parse-error', severity: 'warning' }]);
    expect(report.summary).toMatchObject({ errors: 0, warnings: 1, config });
  });

  it('resolves files and source.fsh beneath a config in a subdirectory', async () => {
    const cwd = await tempTree({
      [`ig/${config}`]: JSON.stringify({ files: ['out'], source: { fsh: ['fsh'] } }),
      'ig/out/Questionnaire-A.json': broken,
      'ig/fsh/': '',
    });
    const report = await lint({ cwd, configPath: `ig/${config}` });
    expectValidReport(report);
    expect(report.findings).toMatchObject([
      { jsonLocation: { file: 'ig/out/Questionnaire-A.json' } },
    ]);
    expect(report.summary).toMatchObject({ config: `ig/${config}`, fshSources: ['ig/fsh'] });
  });

  it('fails on an invalid config before looking for inputs', async () => {
    const cwd = await tempTree({ [config]: '{ "rulez": {} }' });
    await expect(lint({ cwd })).rejects.toMatchObject({ code: 'CONFIG_INVALID' });
  });
});
