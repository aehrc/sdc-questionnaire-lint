import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { RuleSetting } from '../../src/config/types.js';
import type { LintRule } from '../../src/plugins/contract.js';
import type { ResolvedRule } from '../../src/plugins/rule-set.js';
import { formatSarifReport, type SarifLog } from '../../src/report/sarif.js';
import { compareFindings } from '../../src/report/sort.js';
import type { CompletedReport, Finding, SourceLocation } from '../../src/report/types.js';
import {
  completedReport,
  questionnaireFinding,
  staleSuppressionFinding,
} from '../support/builders.js';
import { docsDir, readJson } from '../support/report.js';
import { expectValidSarif, validateSarifSchema } from '../support/sarif.js';

// Absolute on every platform, so the expected base URI is too.
const cwd = path.resolve('/work/ig');

function resolvedRule(
  id: string,
  meta: Partial<LintRule['meta']> = {},
  setting?: RuleSetting,
): ResolvedRule {
  const fullMeta: LintRule['meta'] = {
    description: `Checks ${id}.`,
    defaultSeverity: 'error',
    ...meta,
  };
  return {
    id,
    namespace: id.split('/')[0] ?? '',
    rule: { meta: fullMeta, check: () => undefined },
    setting: setting ?? fullMeta.defaultSeverity,
    compat: {},
  };
}

const rules: ResolvedRule[] = [
  resolvedRule('sdc/undefined-variable', {
    description: 'A variable is not defined where it is used.',
    docsUrl: 'https://example.org/rules/undefined-variable',
    docs: {
      checks: 'Checks that each variable is defined.',
      why: 'An undefined variable fails at run time.',
      exampleMessage: 'uses %x, which is not defined.',
      fix: 'Define the variable, or fix its name.',
      limitations: 'None.',
    },
  }),
  resolvedRule('sdc/unused-declaration', { defaultSeverity: 'warning' }),
  resolvedRule('sdc/shadowed-declaration', { defaultSeverity: 'info' }),
  resolvedRule('sdc/unknown-function', {}, 'off'),
  resolvedRule('lint/stale-suppression', { defaultSeverity: 'warning' }),
];

const fshRange: SourceLocation = {
  file: 'input/fsh/Example.fsh',
  line: 42,
  column: 18,
  endLine: 42,
  endColumn: 30,
};

const mappedError = questionnaireFinding({
  ruleId: 'sdc/undefined-variable',
  severity: 'error',
  message:
    '"Patient name" (patient-name) uses %patientNmae, which is not defined. This field will not calculate.',
  help: 'a variable with a similar name exists: %patientName',
  fingerprint: 'fp-undefined',
  sourceLocation: { status: 'mapped', confidence: 'exact', location: fshRange },
  expression: { text: '%patientNmae.exists()', range: { startOffset: 0, endOffset: 12 } },
});

const unmappedWarning = questionnaireFinding({
  ruleId: 'sdc/unused-declaration',
  severity: 'warning',
  message: '"Patient summary" (patient-summary) declares %age, which nothing uses.',
  fingerprint: 'fp-unused',
  jsonLocation: {
    file: 'fsh-generated/resources/Questionnaire-Example.json',
    pointer: '/item/1/extension/0/valueExpression/expression',
    resource: { resourceType: 'Questionnaire', id: 'Example', pointer: '' },
    linkId: 'patient-summary',
  },
  sourceLocation: { status: 'unmapped', reason: 'ambiguous' },
  expression: { text: '%patient.birthDate' },
});

