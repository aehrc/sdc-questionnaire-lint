import { describe, expect, it } from 'vitest';
import { buildSummary, type SummaryInput } from '../../src/report/summary.js';
import type { Finding, Severity } from '../../src/report/types.js';

function finding(severity: Severity): Finding {
  return {
    kind: 'questionnaire',
    ruleId: 'test/rule',
    severity,
    message: 'Something is wrong.',
    fingerprint: `fingerprint-${severity}`,
    jsonLocation: {
      file: 'Questionnaire-A.json',
      pointer: '/item/0',
      resource: { resourceType: 'Questionnaire', id: 'A', pointer: '' },
    },
    sourceLocation: { status: 'unmapped', reason: 'source-unavailable' },
  };
}

const staleSuppression: Finding = {
  kind: 'config',
  ruleId: 'lint/stale-suppression',
  severity: 'warning',
  message: 'A suppression targets B.json, which no longer exists.',
  fingerprint: 'stale',
  configLocation: { file: 'sdc-questionnaire-lint.config.json', pointer: '/suppress/0' },
};

function input(findings: Finding[]): SummaryInput {
  return {
    findings,
    files: { read: 3, skipped: 1 },
    questionnaires: 2,
    expressions: { analysed: 4, unchecked: 1 },
    suppressedFindings: 2,
    suppressions: { applied: 1, stale: 1, notAssessed: 3 },
    config: 'sdc-questionnaire-lint.config.json',
    fshSources: ['input/fsh', 'shared/fsh'],
    fshSourceLookup: 'enabled',
  };
}

describe('buildSummary', () => {
  it('counts each severity, including config findings', () => {
    const summary = buildSummary(
      input([
        finding('error'),
        finding('warning'),
        finding('info'),
        finding('info'),
        staleSuppression,
      ]),
    );
    expect(summary).toMatchObject({ errors: 1, warnings: 2, info: 2 });
  });

  it('counts an info-only run', () => {
    const summary = buildSummary(
      input([finding('info'), finding('info'), finding('info'), finding('info')]),
    );
    expect(summary).toMatchObject({ errors: 0, warnings: 0, info: 4 });
  });

  it('counts an empty run', () => {
    expect(buildSummary(input([]))).toMatchObject({ errors: 0, warnings: 0, info: 0 });
  });

  it('copies the run values unchanged', () => {
    expect(buildSummary(input([]))).toEqual({
      files: { read: 3, skipped: 1 },
      questionnaires: 2,
      expressions: { analysed: 4, unchecked: 1 },
      errors: 0,
      warnings: 0,
      info: 0,
      suppressedFindings: 2,
      suppressions: { applied: 1, stale: 1, notAssessed: 3 },
      config: 'sdc-questionnaire-lint.config.json',
      fshSources: ['input/fsh', 'shared/fsh'],
      fshSourceLookup: 'enabled',
    });
  });

  it('keeps a null config and omitted lookup', () => {
    const summary = buildSummary({
      ...input([]),
      config: null,
      fshSources: [],
      fshSourceLookup: 'omitted',
    });
    expect(summary).toMatchObject({ config: null, fshSources: [], fshSourceLookup: 'omitted' });
  });

  it('does not share nested objects with its input', () => {
    const source = input([]);
    const summary = buildSummary(source);
    summary.fshSources.push('other/fsh');
    summary.files.read = 99;
    expect(source.fshSources).toEqual(['input/fsh', 'shared/fsh']);
    expect(source.files.read).toBe(3);
  });
});
