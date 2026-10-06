import type {
  CompletedReport,
  ConfigFinding,
  Finding,
  QuestionnaireFinding,
  Summary,
} from '../../src/index.js';
import type { ExpressionSite } from '../../src/plugins/types.js';

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

// An uncatalogued site with no language and no text; override any field.
export function expressionSite(overrides: Partial<ExpressionSite> = {}): ExpressionSite {
  return {
    pointer: '/extension/0/valueExpression',
    expressionPointer: '/extension/0/valueExpression',
    carrier: 'expression',
    catalogued: false,
    declares: false,
    useCases: [],
    ...overrides,
  };
}

// The site of the fragment {{text}} in query, at its first occurrence; override any field.
export function fragmentSite(
  query: string,
  text: string,
  overrides: Partial<ExpressionSite> = {},
): ExpressionSite {
  const braces = query.indexOf(`{{${text}}}`);
  if (braces === -1) throw new Error(`{{${text}}} is not in ${query}`);
  const startOffset = braces + 2;
  return expressionSite({
    carrier: 'fragment',
    language: 'text/fhirpath',
    text,
    fragment: { query, startOffset, endOffset: startOffset + text.length },
    ...overrides,
  });
}