const infoWithRelated = questionnaireFinding({
  ruleId: 'sdc/shadowed-declaration',
  severity: 'info',
  message: '"Address" (address) declares %name, which hides %name declared above.',
  fingerprint: 'fp-shadowed',
  sourceLocation: {
    status: 'mapped',
    confidence: 'anchored',
    location: { ...fshRange, line: 60, endLine: 60 },
  },
  relatedLocations: [
    {
      kind: 'questionnaire',
      jsonLocation: {
        file: 'fsh-generated/resources/Questionnaire-Example.json',
        pointer: '/extension/0/valueExpression',
        resource: { resourceType: 'Questionnaire', id: 'Example', pointer: '' },
      },
      sourceLocation: {
        status: 'mapped',
        confidence: 'exact',
        location: { ...fshRange, line: 10, endLine: 10 },
      },
      message: 'the hidden declaration',
    },
    {
      kind: 'questionnaire',
      jsonLocation: {
        file: 'fsh-generated/resources/Questionnaire-Example.json',
        pointer: '/extension/1/valueExpression',
        resource: { resourceType: 'Questionnaire', id: 'Example', pointer: '' },
      },
      sourceLocation: { status: 'unmapped', reason: 'not-found' },
    },
  ],
});

const stale = staleSuppressionFinding({ fingerprint: 'fp-stale' });

const findings: Finding[] = [infoWithRelated, stale, unmappedWarning, mappedError];

function sarif(report: CompletedReport, resolved: readonly ResolvedRule[] = rules): SarifLog {
  return JSON.parse(formatSarifReport(report, resolved, cwd)) as SarifLog;
}

function onlyRun(log: SarifLog) {
  return log.runs[0];
}

function results(log: SarifLog) {
  return onlyRun(log).results ?? [];
}

function resultFor(log: SarifLog, ruleId: string) {
  const found = results(log).find((candidate) => candidate.ruleId === ruleId);
  if (found === undefined) throw new Error(`no result for ${ruleId}`);
  return found;
}

