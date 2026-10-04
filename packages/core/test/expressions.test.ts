import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type CompletedReport, lint, type QuestionnaireFinding } from '../src/index.js';
import { expectValidReport } from './support/report.js';
import { tempTree } from './support/tmp.js';

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';
const urls = {
  variable: 'http://hl7.org/fhir/StructureDefinition/variable',
  calculated: `${sdc}calculatedExpression`,
  enableWhen: `${sdc}enableWhenExpression`,
  initial: `${sdc}initialExpression`,
  candidate: `${sdc}candidateExpression`,
  answer: `${sdc}answerExpression`,
  context: `${sdc}contextExpression`,
  populationContext: `${sdc}itemPopulationContext`,
  extractionContext: `${sdc}itemExtractionContext`,
  toggle: `${sdc}answerOptionsToggleExpression`,
  targetConstraint: 'http://hl7.org/fhir/StructureDefinition/targetConstraint',
  cqf: 'http://hl7.org/fhir/StructureDefinition/cqf-expression',
};

const file = 'fsh-generated/resources/Questionnaire-A.json';
const siteRecorder = pathToFileURL(
  fileURLToPath(new URL('fixtures/plugins/site-recorder.mjs', import.meta.url)),
).href;

type Json = Record<string, unknown>;

function fhirpath(expression: string, name?: string): Json {
  return { ...(name === undefined ? {} : { name }), language: 'text/fhirpath', expression };
}

function ext(url: string, valueExpression: Json): Json {
  return { url, valueExpression };
}

function complex(url: string, valueExpression: Json): Json {
  return { url, extension: [{ url: 'expression', valueExpression }] };
}

function questionnaire(body: Json): Json {
  return { resourceType: 'Questionnaire', id: 'A', status: 'draft', ...body };
}

async function run(
  files: Record<string, Json | string>,
  config?: Json | string,
): Promise<CompletedReport> {
  const tree = Object.fromEntries(
    Object.entries(files).map(([name, content]) => [
      name,
      typeof content === 'string' ? content : JSON.stringify(content, null, 2),
    ]),
  );
  if (typeof config === 'string') tree['sdc-questionnaire-lint.config.mjs'] = config;
  else if (config !== undefined)
    tree['sdc-questionnaire-lint.config.json'] = JSON.stringify(config);
  const report = await lint({ cwd: await tempTree(tree) });
  expectValidReport(report);
  return report;
}

const lintOne = (resource: Json, config?: Json | string) => run({ [file]: resource }, config);

function byRule(report: CompletedReport, ruleId: string): QuestionnaireFinding[] {
  return report.findings.filter(
    (finding): finding is QuestionnaireFinding =>
      finding.kind === 'questionnaire' && finding.ruleId === ruleId,
  );
}

const pointers = (findings: QuestionnaireFinding[]) =>
  findings.map((finding) => finding.jsonLocation.pointer);

// Records the sites the plugin received, keyed by pointer, from its findings.
const recorderConfig = `import sites from ${JSON.stringify(siteRecorder)};
export default { plugins: [sites], rules: { 'sdc/unregistered-expression': 'off' } };
`;

async function sitesOf(resource: Json): Promise<{ pointer: string; site: Json }[]> {
  const report = await lintOne(resource, recorderConfig);
  return byRule(report, 'sites/record').map((finding) => ({
    pointer: finding.jsonLocation.pointer,
    site: JSON.parse(finding.message) as Json,
  }));
}

