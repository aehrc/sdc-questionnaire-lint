import { describe, expect, it } from 'vitest';
import type { ConfigFinding, QuestionnaireFinding, Report, RunCompat } from '../../src/index.js';
import { docsDir, readJson } from '../support/report.js';

// Type-level contract test: each literal is copied from docs/examples/reports/, so a field-name
// mismatch between the report types and the examples fails npm run typecheck.

const completed: Report = {
  schemaVersion: 1,
  status: 'completed',
  run: {
    tool: { name: 'sdc-questionnaire-lint', version: '0.1.0' },
    plugins: [
      { name: 'sdc', version: '0.1.0' },
      { name: 'smart-forms', version: '0.1.0' },
    ],
    compat: {
      'smart-forms': { renderer: '1.4.0', populate: '4.7.1', 'template-extract': '1.0.15' },
    },
    selection: 'full',
  },
  findings: [],
  summary: {
    files: { read: 3, skipped: 1 },
    questionnaires: 2,
    expressions: { analysed: 4, unchecked: 0 },
    errors: 0,
    warnings: 0,
    info: 0,
    suppressedFindings: 0,
    suppressions: { applied: 0, stale: 0, notAssessed: 0 },
    config: 'sdc-questionnaire-lint.config.mjs',
    fshSources: ['input/fsh', 'shared/fsh'],
    fshSourceLookup: 'enabled',
  },
};

const failed: Report = {
  schemaVersion: 1,
  status: 'failed',
  failure: {
    code: 'INPUT_NOT_FOUND',
    path: 'missing.json',
    message: 'Input file does not exist.',
    help: 'Check the supplied path.',
  },
};

const mapped: Report = {
  schemaVersion: 1,
  status: 'completed',
  run: {
    tool: { name: 'sdc-questionnaire-lint', version: '0.1.0' },
    plugins: [{ name: 'sdc', version: '0.1.0' }],
    compat: {},
    selection: 'full',
  },
  findings: [
    {
      kind: 'questionnaire',
      ruleId: 'sdc/undefined-variable',
      severity: 'error',
      message:
        '"Patient name" (patient-name) uses %patientNmae, which is not defined. This field will not calculate.',
      help: 'A variable with a similar name exists: %patientName.',
      jsonLocation: {
        file: 'fsh-generated/resources/Questionnaire-Example.json',
        pointer: '/item/0/extension/0/valueExpression/expression',
        resource: { resourceType: 'Questionnaire', id: 'Example', pointer: '' },
        linkId: 'patient-name',
      },
      sourceLocation: {
        status: 'mapped',
        confidence: 'exact',
        location: {
          file: 'input/fsh/Example.fsh',
          line: 42,
          column: 18,
          endLine: 42,
          endColumn: 30,
        },
      },
      expression: { text: '%patientNmae.exists()', range: { startOffset: 0, endOffset: 12 } },
      suggestions: [
        {
          description: 'Rename %patientNmae to %patientName.',
          applicability: 'maybe-incorrect',
          edits: [
            {
              target: {
                kind: 'source',
                file: 'input/fsh/Example.fsh',
                line: 42,
                column: 18,
                endLine: 42,
                endColumn: 30,
              },
              oldText: '%patientNmae',
              replacement: '%patientName',
            },
          ],
        },
      ],
      fingerprint:
        'example:undefined-variable:Example:patient-name:calculatedExpression:patientNmae',
    },
  ],
  summary: {
    files: { read: 1, skipped: 0 },
    questionnaires: 1,
    expressions: { analysed: 1, unchecked: 0 },
    errors: 1,
    warnings: 0,
    info: 0,
    suppressedFindings: 0,
    suppressions: { applied: 0, stale: 0, notAssessed: 0 },
    config: null,
    fshSources: ['input/fsh'],
    fshSourceLookup: 'enabled',
  },
};

const staleSuppression: Report = {
  schemaVersion: 1,
  status: 'completed',
  run: {
    tool: { name: 'sdc-questionnaire-lint', version: '0.1.0' },
    plugins: [{ name: 'sdc', version: '0.1.0' }],
    compat: {},
    selection: 'full',
  },
  findings: [
    {
      kind: 'config',
      ruleId: 'lint/stale-suppression',
      severity: 'warning',
      message:
        'A suppression targets fsh-generated/resources/Questionnaire-Deleted.json, which no longer exists.',
      help: 'Remove this suppression from the configuration.',
      configLocation: { file: 'sdc-questionnaire-lint.config.mjs', pointer: '/suppress/0' },
      fingerprint: 'example:stale-suppression:Deleted:patient-name:sdc/undefined-variable',
    },
  ],
  summary: {
    files: { read: 1, skipped: 0 },
    questionnaires: 1,
    expressions: { analysed: 1, unchecked: 0 },
    errors: 0,
    warnings: 1,
    info: 0,
    suppressedFindings: 0,
    suppressions: { applied: 0, stale: 1, notAssessed: 0 },
    config: 'sdc-questionnaire-lint.config.mjs',
    fshSources: ['input/fsh'],
    fshSourceLookup: 'enabled',
  },
};