describe('formatSarifReport', () => {
  const log = sarif(completedReport(findings));

  it('writes one valid SARIF 2.1.0 run, ending in a newline', () => {
    const text = formatSarifReport(completedReport(findings), rules, cwd);
    expect(text.endsWith('}\n')).toBe(true);
    expectValidSarif(JSON.parse(text));
    expect(log).toMatchObject({
      $schema:
        'https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json',
      version: '2.1.0',
    });
    expect(log.runs).toHaveLength(1);
  });

  it('names the linter, its plugins and the run', () => {
    expect(onlyRun(log)).toMatchObject({
      tool: {
        driver: { name: 'sdc-questionnaire-lint', version: '0.1.0' },
        extensions: [{ name: 'sdc', version: '0.1.0' }],
      },
      invocations: [{ executionSuccessful: true }],
      columnKind: 'utf16CodeUnits',
      properties: { selection: 'full', compat: {}, summary: { errors: 1, warnings: 2, info: 1 } },
    });
  });

  it('defines %SRCROOT% as the working directory', () => {
    expect(onlyRun(log).originalUriBaseIds).toEqual({
      '%SRCROOT%': { uri: `${pathToFileURL(cwd).href}/` },
    });
  });

  it('describes each rule that ran, sorted by ID, leaving out rules configured off', () => {
    const descriptors = onlyRun(log).tool.driver.rules ?? [];
    expect(descriptors.map(({ id }) => id)).toEqual([
      'lint/stale-suppression',
      'sdc/shadowed-declaration',
      'sdc/undefined-variable',
      'sdc/unused-declaration',
    ]);
    expect(descriptors.find(({ id }) => id === 'sdc/undefined-variable')).toEqual({
      id: 'sdc/undefined-variable',
      shortDescription: { text: 'A variable is not defined where it is used.' },
      fullDescription: { text: 'Checks that each variable is defined.' },
      help: { text: 'Define the variable, or fix its name.' },
      helpUri: 'https://example.org/rules/undefined-variable',
      defaultConfiguration: { level: 'error' },
    });
    expect(descriptors.find(({ id }) => id === 'sdc/shadowed-declaration')).toEqual({
      id: 'sdc/shadowed-declaration',
      shortDescription: { text: 'Checks sdc/shadowed-declaration.' },
      defaultConfiguration: { level: 'note' },
    });
  });

  it('keeps a rule’s default level when its findings are configured to another severity', () => {
    const configured = [resolvedRule('sdc/undefined-variable', {}, 'warning')];
    const report = completedReport([{ ...mappedError, severity: 'warning' }]);
    const run = onlyRun(sarif(report, configured));
    expect(run.tool.driver.rules?.[0]?.defaultConfiguration).toEqual({ level: 'error' });
    expect(run.results?.[0]?.level).toBe('warning');
  });

  it('adds a bare descriptor for a rule that a finding names but the run did not resolve', () => {
    const run = onlyRun(sarif(completedReport([mappedError]), []));
    expect(run.tool.driver.rules).toEqual([{ id: 'sdc/undefined-variable' }]);
    expect(run.results?.[0]?.ruleIndex).toBe(0);
  });

  it('orders results as the JSON report does, each pointing at its rule', () => {
    const expected = [...findings].sort(compareFindings).map(({ ruleId }) => ruleId);
    expect(results(log).map(({ ruleId }) => ruleId)).toEqual(expected);
    const descriptors = onlyRun(log).tool.driver.rules ?? [];
    for (const { ruleId, ruleIndex } of results(log)) {
      expect(descriptors[ruleIndex]?.id).toBe(ruleId);
    }
  });

  it('maps error, warning and info to error, warning and note', () => {
    expect(resultFor(log, 'sdc/undefined-variable').level).toBe('error');
    expect(resultFor(log, 'sdc/unused-declaration').level).toBe('warning');
    expect(resultFor(log, 'sdc/shadowed-declaration').level).toBe('note');
  });

  it('gives a mapped finding its FSH region without converting it, and its help', () => {
    const result = resultFor(log, 'sdc/undefined-variable');
    expect(result.locations).toEqual([
      {
        physicalLocation: {
          artifactLocation: { uri: 'input/fsh/Example.fsh', uriBaseId: '%SRCROOT%' },
          region: { startLine: 42, startColumn: 18, endLine: 42, endColumn: 30 },
        },
      },
    ]);
    expect(result.message.text).toBe(
      `${mappedError.message}\nhelp: a variable with a similar name exists: %patientName`,
    );
    expect(result.properties).toMatchObject({
      sourceMapping: { status: 'mapped', confidence: 'exact' },
      expression: { text: '%patientNmae.exists()', range: { startOffset: 0, endOffset: 12 } },
    });
  });

  it('keeps an unmapped finding at its compiled file, without a region, and says why', () => {
    const result = resultFor(log, 'sdc/unused-declaration');
    expect(result.locations).toEqual([
      {
        physicalLocation: {
          artifactLocation: {
            uri: 'fsh-generated/resources/Questionnaire-Example.json',
            uriBaseId: '%SRCROOT%',
          },
        },
      },
    ]);
    expect(result.message.text.split('\n')).toEqual([
      unmappedWarning.message,
      'location: compiled JSON; Questionnaire/Example; /item/1/extension/0/valueExpression/expression',
      'note: FSH line not found, the expression appears more than once',
    ]);
    expect(result.properties).toEqual({
      jsonLocation: unmappedWarning.jsonLocation,
      sourceMapping: { status: 'unmapped', reason: 'ambiguous' },
      expression: { text: '%patient.birthDate' },
    });
  });

  it('locates a config finding at its config file', () => {
    const result = resultFor(log, 'lint/stale-suppression');
    expect(result.locations[0].physicalLocation).toEqual({
      artifactLocation: { uri: 'sdc-questionnaire-lint.config.json', uriBaseId: '%SRCROOT%' },
    });
    expect(result.properties).toEqual({
      configLocation: { file: 'sdc-questionnaire-lint.config.json', pointer: '/suppress/0' },
    });
  });

  it('lists related locations with ids and their messages', () => {
    expect(resultFor(log, 'sdc/shadowed-declaration').relatedLocations).toEqual([
      {
        id: 1,
        physicalLocation: {
          artifactLocation: { uri: 'input/fsh/Example.fsh', uriBaseId: '%SRCROOT%' },
          region: { startLine: 10, startColumn: 18, endLine: 10, endColumn: 30 },
        },
        message: { text: 'the hidden declaration' },
      },
      {
        id: 2,
        physicalLocation: {
          artifactLocation: {
            uri: 'fsh-generated/resources/Questionnaire-Example.json',
            uriBaseId: '%SRCROOT%',
          },
        },
      },
    ]);
    expect(resultFor(log, 'sdc/undefined-variable').relatedLocations).toBeUndefined();
  });

  it('encodes each path segment of an artifact URI', () => {
    const finding = questionnaireFinding({
      sourceLocation: {
        status: 'mapped',
        confidence: 'exact',
        location: { ...fshRange, file: 'input/fsh/My Form #1?.fsh' },
      },
    });
    const document = sarif(completedReport([finding]));
    expectValidSarif(document);
    expect(results(document)[0]?.locations[0].physicalLocation.artifactLocation.uri).toBe(
      'input/fsh/My%20Form%20%231%3F.fsh',
    );
  });

  it('carries the fingerprint under both partialFingerprints keys, wherever the FSH line moves', () => {
    const moved = {
      ...mappedError,
      sourceLocation: {
        status: 'mapped' as const,
        confidence: 'exact' as const,
        location: { ...fshRange, line: 45, endLine: 45 },
      },
    };
    const before = resultFor(log, 'sdc/undefined-variable').partialFingerprints;
    const after = resultFor(
      sarif(completedReport([moved])),
      'sdc/undefined-variable',
    ).partialFingerprints;
    expect(before).toEqual({
      primaryLocationLineHash: 'fp-undefined',
      'sdcQuestionnaireLint/v1': 'fp-undefined',
    });
    expect(after).toEqual(before);
  });

  it('writes results: [] for a completed run with no findings', () => {
    const document = sarif(completedReport());
    expectValidSarif(document);
    expect(onlyRun(document).results).toEqual([]);
  });

  it.each([
    'completed.json',
    'mapped.json',
    'unmapped.json',
    'stale-suppression.json',
    'targeted.json',
  ])('renders the example report %s as valid SARIF', (file) => {
    const report = readJson(new URL(`examples/reports/${file}`, docsDir)) as CompletedReport;
    const document = sarif(report, []);
    expectValidSarif(document);
    expect(results(document)).toHaveLength(report.findings.length);
  });
});