describe('sdc/parse-error', () => {
  const broken = 'a.where(b';

  it.each([
    ['variable', urls.variable],
    ['calculatedExpression', urls.calculated],
    ['enableWhenExpression', urls.enableWhen],
    ['initialExpression', urls.initial],
    ['candidateExpression', urls.candidate],
    ['answerExpression', urls.answer],
    ['contextExpression', urls.context],
    ['itemPopulationContext', urls.populationContext],
    ['itemExtractionContext', urls.extractionContext],
  ])('reports a syntax error in an item %s', async (_name, url) => {
    const report = await lintOne(
      questionnaire({
        item: [{ linkId: 'q1', type: 'string', extension: [ext(url, fhirpath(broken))] }],
      }),
    );
    const findings = byRule(report, 'sdc/parse-error');
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: 'error',
      jsonLocation: {
        file,
        pointer: '/item/0/extension/0/valueExpression/expression',
        linkId: 'q1',
      },
      expression: { text: broken, range: { startOffset: 9, endOffset: 9 } },
    });
    expect(byRule(report, 'sdc/unregistered-expression')).toEqual([]);
  });

  it.each([
    ['variable', urls.variable],
    ['itemPopulationContext', urls.populationContext],
    ['itemExtractionContext', urls.extractionContext],
  ])('reports a syntax error in a root %s', async (_name, url) => {
    const report = await lintOne(questionnaire({ extension: [ext(url, fhirpath(broken))] }));
    const [finding] = byRule(report, 'sdc/parse-error');
    expect(finding?.jsonLocation).toMatchObject({
      pointer: '/extension/0/valueExpression/expression',
    });
    expect(finding?.jsonLocation.linkId).toBeUndefined();
    expect(byRule(report, 'sdc/unregistered-expression')).toEqual([]);
  });

  it('reports items nested three levels deep, under the innermost linkId', async () => {
    const report = await lintOne(
      questionnaire({
        item: [
          {
            linkId: 'g1',
            type: 'group',
            item: [
              {
                linkId: 'g2',
                type: 'group',
                item: [
                  {
                    linkId: 'q3',
                    type: 'string',
                    extension: [ext(urls.calculated, fhirpath(broken))],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(byRule(report, 'sdc/parse-error').map((f) => f.jsonLocation)).toMatchObject([
      { pointer: '/item/0/item/0/item/0/extension/0/valueExpression/expression', linkId: 'q3' },
    ]);
  });

  it('checks cqf-expression on registered primitive elements', async () => {
    const cqf = { extension: [ext(urls.cqf, fhirpath(broken))] };
    const report = await lintOne(
      questionnaire({
        _title: cqf,
        item: [
          { linkId: 'q1', type: 'string', _text: cqf, _prefix: cqf },
          { linkId: 'q2', type: 'choice', _answerValueSet: cqf },
        ],
      }),
    );
    expect(pointers(byRule(report, 'sdc/parse-error'))).toEqual([
      '/_title/extension/0/valueExpression/expression',
      '/item/0/_text/extension/0/valueExpression/expression',
      '/item/0/_prefix/extension/0/valueExpression/expression',
      '/item/1/_answerValueSet/extension/0/valueExpression/expression',
    ]);
    expect(byRule(report, 'sdc/unregistered-expression')).toEqual([]);
  });

  it('checks the expression inside answerOptionsToggleExpression and targetConstraint', async () => {
    const report = await lintOne(
      questionnaire({
        extension: [complex(urls.targetConstraint, fhirpath(broken))],
        item: [
          {
            linkId: 'q1',
            type: 'choice',
            extension: [
              {
                url: urls.toggle,
                extension: [
                  { url: 'option', valueCoding: { code: 'a' } },
                  { url: 'expression', valueExpression: fhirpath(broken) },
                ],
              },
              complex(urls.targetConstraint, fhirpath(broken)),
            ],
          },
        ],
      }),
    );
    expect(pointers(byRule(report, 'sdc/parse-error'))).toEqual([
      '/extension/0/extension/0/valueExpression/expression',
      '/item/0/extension/0/extension/1/valueExpression/expression',
      '/item/0/extension/1/extension/0/valueExpression/expression',
    ]);
    expect(byRule(report, 'sdc/unregistered-expression')).toEqual([]);
  });

  it('reports each occurrence of a repeated extension, once per broken expression', async () => {
    const report = await lintOne(
      questionnaire({
        item: [
          {
            linkId: 'q1',
            type: 'string',
            extension: [
              ext(urls.variable, fhirpath('a.b)', 'one')),
              ext(urls.variable, fhirpath('%one + 1', 'two')),
              ext(urls.variable, fhirpath('(a', 'three')),
            ],
          },
        ],
      }),
    );
    expect(pointers(byRule(report, 'sdc/parse-error'))).toEqual([
      '/item/0/extension/0/valueExpression/expression',
      '/item/0/extension/2/valueExpression/expression',
    ]);
  });

  it.each([
    ['\n', 'a\n  .where(x = )', 15],
    ['\r\n', 'a\r\n  .where(x = )', 16],
  ])('places the caret on line 2 of a multi-line expression (%j)', async (_eol, text, offset) => {
    const report = await lintOne(
      questionnaire({
        item: [{ linkId: 'q1', type: 'string', extension: [ext(urls.calculated, fhirpath(text))] }],
      }),
    );
    const [finding] = byRule(report, 'sdc/parse-error');
    expect(text[offset]).toBe(')');
    expect(finding?.expression).toEqual({
      text,
      range: { startOffset: offset, endOffset: offset + 1 },
    });
  });

  it('states the problem in plain terms without the parser token list', async () => {
    const report = await lintOne(
      questionnaire({
        item: [
          {
            linkId: 'q1',
            type: 'string',
            extension: [
              ext(urls.variable, fhirpath('a.where(b', 'missing')),
              ext(urls.variable, fhirpath('a.b(', 'ends')),
              ext(urls.variable, fhirpath('a.b)', 'extra')),
              ext(urls.variable, fhirpath('a.b..c', 'crash')),
            ],
          },
        ],
      }),
    );
    const findings = byRule(report, 'sdc/parse-error');
    expect(findings.map(({ message, help, note }) => ({ message, help, note }))).toEqual([
      {
        message: 'A closing ) is missing.',
        help: 'add ) at the end of the expression',
        note: "the FHIRPath parser reported: missing ')' at '<EOF>'",
      },
      {
        message: 'The expression ends before it is complete.',
        help: undefined,
        note: "the FHIRPath parser reported: mismatched input '<EOF>'",
      },
      {
        message: 'The expression has an unexpected ).',
        help: undefined,
        note: "the FHIRPath parser reported: extraneous input ')'",
      },
      { message: 'This FHIRPath expression has a syntax error.', help: undefined, note: undefined },
    ]);
    expect(findings[2]?.expression?.range).toEqual({ startOffset: 3, endOffset: 4 });
    expect(findings[3]?.expression?.range).toBeUndefined();
  });

  it.each([
    ['application/x-fhir-query', { expression: 'Patient?_id={{%patient.id' }],
    ['text/cql', { expression: 'define "X": [Patient' }],
    ['a missing language', { expression: 'a.where(b' }],
    ['a reference-only Expression', { reference: 'Library/x' }],
  ])('does not parse %s, and counts it unchecked', async (language, expression) => {
    const value = language.includes('/') ? { language, ...expression } : expression;
    const report = await lintOne(
      questionnaire({
        item: [{ linkId: 'q1', type: 'string', extension: [ext(urls.calculated, value)] }],
      }),
    );
    expect(byRule(report, 'sdc/parse-error')).toEqual([]);
    expect(report.summary.expressions).toEqual({ analysed: 0, unchecked: 1 });
  });

  it('yields no site for a registered URL with an unexpected shape, without crashing', async () => {
    const report = await lintOne(
      questionnaire({
        extension: [{ url: urls.variable, valueString: 'a.where(b' }, { url: urls.variable }],
        item: [
          {
            linkId: 'q1',
            type: 'choice',
            extension: [
              { url: urls.toggle, extension: [{ url: 'option', valueCoding: { code: 'a' } }] },
              { url: urls.targetConstraint, extension: 'not an array' },
              { url: urls.calculated, valueExpression: ['not', 'an', 'object'] },
              // An Expression where a sub-extension should hold it.
              { url: urls.targetConstraint, valueExpression: fhirpath('a.where(b') },
              'not an object',
            ],
            item: 'not an array',
            _text: 'not an object',
          },
        ],
      }),
    );
    expect(report.findings).toEqual([]);
    expect(report.summary.expressions).toEqual({ analysed: 0, unchecked: 0 });
  });

  it('treats a registered extension on an element it does not belong to as unregistered', async () => {
    const report = await lintOne(
      questionnaire({ extension: [ext(urls.calculated, fhirpath('%a'))] }),
    );
    expect(pointers(byRule(report, 'sdc/unregistered-expression'))).toEqual([
      '/extension/0/valueExpression/expression',
    ]);
  });

  it('can be configured off: no finding, but the expression still counts as analysed', async () => {
    const report = await lintOne(
      questionnaire({
        item: [
          { linkId: 'q1', type: 'string', extension: [ext(urls.calculated, fhirpath(broken))] },
        ],
      }),
      { rules: { 'sdc/parse-error': 'off' } },
    );
    expect(report.findings).toEqual([]);
    expect(report.summary.expressions).toEqual({ analysed: 1, unchecked: 0 });
  });

  it('can be suppressed at one expression with a reason', async () => {
    const report = await lintOne(
      questionnaire({
        item: [
          { linkId: 'q1', type: 'string', extension: [ext(urls.calculated, fhirpath(broken))] },
          { linkId: 'q2', type: 'string', extension: [ext(urls.calculated, fhirpath(broken))] },
        ],
      }),
      {
        suppress: [
          {
            rule: 'sdc/parse-error',
            file,
            linkId: 'q1',
            extensionUrl: urls.calculated,
            reason: 'known',
          },
        ],
      },
    );
    expect(byRule(report, 'sdc/parse-error').map((f) => f.jsonLocation.linkId)).toEqual(['q2']);
    expect(report.summary).toMatchObject({
      suppressedFindings: 1,
      suppressions: { applied: 1, stale: 0, notAssessed: 0 },
    });
  });

  it('keeps fingerprints when sibling items are reordered', async () => {
    const q1 = {
      linkId: 'q1',
      type: 'string',
      extension: [ext(urls.calculated, fhirpath(broken))],
    };
    const q2 = { linkId: 'q2', type: 'string', extension: [ext(urls.calculated, fhirpath('(a'))] };
    const before = await lintOne(questionnaire({ item: [q1, q2] }));
    const after = await lintOne(questionnaire({ item: [q2, q1] }));
    const fingerprints = (report: CompletedReport) =>
      Object.fromEntries(
        byRule(report, 'sdc/parse-error').map((f): [string, string] => [
          f.jsonLocation.linkId ?? '',
          f.fingerprint,
        ]),
      );
    expect(fingerprints(after)).toEqual(fingerprints(before));
  });
});

describe('sdc/unregistered-expression', () => {
  it('reports an expression outside the registry at info, after checking its syntax', async () => {
    const report = await lintOne(
      questionnaire({
        item: [
          {
            linkId: 'q1',
            type: 'choice',
            answerOption: [
              {
                valueString: 'x',
                extension: [ext('http://example.org/custom', fhirpath('a.where(b'))],
              },
            ],
          },
        ],
      }),
    );
    const pointer = '/item/0/answerOption/0/extension/0/valueExpression/expression';
    expect(byRule(report, 'sdc/unregistered-expression')).toMatchObject([
      {
        severity: 'info',
        message:
          'This expression is in a place the linter does not recognise, so only its FHIRPath syntax was checked.',
        jsonLocation: { pointer, linkId: 'q1' },
        expression: { text: 'a.where(b' },
      },
    ]);
    expect(pointers(byRule(report, 'sdc/parse-error'))).toEqual([pointer]);
    expect(report.summary.expressions).toEqual({ analysed: 0, unchecked: 1 });
  });

  it('says a non-FHIRPath expression was not checked at all', async () => {
    const report = await lintOne(
      questionnaire({
        extension: [ext('http://example.org/custom', { language: 'text/cql', expression: 'X' })],
      }),
    );
    expect(byRule(report, 'sdc/unregistered-expression').map((f) => f.message)).toEqual([
      'This expression is in a place the linter does not recognise, so it was not checked.',
    ]);
  });

  it('finds expressions inside contained resources, which are never registered', async () => {
    const report = await lintOne(
      questionnaire({
        contained: [
          {
            resourceType: 'Questionnaire',
            id: 'inner',
            status: 'draft',
            extension: [ext(urls.variable, fhirpath('a.b)', 'v'))],
          },
        ],
      }),
    );
    const pointer = '/contained/0/extension/0/valueExpression/expression';
    expect(pointers(byRule(report, 'sdc/unregistered-expression'))).toEqual([pointer]);
    expect(pointers(byRule(report, 'sdc/parse-error'))).toEqual([pointer]);
    expect(report.summary.expressions).toEqual({ analysed: 0, unchecked: 1 });
  });
});

describe('expression coverage', () => {
  it('counts registered FHIRPath sites analysed, and the rest unchecked, each once', async () => {
    const report = await lintOne(
      questionnaire({
        extension: [
          ext(urls.variable, fhirpath('%a', 'one')),
          ext(urls.variable, {
            name: 'q',
            language: 'application/x-fhir-query',
            expression: 'Patient',
          }),
        ],
        item: [
          {
            linkId: 'q1',
            type: 'string',
            extension: [
              ext(urls.calculated, fhirpath('(a')),
              ext('http://example.org/custom', fhirpath('a')),
            ],
          },
        ],
      }),
    );
    expect(report.summary.expressions).toEqual({ analysed: 2, unchecked: 2 });
  });

  it('attributes findings and counts in a Bundle to each Questionnaire', async () => {
    const report = await run({
      'fsh-generated/resources/Bundle-B.json': {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          {
            resource: {
              resourceType: 'Patient',
              id: 'p',
              extension: [ext(urls.variable, fhirpath('('))],
            },
          },
          {
            resource: questionnaire({
              id: 'Q1',
              extension: [ext(urls.variable, fhirpath('(a', 'v'))],
            }),
          },
          {
            resource: questionnaire({
              id: 'Q2',
              extension: [ext(urls.variable, fhirpath('a)', 'v'))],
            }),
          },
        ],
      },
    });
    expect(byRule(report, 'sdc/parse-error').map((f) => f.jsonLocation)).toMatchObject([
      {
        pointer: '/entry/1/resource/extension/0/valueExpression/expression',
        resource: { id: 'Q1', pointer: '/entry/1/resource' },
      },
      {
        pointer: '/entry/2/resource/extension/0/valueExpression/expression',
        resource: { id: 'Q2', pointer: '/entry/2/resource' },
      },
    ]);
    expect(report.summary.expressions).toEqual({ analysed: 2, unchecked: 0 });
  });

  it('gives the same findings in the same order on every run', async () => {
    const resource = questionnaire({
      extension: [ext(urls.variable, fhirpath('(a', 'v'))],
      item: [
        { linkId: 'q1', type: 'string', _text: { extension: [ext(urls.cqf, fhirpath('a)'))] } },
        { linkId: 'q2', type: 'string', extension: [ext('http://example.org/x', fhirpath('b('))] },
      ],
    });
    const first = await lintOne(resource);
    const second = await lintOne(resource);
    expect(first.findings.length).toBeGreaterThan(3);
    expect(second.findings).toEqual(first.findings);
  });
});

describe('expression sites given to plugin rules', () => {
  it('describes each site, in document order', async () => {
    const sites = await sitesOf(
      questionnaire({
        extension: [ext(urls.variable, fhirpath('%a', 'one'))],
        item: [
          {
            linkId: 'q1',
            type: 'choice',
            _text: { extension: [ext(urls.cqf, fhirpath("'Hi'"))] },
            extension: [
              ext(urls.calculated, fhirpath('%one', 'named')),
              ext(urls.populationContext, {
                name: 'ctx',
                language: 'application/x-fhir-query',
                expression: 'Patient',
              }),
              complex(urls.toggle, { reference: 'Library/x' }),
            ],
            answerOption: [{ extension: [ext('http://example.org/x', fhirpath('b'))] }],
          },
        ],
        contained: [
          { resourceType: 'Library', extension: [ext(urls.variable, fhirpath('c', 'd'))] },
        ],
      }),
    );
    expect(sites).toEqual([
      {
        pointer: '/extension/0/valueExpression/expression',
        site: {
          expressionPointer: '/extension/0/valueExpression',
          carrier: 'expression',
          location: { url: urls.variable },
          registered: true,
          language: 'text/fhirpath',
          text: '%a',
          name: 'one',
          declares: true,
          useCases: ['rendering', 'population', 'extraction'],
        },
      },
      {
        pointer: '/item/0/_text/extension/0/valueExpression/expression',
        site: {
          expressionPointer: '/item/0/_text/extension/0/valueExpression',
          carrier: 'expression',
          location: { url: urls.cqf },
          registered: true,
          element: 'text',
          item: { pointer: '/item/0', linkId: 'q1' },
          language: 'text/fhirpath',
          text: "'Hi'",
          declares: false,
          useCases: ['rendering'],
        },
      },
      {
        pointer: '/item/0/extension/0/valueExpression/expression',
        site: {
          expressionPointer: '/item/0/extension/0/valueExpression',
          carrier: 'expression',
          location: { url: urls.calculated },
          registered: true,
          item: { pointer: '/item/0', linkId: 'q1' },
          language: 'text/fhirpath',
          text: '%one',
          name: 'named',
          declares: false,
          useCases: ['rendering'],
        },
      },
      {
        pointer: '/item/0/extension/1/valueExpression/expression',
        site: {
          expressionPointer: '/item/0/extension/1/valueExpression',
          carrier: 'expression',
          location: { url: urls.populationContext },
          registered: true,
          item: { pointer: '/item/0', linkId: 'q1' },
          language: 'application/x-fhir-query',
          text: 'Patient',
          name: 'ctx',
          declares: true,
          useCases: ['population'],
        },
      },
      {
        pointer: '/item/0/extension/2/extension/0/valueExpression',
        site: {
          expressionPointer: '/item/0/extension/2/extension/0/valueExpression',
          carrier: 'expression',
          location: { url: urls.toggle, subExtension: 'expression' },
          registered: true,
          item: { pointer: '/item/0', linkId: 'q1' },
          reference: 'Library/x',
          declares: false,
          useCases: ['rendering'],
        },
      },
      {
        pointer: '/item/0/answerOption/0/extension/0/valueExpression/expression',
        site: {
          expressionPointer: '/item/0/answerOption/0/extension/0/valueExpression',
          carrier: 'expression',
          registered: false,
          item: { pointer: '/item/0', linkId: 'q1' },
          language: 'text/fhirpath',
          text: 'b',
          declares: false,
          useCases: [],
        },
      },
      {
        pointer: '/contained/0/extension/0/valueExpression/expression',
        site: {
          expressionPointer: '/contained/0/extension/0/valueExpression',
          carrier: 'expression',
          registered: false,
          language: 'text/fhirpath',
          text: 'c',
          name: 'd',
          declares: false,
          useCases: [],
        },
      },
    ]);
  });

  it('lets a rule report at a site, giving the expression excerpt', async () => {
    const report = await lintOne(
      questionnaire({
        item: [{ linkId: 'q1', type: 'string', extension: [ext(urls.calculated, fhirpath('%a'))] }],
      }),
      recorderConfig,
    );
    expect(byRule(report, 'sites/record')).toMatchObject([
      {
        jsonLocation: { pointer: '/item/0/extension/0/valueExpression/expression', linkId: 'q1' },
        expression: { text: '%a' },
      },
    ]);
  });
});
