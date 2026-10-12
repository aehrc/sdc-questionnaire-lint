import { describe, expect, it } from 'vitest';
import type { ExpressionSite, QuestionnaireDocument } from '../src/analysis/expression-site.js';
import { findExpressionSites } from '../src/analysis/expression-sites.js';
import { lint, type CompletedReport, type QuestionnaireFinding } from '../src/index.js';
import { lintWithRules } from '../src/lint.js';
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
  const queryLanguages = ['application/x-fhir-query', 'text/x-fhir-query'];
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

  it('reports a query on an enableWhenExpression, and the language FHIR does not define', async () => {
    const { findings } = await lintQuestionnaire({
      item: [
        {
          linkId: 'q',
          type: 'boolean',
          extension: [
            {
              url: `${sdc}enableWhenExpression`,
              valueExpression: { language: 'text/x-fhir-query', expression: 'Patient?_id=1' },
            },
            {
              url: `${sdc}calculatedExpression`,
              valueExpression: { language: 'text/fhir-path', expression: '1' },
            },
          ],
        },
      ],
    });
    expect(findings).toMatchObject([
      {
        ruleId: 'sdc/language-not-allowed',
        severity: 'error',
        jsonLocation: { pointer: '/item/0/extension/0/valueExpression/expression' },
      },
      {
        ruleId: 'sdc/language-not-in-value-set',
        severity: 'warning',
        jsonLocation: { pointer: '/item/0/extension/1/valueExpression/expression' },
      },
    ]);
  });

  it('reports an Expression with only a reference at the Expression, as unchecked', async () => {
    const { report, findings } = await lintQuestionnaire({
      item: [
        {
          linkId: 'q',
          type: 'integer',
          extension: [
            {
              url: `${sdc}calculatedExpression`,
              valueExpression: { language: 'text/cql', reference: 'Library/score#Total' },
            },
          ],
        },
      ],
    });
    expect(findings).toMatchObject([
      {
        ruleId: 'sdc/external-expression',
        severity: 'info',
        message:
          'This expression has no text, only the reference Library/score#Total, so it was not checked.',
        jsonLocation: { pointer: '/item/0/extension/0/valueExpression' },
      },
    ]);
    expect(report.summary.expressions).toEqual({ analysed: 0, unchecked: 1 });
  });

  it('reports a duplicate launchContext at the extension, with the first as related', async () => {
    const launchContext = {
      url: `${sdc}launchContext`,
      extension: [
        { url: 'name', valueCoding: { code: 'patient' } },
        { url: 'type', valueCode: 'Patient' },
      ],
    };
    const { report, findings } = await lintQuestionnaire({
      extension: [launchContext, launchContext],
    });
    expect(findings).toMatchObject([
      {
        ruleId: 'sdc/duplicate-declaration',
        severity: 'error',
        jsonLocation: { pointer: '/extension/1' },
        relatedLocations: [
          {
            kind: 'questionnaire',
            jsonLocation: { pointer: '/extension/0' },
            message: '%patient is also declared here',
          },
        ],
      },
    ]);
    expect(report.summary.expressions).toEqual({ analysed: 0, unchecked: 0 });
  });

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

  it.each(queryLanguages)(
    'reports a broken fragment once, as sdc/fragment-parse-error, in %s',
    async (language) => {
      const text = 'Observation?subject={{%patient.id.}}';
      const { findings } = await lintQuestionnaire({
        extension: [
          {
            url: `${sdc}itemPopulationContext`,
            valueExpression: { name: 'obs', language, expression: text },
          },
        ],
      });
      expect(findings).toMatchObject([
        {
          ruleId: 'sdc/fragment-parse-error',
          expression: { text, range: { startOffset: 34, endOffset: 34 } },
        },
      ]);
    },
  );

  it.each(queryLanguages)(
    'shows a finding in a fragment in its query, with the range rebased, in %s',
    async (language) => {
      const text = 'Observation?subject={{%patient.fist()}}';
      const { report, findings } = await lintQuestionnaire({
        extension: [
          {
            url: `${sdc}itemPopulationContext`,
            valueExpression: { name: 'obs', language, expression: text },
          },
          {
            url: `${sdc}launchContext`,
            extension: [
              { url: 'name', valueCoding: { code: 'patient' } },
              { url: 'type', valueCode: 'Patient' },
            ],
          },
        ],
      });
      expect(findings).toMatchObject([
        {
          ruleId: 'sdc/unknown-function',
          jsonLocation: { pointer: '/extension/0/valueExpression/expression' },
          expression: { text, range: { startOffset: 31, endOffset: 35 } },
        },
      ]);
      expect(report.summary.expressions).toEqual({ analysed: 2, unchecked: 0 });
    },
  );
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

  it('returns the rules of the run with the same report, including rules configured off', async () => {
    const cwd = await tempTree({
      [config]: JSON.stringify({ rules: { 'sdc/unknown-function': 'off' } }),
      'fsh-generated/resources/Questionnaire-A.json': broken,
    });
    const { report, rules } = await lintWithRules({ cwd });
    expect(report).toEqual(await lint({ cwd }));
    const settings = new Map(rules.map(({ id, setting }) => [id, setting]));
    expect(settings.get('sdc/unknown-function')).toBe('off');
    expect(settings.get('sdc/parse-error')).toBe('error');
    expect(settings.get('lint/stale-suppression')).toBe('warning');
    const ids = rules.map(({ id }) => id);
    expect(ids).toEqual([...ids].sort());
  });

  it('does not claim a syntax check ran when sdc/parse-error is off', async () => {
    const cwd = await tempTree({
      [config]: JSON.stringify({ rules: { 'sdc/parse-error': 'off' } }),
      'fsh-generated/resources/Questionnaire-A.json': JSON.stringify({
        resourceType: 'Questionnaire',
        status: 'draft',
        extension: [
          {
            url: 'http://example.org/custom',
            valueExpression: { language: 'text/fhirpath', expression: 'a.where(' },
          },
        ],
      }),
    });
    expect((await lint({ cwd })).findings).toMatchObject([
      {
        ruleId: 'sdc/uncatalogued-expression',
        message:
          'This expression is in a place the linter does not recognise, so only its FHIRPath syntax and function names can be checked.',
      },
    ]);
  });

  describe('sdc/undefined-variable', () => {
    const variable = (name: string, expression: string) => ({
      url: 'http://hl7.org/fhir/StructureDefinition/variable',
      valueExpression: { name, language: 'text/fhirpath', expression },
    });
    const form = JSON.stringify({
      resourceType: 'Questionnaire',
      status: 'draft',
      extension: [
        variable('total', '%PrePopQuery.total'),
        variable('computed', 'defineVariable(%total.first()).select(%y)'),
      ],
    });
    const run = async (settings: Record<string, unknown>) =>
      lint({
        cwd: await tempTree({
          [config]: JSON.stringify(settings),
          'fsh-generated/resources/Questionnaire-A.json': form,
        }),
      });

    it('accepts the names listed in hostVariables', async () => {
      const rules = { 'sdc/unused-declaration': 'off' };
      expect((await run({ rules })).findings).toMatchObject([
        {
          ruleId: 'sdc/undefined-variable',
          message: '%PrePopQuery is not available on the Questionnaire root.',
        },
      ]);
      expect((await run({ hostVariables: ['PrePopQuery'], rules })).findings).toEqual([]);
    });

    it('counts a site with a reference after a computed defineVariable name as unchecked, unless the rule is off', async () => {
      const on = await run({ hostVariables: ['PrePopQuery'] });
      expect(on.summary.expressions).toEqual({ analysed: 1, unchecked: 1 });
      const off = await run({
        rules: { 'sdc/undefined-variable': 'off', 'sdc/dependency-cycle': 'off' },
      });
      expect(off.summary.expressions).toEqual({ analysed: 2, unchecked: 0 });
    });
  });

  describe('sdc/dependency-cycle', () => {
    const variable = (name: string, expression: string) => ({
      url: 'http://hl7.org/fhir/StructureDefinition/variable',
      valueExpression: { name, language: 'text/fhirpath', expression },
    });
    const form = JSON.stringify({
      resourceType: 'Questionnaire',
      status: 'draft',
      extension: [
        variable('a', '%b'),
        variable('b', 'defineVariable(%resource.id).select(%a)'),
        variable('c', '%c.where('),
      ],
    });
    const run = async (settings: Record<string, unknown>) =>
      lint({
        cwd: await tempTree({
          [config]: JSON.stringify(settings),
          'fsh-generated/resources/Questionnaire-A.json': form,
        }),
      });

    it('does not count a declaration that reaches one in another language as unchecked', async () => {
      const result = await lint({
        cwd: await tempTree({
          [config]: JSON.stringify({ rules: { 'sdc/unused-declaration': 'off' } }),
          'fsh-generated/resources/Questionnaire-A.json': JSON.stringify({
            resourceType: 'Questionnaire',
            status: 'draft',
            extension: [
              variable('a', '%b'),
              {
                url: 'http://hl7.org/fhir/StructureDefinition/variable',
                valueExpression: { name: 'b', language: 'text/cql', expression: 'a' },
              },
            ],
          }),
        }),
      });
      expect(result.summary.expressions).toEqual({ analysed: 1, unchecked: 1 });
    });

    it('counts a declaration that reaches a reference after a computed defineVariable name as unchecked, unless the rule is off', async () => {
      const on = await run({
        rules: { 'sdc/undefined-variable': 'off', 'sdc/parse-error': 'off' },
      });
      expect(on.summary.expressions).toEqual({ analysed: 1, unchecked: 2 });
      const off = await run({
        rules: {
          'sdc/undefined-variable': 'off',
          'sdc/parse-error': 'off',
          'sdc/dependency-cycle': 'off',
          'sdc/unused-declaration': 'off',
        },
      });
      expect(off.summary.expressions).toEqual({ analysed: 3, unchecked: 0 });
    });
  });

  describe('sdc/unused-declaration', () => {
    const extension = (
      url: string,
      name: string | undefined,
      language: string,
      expression: string,
    ) => ({
      url,
      valueExpression: { ...(name === undefined ? {} : { name }), language, expression },
    });
    const variable = (name: string) =>
      extension('http://hl7.org/fhir/StructureDefinition/variable', name, 'text/fhirpath', '1');
    const calculated = (language: string, expression: string) =>
      extension(
        'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
        undefined,
        language,
        expression,
      );
    const run = async (consumer: unknown, rules: Record<string, string> = {}) =>
      lint({
        cwd: await tempTree({
          [config]: JSON.stringify({ rules }),
          'fsh-generated/resources/Questionnaire-A.json': JSON.stringify({
            resourceType: 'Questionnaire',
            status: 'draft',
            extension: [variable('a')],
            item: [{ linkId: 'x', type: 'decimal', extension: [consumer] }],
          }),
        }),
      });

    it('counts a variable that a CQL expression could reference as unchecked, unless the rule is off', async () => {
      const cql = calculated('text/cql', '%a');
      expect((await run(cql)).summary.expressions).toEqual({ analysed: 0, unchecked: 2 });
      expect((await run(cql, { 'sdc/unused-declaration': 'off' })).summary.expressions).toEqual({
        analysed: 1,
        unchecked: 1,
      });
    });

    it('leaves an uncatalogued reference-only consumer and its variable unchecked', async () => {
      const consumer = {
        url: 'http://example.org/custom',
        valueExpression: { language: 'text/fhirpath', reference: 'Library/consumer' },
      };
      const result = await run(consumer);
      expect(result.findings.map(({ ruleId }) => ruleId)).toEqual([
        'sdc/external-expression',
        'sdc/uncatalogued-expression',
      ]);
      expect(result.findings[1]?.message).toBe(
        'This expression is in a place the linter does not recognise, so it was not checked.',
      );
      expect(result.summary.expressions).toEqual({ analysed: 0, unchecked: 2 });
      expect(
        (await run(consumer, { 'sdc/unused-declaration': 'off' })).summary.expressions,
      ).toEqual({ analysed: 1, unchecked: 1 });
    });

    it('does not count a variable that only an expression with a syntax error could reference as unchecked', async () => {
      const result = await run(calculated('text/fhirpath', '%a.where('));
      expect(result.findings.map(({ ruleId }) => ruleId)).toEqual(['sdc/parse-error']);
      expect(result.summary.expressions).toEqual({ analysed: 2, unchecked: 0 });
    });
  });

  describe('sdc/unresolved-linkid', () => {
    const run = async (expression: string, rules: Record<string, string> = {}) =>
      lint({
        cwd: await tempTree({
          [config]: JSON.stringify({ rules }),
          'fsh-generated/resources/Questionnaire-A.json': JSON.stringify({
            resourceType: 'Questionnaire',
            status: 'draft',
            item: [
              {
                linkId: 'x',
                type: 'decimal',
                extension: [
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
                    valueExpression: { language: 'text/fhirpath', expression },
                  },
                ],
              },
            ],
          }),
        }),
      });

    it('reports at warning by default, and at error when configured', async () => {
      const text = "%resource.repeat(item).where(linkId = 'typo').answer.value";
      const warning = await run(text);
      expect(warning.findings).toMatchObject([
        { ruleId: 'sdc/unresolved-linkid', severity: 'warning' },
      ]);
      expect(warning.summary).toMatchObject({ errors: 0, warnings: 1 });
      const error = await run(text, { 'sdc/unresolved-linkid': 'error' });
      expect(error.findings).toMatchObject([
        { ruleId: 'sdc/unresolved-linkid', severity: 'error' },
      ]);
      expect(error.summary).toMatchObject({ errors: 1, warnings: 0 });
    });

    it('counts a site with a reference whose target is uncertain as unchecked, unless the rule is off', async () => {
      const text = "%resource.descendants().where(linkId = 'x').answer.value";
      const on = await run(text);
      expect(on.findings).toEqual([]);
      expect(on.summary.expressions).toEqual({ analysed: 0, unchecked: 1 });
      const off = await run(text, { 'sdc/unresolved-linkid': 'off' });
      expect(off.summary.expressions).toEqual({ analysed: 1, unchecked: 0 });
    });

    it('does not count a site without a linkId reference, or with an absence probe, as unchecked', async () => {
      for (const text of ['1 + 1', "%resource.descendants().where(linkId = 'x').exists()"]) {
        expect((await run(text)).summary.expressions).toEqual({ analysed: 1, unchecked: 0 });
      }
    });
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

  it('reports an applied suppression in the summary counts', async () => {
    const cwd = await tempTree({
      [config]: JSON.stringify({
        suppress: [
          {
            rule: 'sdc/parse-error',
            file: 'fsh-generated/resources/Questionnaire-A.json',
            linkId: 'q',
            reason: 'demo',
          },
        ],
      }),
      'fsh-generated/resources/Questionnaire-A.json': broken,
    });
    const report = await lint({ cwd });
    expectValidReport(report);
    expect(report.findings).toEqual([]);
    expect(report.summary).toMatchObject({
      errors: 0,
      suppressedFindings: 1,
      suppressions: { applied: 1, stale: 0, notAssessed: 0 },
    });
  });

  it('reports one stale finding per stale entry', async () => {
    const suppression = (file: string) => ({ rule: 'sdc/parse-error', file, reason: 'demo' });
    const cwd = await tempTree({
      [config]: JSON.stringify({
        suppress: [
          suppression('fsh-generated/resources/Questionnaire-Gone.json'),
          { ...suppression('fsh-generated/resources/Questionnaire-A.json'), linkId: 'q' },
          suppression('elsewhere/Questionnaire-B.json'),
        ],
      }),
      'fsh-generated/resources/Questionnaire-A.json': broken.replace('a.where(', 'a.where(b)'),
      'elsewhere/Questionnaire-B.json': broken,
    });
    const report = await lint({ cwd });
    expectValidReport(report);
    expect(report.findings).toMatchObject([
      {
        ruleId: 'lint/stale-suppression',
        configLocation: { file: config, pointer: '/suppress/0' },
      },
      {
        ruleId: 'lint/stale-suppression',
        configLocation: { file: config, pointer: '/suppress/1' },
      },
    ]);
    expect(report.summary).toMatchObject({
      warnings: 2,
      suppressedFindings: 0,
      suppressions: { applied: 0, stale: 2, notAssessed: 1 },
    });
  });

  it('fails on an invalid config before looking for inputs', async () => {
    const cwd = await tempTree({ [config]: '{ "rulez": {} }' });
    await expect(lint({ cwd })).rejects.toMatchObject({ code: 'CONFIG_INVALID' });
  });
});

