import type {
  CompletedReport,
  ConfigFinding,
  Finding,
  QuestionnaireFinding,
  Summary,
} from '../../src/index.js';

// A schema-valid unmapped Questionnaire finding; override any field.
export function questionnaireFinding(
  overrides: Partial<QuestionnaireFinding> = {},
): QuestionnaireFinding {
  return {
    kind: 'questionnaire',
    ruleId: 'sdc/undefined-variable',
    severity: 'error',
    message: 'Something is wrong.',
    fingerprint: 'fingerprint',
    jsonLocation: {
      file: 'fsh-generated/resources/Questionnaire-Example.json',
      pointer: '/item/0/extension/0/valueExpression/expression',
      resource: { resourceType: 'Questionnaire', id: 'Example', pointer: '' },
    },
    sourceLocation: { status: 'unmapped', reason: 'source-unavailable' },
    ...overrides,
  };
}

export function staleSuppressionFinding(overrides: Partial<ConfigFinding> = {}): ConfigFinding {
  return {
    kind: 'config',
    ruleId: 'lint/stale-suppression',
    severity: 'warning',
    message: 'A suppression targets B.json, which no longer exists.',
    help: 'remove this suppression from the configuration',
    fingerprint: 'stale',
    configLocation: { file: 'sdc-questionnaire-lint.config.json', pointer: '/suppress/0' },
    ...overrides,
  };
}

// A completed report whose severity counts match its findings; override summary fields as needed.
export function completedReport(
  findings: Finding[] = [],
  summary: Partial<Summary> = {},
): CompletedReport {
  const count = (severity: string): number =>
    findings.filter((finding) => finding.severity === severity).length;
  return {
    schemaVersion: 1,
    status: 'completed',
    run: {
      tool: { name: 'sdc-questionnaire-lint', version: '0.1.0' },
      plugins: [{ name: 'sdc', version: '0.1.0' }],
      compat: {},
      selection: 'full',
    },
    findings,
    summary: {
      files: { read: 1, skipped: 0 },
      questionnaires: 1,
      expressions: { analysed: 1, unchecked: 0 },
      errors: count('error'),
      warnings: count('warning'),
      info: count('info'),
      suppressedFindings: 0,
      suppressions: { applied: 0, stale: 0, notAssessed: 0 },
      config: null,
      fshSources: ['input/fsh'],
      fshSourceLookup: 'enabled',
      ...summary,
    },
  };
}