const targeted: Report = {
  schemaVersion: 1,
  status: 'completed',
  run: {
    tool: { name: 'sdc-questionnaire-lint', version: '0.1.0' },
    plugins: [{ name: 'sdc', version: '0.1.0' }],
    compat: {},
    selection: 'targeted',
  },
  findings: [
    {
      kind: 'questionnaire',
      ruleId: 'sdc/undefined-variable',
      severity: 'error',
      message:
        '"Patient name" (patient-name) uses %patientNmae, which is not defined. This field will not calculate.',
      help: 'A variable with a similar name exists: %patientName.',
      jsonLocation: {
        file: 'fsh-generated/resources/Questionnaire-Example.json',
        pointer: '/item/0/extension/0/valueExpression/expression',
        resource: { resourceType: 'Questionnaire', id: 'Example', pointer: '' },
        linkId: 'patient-name',
      },
      sourceLocation: {
        status: 'mapped',
        confidence: 'exact',
        location: {
          file: 'input/fsh/Example.fsh',
          line: 42,
          column: 18,
          endLine: 42,
          endColumn: 30,
        },
      },
      expression: { text: '%patientNmae.exists()', range: { startOffset: 0, endOffset: 12 } },
      suggestions: [
        {
          description: 'Rename %patientNmae to %patientName.',
          applicability: 'maybe-incorrect',
          edits: [
            {
              target: {
                kind: 'source',
                file: 'input/fsh/Example.fsh',
                line: 42,
                column: 18,
                endLine: 42,
                endColumn: 30,
              },
              oldText: '%patientNmae',
              replacement: '%patientName',
            },
          ],
        },
      ],
      fingerprint:
        'example:undefined-variable:Example:patient-name:calculatedExpression:patientNmae',
    },
  ],
  summary: {
    files: { read: 1, skipped: 0 },
    questionnaires: 1,
    expressions: { analysed: 1, unchecked: 0 },
    errors: 1,
    warnings: 0,
    info: 0,
    suppressedFindings: 0,
    suppressions: { applied: 0, stale: 0, notAssessed: 1 },
    config: 'sdc-questionnaire-lint.config.json',
    fshSources: ['input/fsh'],
    fshSourceLookup: 'enabled',
  },
};

const unmapped: Report = {
  schemaVersion: 1,
  status: 'completed',
  run: {
    tool: { name: 'sdc-questionnaire-lint', version: '0.1.0' },
    plugins: [{ name: 'sdc', version: '0.1.0' }],
    compat: {},
    selection: 'full',
  },
  findings: [
    {
      kind: 'questionnaire',
      ruleId: 'sdc/undefined-variable',
      severity: 'error',
      message:
        'Questionnaire/Example uses %patientNmae, which is not defined. Its variable cannot be calculated.',
      help: 'A variable with a similar name exists: %patientName.',
      note: 'FSH sources were not found; this is a compiled JSON location.',
      jsonLocation: {
        file: 'fsh-generated/resources/Bundle-Example.json',
        pointer: '/entry/0/resource/extension/0/valueExpression/expression',
        resource: { resourceType: 'Questionnaire', id: 'Example', pointer: '/entry/0/resource' },
      },
      sourceLocation: { status: 'unmapped', reason: 'source-unavailable' },
      expression: { text: '%patientNmae.exists()', range: { startOffset: 0, endOffset: 12 } },
      suggestions: [
        {
          description: 'Use %patientName in the maintained source for this expression.',
          applicability: 'maybe-incorrect',
          edits: [
            {
              target: {
                kind: 'json-string',
                file: 'fsh-generated/resources/Bundle-Example.json',
                pointer: '/entry/0/resource/extension/0/valueExpression/expression',
                startOffset: 0,
                endOffset: 12,
              },
              oldText: '%patientNmae',
              replacement: '%patientName',
            },
          ],
        },
      ],
      fingerprint: 'example:undefined-variable:Example:root-variable:patientNmae',
    },
  ],
  summary: {
    files: { read: 1, skipped: 0 },
    questionnaires: 1,
    expressions: { analysed: 1, unchecked: 0 },
    errors: 1,
    warnings: 0,
    info: 0,
    suppressedFindings: 0,
    suppressions: { applied: 0, stale: 0, notAssessed: 0 },
    config: null,
    fshSources: [],
    fshSourceLookup: 'enabled',
  },
};

const examples: [string, Report][] = [
  ['completed.json', completed],
  ['failed.json', failed],
  ['mapped.json', mapped],
  ['stale-suppression.json', staleSuppression],
  ['targeted.json', targeted],
  ['unmapped.json', unmapped],
];

describe('report types', () => {
  it.each(examples)('the %s literal matches the example file', (file, literal) => {
    expect(literal).toEqual(readJson(new URL(`examples/reports/${file}`, docsDir)));
  });
});

// Variants the schema forbids must not type-check either.
const location = {
  kind: 'questionnaire',
  jsonLocation: {
    file: 'Questionnaire-A.json',
    pointer: '/item/0',
    resource: { resourceType: 'Questionnaire', pointer: '' },
  },
} as const;

// @ts-expect-error An absent optional field is omitted, never written as undefined.
const undefinedHelp: QuestionnaireFinding = {
  ...location,
  ruleId: 'sdc/x',
  severity: 'error',
  message: 'm',
  fingerprint: 'f',
  sourceLocation: { status: 'unmapped', reason: 'not-found' },
  help: undefined,
};

// Exported so the unused negative cases stay type-checked without tripping no-unused-vars.
export const typeErrors = [
  {
    ...location,
    ruleId: 'sdc/x',
    severity: 'error',
    message: 'm',
    fingerprint: 'f',
    // @ts-expect-error An unmapped source location carries no coordinates.
    sourceLocation: { status: 'unmapped', reason: 'not-found', location: { file: 'a.fsh' } },
  } satisfies QuestionnaireFinding,
  {
    kind: 'config',
    // @ts-expect-error Only the lint namespace reports configuration findings.
    ruleId: 'sdc/x',
    severity: 'warning',
    message: 'm',
    fingerprint: 'f',
    configLocation: { file: 'c.json', pointer: '/suppress/0' },
  } satisfies ConfigFinding,
  undefinedHelp,
  // @ts-expect-error Smart Forms compat needs the renderer and populate versions.
  { 'smart-forms': { renderer: '1.0.0', 'template-extract': '1.0.0' } } satisfies RunCompat,
];
