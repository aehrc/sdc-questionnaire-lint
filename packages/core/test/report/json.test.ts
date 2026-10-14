import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatJsonReport } from '../../src/report/json.js';
import { compareFindings } from '../../src/report/sort.js';
import type { CompletedReport, FailedReport } from '../../src/report/types.js';
import {
  completedReport,
  questionnaireFinding,
  staleSuppressionFinding,
} from '../support/builders.js';
import { docsDir, expectValidReport, readJson, validateReportSchema } from '../support/report.js';

// Findings deliberately out of order.
function report(): CompletedReport {
  return completedReport(
    [
      staleSuppressionFinding(),
      questionnaireFinding({ ruleId: 'sdc/z-rule', fingerprint: 'z' }),
      questionnaireFinding({
        ruleId: 'sdc/a-rule',
        severity: 'warning',
        fingerprint: 'a',
        sourceLocation: {
          status: 'mapped',
          confidence: 'exact',
          location: { file: 'input/fsh/Example.fsh', line: 3, column: 5, endLine: 3, endColumn: 9 },
        },
      }),
      questionnaireFinding({ ruleId: 'sdc/b-rule', severity: 'info', fingerprint: 'b' }),
    ],
    { suppressions: { applied: 0, stale: 1, notAssessed: 0 } },
  );
}

// The same value with every object's keys in reverse insertion order.
function reversedKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reversedKeys) as T;
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, entry]) => [key, reversedKeys(entry)]),
  ) as T;
}

describe('formatJsonReport', () => {
  it('writes one valid report with a trailing newline', () => {
    const output = formatJsonReport(report());
    expect(output.endsWith('}\n')).toBe(true);
    expectValidReport(JSON.parse(output));
  });

  it('sorts findings with compareFindings', () => {
    const parsed = JSON.parse(formatJsonReport(report())) as CompletedReport;
    expect(parsed.findings).toEqual([...report().findings].sort(compareFindings));
    // JSON files, then the mapped FSH file, then the config file.
    expect(parsed.findings.map((finding) => finding.ruleId)).toEqual([
      'sdc/b-rule',
      'sdc/z-rule',
      'sdc/a-rule',
      'lint/stale-suppression',
    ]);
  });

  it('does not reorder the findings of the report it is given', () => {
    const input = report();
    const before = input.findings.map((finding) => finding.fingerprint);
    formatJsonReport(input);
    expect(input.findings.map((finding) => finding.fingerprint)).toEqual(before);
  });

  it('gives identical output for the same report', () => {
    expect(formatJsonReport(report())).toBe(formatJsonReport(report()));
  });

  // Findings gain optional fields in whatever order a rule reports them; the output must not.
  it('puts envelope and finding keys in the documented order', () => {
    const parsed = JSON.parse(formatJsonReport(reversedKeys(report()))) as CompletedReport;
    expect(Object.keys(parsed)).toEqual(['schemaVersion', 'status', 'run', 'findings', 'summary']);
    expect(Object.keys(parsed.findings[0] ?? {})).toEqual([
      'kind',
      'ruleId',
      'severity',
      'message',
      'jsonLocation',
      'sourceLocation',
      'fingerprint',
    ]);
  });

  it('never writes colour codes', () => {
    expect(formatJsonReport(report())).not.toContain('\u001b');
  });

  it('writes a failed report in the documented key order', () => {
    const failed: FailedReport = {
      schemaVersion: 1,
      status: 'failed',
      failure: {
        code: 'INPUT_NOT_FOUND',
        path: 'missing.json',
        message: 'input missing.json does not exist',
        help: 'check the path',
      },
    };
    expect(formatJsonReport(reversedKeys(failed))).toBe(`${JSON.stringify(failed, null, 2)}\n`);
  });
});

describe('the report schema', () => {
  const examples = new URL('examples/reports/', docsDir);
  const files = readdirSync(examples).filter((file) => file.endsWith('.json'));

  it('finds the six report examples', () => {
    expect(files).toHaveLength(6);
  });

  it.each(files)('validates the example %s', (file) => {
    const example = readJson(new URL(file, examples));
    expect(validateReportSchema(example), JSON.stringify(validateReportSchema.errors)).toBe(true);
  });

  function withCompat(compat: unknown): unknown {
    const json = JSON.parse(formatJsonReport(completedReport())) as { run: { compat: unknown } };
    json.run.compat = compat;
    return json;
  }

  it.each([
    ['a second namespace', { 'smart-forms': { renderer: '1.4.0' }, demo: { engine: '2.0.0' } }],
    ['Smart Forms compat without populate', { 'smart-forms': { renderer: '1.4.0' } }],
    ['an empty namespace map', { demo: {} }],
  ])('accepts %s', (_, compat) => {
    expect(validateReportSchema(withCompat(compat))).toBe(true);
  });

  it.each([
    ['latest', { 'smart-forms': { renderer: 'latest', populate: '4.7.1' } }],
    ['latest in another namespace', { demo: { engine: 'latest' } }],
    ['an empty version', { 'smart-forms': { renderer: '1.4.0', populate: '' } }],
    ['an empty version in another namespace', { demo: { engine: '' } }],
  ])('rejects %s as a compat version', (_, compat) => {
    expect(validateReportSchema(withCompat(compat))).toBe(false);
  });
});