// Guards the schema loading in test/support/sarif.ts: a validator that accepted anything would let
// every test above pass.
describe('the SARIF schema check', () => {
  const valid = sarif(completedReport([mappedError]));

  it.each([
    ['another version', { ...valid, version: '2.0.0' }],
    ['the info level', withResult({ level: 'info' })],
    ['a region without a start', withRegion({ endLine: 42 })],
    ['a relative URI base ID with no URI', withBase({ '%SRCROOT%': { uri: 7 } })],
  ])('rejects %s', (_case, document) => {
    expect(validateSarifSchema(document)).toBe(false);
  });

  function clone(): SarifLog {
    return structuredClone(valid);
  }

  function withResult(fields: Record<string, unknown>): unknown {
    const document = clone();
    Object.assign(onlyRun(document).results?.[0] ?? {}, fields);
    return document;
  }

  function withRegion(region: Record<string, unknown>): unknown {
    const document = clone();
    const location = onlyRun(document).results?.[0]?.locations[0].physicalLocation;
    if (location) (location as { region: unknown }).region = region;
    return document;
  }

  function withBase(bases: Record<string, unknown>): unknown {
    const document = clone();
    (onlyRun(document) as { originalUriBaseIds: unknown }).originalUriBaseIds = bases;
    return document;
  }
});