describe('a plugin rule', () => {
  it('runs once per Questionnaire, seeing the expression sites the linter found', async () => {
    const seen: { document: QuestionnaireDocument; sites: readonly ExpressionSite[] }[] = [];
    // The config module reads this while lint imports it in this process.
    (globalThis as { sdcLintSeen?: typeof seen }).sdcLintSeen = seen;
    const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
    const withQuery = (id: string) => ({
      resourceType: 'Questionnaire',
      id,
      status: 'draft',
      extension: [
        {
          url: `${sdc}itemPopulationContext`,
          valueExpression: {
            name: 'obs',
            language: 'application/x-fhir-query',
            expression: 'Observation?subject={{%patient.id}}',
          },
        },
      ],
    });
    const cwd = await tempTree({
      'sdc-questionnaire-lint.config.mjs': `export default {
        plugins: [{
          meta: { name: 'demo', version: '0.0.0' },
          rules: {
            record: {
              meta: { description: 'Records what it sees.', defaultSeverity: 'info' },
              check(ctx) { globalThis.sdcLintSeen.push({ document: ctx.document, sites: ctx.sites }); },
            },
          },
        }],
      };`,
      'fsh-generated/resources/Questionnaire-A.json': JSON.stringify(withQuery('A')),
      'fsh-generated/resources/Bundle-B.json': JSON.stringify({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [{ resource: withQuery('B1') }, { resource: withQuery('B2') }],
      }),
    });
    await lint({ cwd });
    expect(
      seen.map(({ document }) => [document.file, document.resource.id, document.resourcePointer]),
    ).toEqual([
      ['fsh-generated/resources/Bundle-B.json', 'B1', '/entry/0/resource'],
      ['fsh-generated/resources/Bundle-B.json', 'B2', '/entry/1/resource'],
      ['fsh-generated/resources/Questionnaire-A.json', 'A', ''],
    ]);
    for (const { document, sites } of seen) {
      expect(sites).toEqual(findExpressionSites(document));
      expect(sites.map(({ carrier }) => carrier)).toEqual(['expression', 'fragment']);
    }
  });
});

describe('FSH source mapping', () => {
  const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
  const compiled = JSON.stringify({
    resourceType: 'Questionnaire',
    id: 'A',
    status: 'draft',
    item: [
      {
        linkId: 'a',
        type: 'decimal',
        extension: [
          {
            url: `${sdc}calculatedExpression`,
            valueExpression: { language: 'text/fhirpath', expression: '%resource.fist()' },
          },
        ],
      },
    ],
  });
  const expressionRule =
    '* item[=].extension[sdc-questionnaire-calculatedExpression].valueExpression.expression = "%resource.fist()"';
  const fsh = [
    'Instance: A',
    'InstanceOf: Questionnaire',
    '* status = #draft',
    '* item[+].linkId = "a"',
    '* item[=].type = #decimal',
    expressionRule,
  ].join('\n');
  const tree = { 'fsh-generated/resources/Questionnaire-A.json': compiled, 'input/fsh/A.fsh': fsh };

  it('locates a finding in the FSH it was compiled from', async () => {
    const report = await lint({ cwd: await tempTree(tree) });
    expectValidReport(report);
    const column = expressionRule.indexOf('fist') + 1;
    expect(report.findings).toMatchObject([
      {
        ruleId: 'sdc/unknown-function',
        sourceLocation: {
          status: 'mapped',
          confidence: 'exact',
          location: { file: 'input/fsh/A.fsh', line: 6, column, endLine: 6, endColumn: column + 4 },
        },
      },
    ]);
  });

  it('changes neither fingerprints nor counts', async () => {
    const mapped = await lint({ cwd: await tempTree(tree) });
    const omitted = await lint({
      cwd: await tempTree({
        ...tree,
        'sdc-questionnaire-lint.config.json': JSON.stringify({ source: { fsh: [] } }),
      }),
    });
    expect(omitted.findings).toMatchObject([
      { sourceLocation: { status: 'unmapped', reason: 'source-unavailable' } },
    ]);
    expect(mapped.findings.map(({ fingerprint }) => fingerprint)).toEqual(
      omitted.findings.map(({ fingerprint }) => fingerprint),
    );
    // The config and FSH sources differ by design; everything else must not.
    const counts = ({ summary }: CompletedReport) => ({
      ...summary,
      config: null,
      fshSources: [],
      fshSourceLookup: null,
    });
    expect(counts(mapped)).toEqual(counts(omitted));
  });

  it('leaves a finding not-found when its expression is not in the FSH', async () => {
    const report = await lint({
      cwd: await tempTree({ ...tree, 'input/fsh/A.fsh': fsh.replace('fist', 'first') }),
    });
    expect(report.findings).toMatchObject([
      { sourceLocation: { status: 'unmapped', reason: 'not-found' } },
    ]);
  });
});

// Fingerprints are left out of the lint cases (test/cases), so their stability is checked here.
describe('duplicate-declaration fingerprints', () => {
  const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
  const launchContext = (name: string) => ({
    url: `${sdc}launchContext`,
    extension: [
      { url: 'name', valueCoding: { code: name } },
      { url: 'type', valueCode: 'Patient' },
    ],
  });
  const allocateId = (name: string) => ({ url: `${sdc}extractAllocateId`, valueString: name });

  async function fingerprints(extension: unknown[]): Promise<string[]> {
    const cwd = await tempTree({
      'fsh-generated/resources/Questionnaire-A.json': JSON.stringify({
        resourceType: 'Questionnaire',
        id: 'A',
        status: 'draft',
        extension,
      }),
    });
    return (await lint({ cwd })).findings
      .filter(({ ruleId }) => ruleId === 'sdc/duplicate-declaration')
      .map(({ fingerprint }) => fingerprint);
  }

  it('keeps the fingerprint at a launchContext when another extension is inserted before it', async () => {
    const pair = [launchContext('patient'), launchContext('patient')];
    const before = await fingerprints(pair);
    expect(before).toHaveLength(1);
    expect(await fingerprints([allocateId('x'), launchContext('user'), ...pair])).toEqual(before);
  });

  it('gives each repeat of a name at extensions its own fingerprint', async () => {
    const repeated = await fingerprints([allocateId('a'), allocateId('a'), allocateId('a')]);
    expect(new Set(repeated).size).toBe(2);
  });
});
