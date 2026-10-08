import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CompletedReport, QuestionnaireFinding } from '../src/index.js';
import { runBinary } from './support/cli.js';

// The examples/ folders document what the linter reports; keep them true.
const healthCheck = fileURLToPath(new URL('../../../examples/health-check/', import.meta.url));

describe('examples/health-check', () => {
  it('reports the findings its README describes, and exits 1', () => {
    const result = runBinary(['lint', '--format', 'json'], { cwd: healthCheck });
    expect(result.code).toBe(1);
    const report = JSON.parse(result.stdout) as CompletedReport;
    const findings = report.findings as QuestionnaireFinding[];
    // Findings sort by file, then FSH position; the one finding without an FSH line comes first.
    expect(
      findings.map(({ ruleId, jsonLocation, sourceLocation }) => [
        ruleId,
        jsonLocation.linkId,
        sourceLocation.status === 'mapped'
          ? `${sourceLocation.location.file}:${String(sourceLocation.location.line)}`
          : sourceLocation.reason,
      ]),
    ).toEqual([
      ['sdc/parse-error', 'bmi', 'multiline'],
      ['sdc/query-syntax', 'height', 'input/fsh/HealthCheck.fsh:36'],
      ['sdc/unknown-function', 'bmi', 'input/fsh/HealthCheck.fsh:48'],
      ['sdc/parse-error', 'smoking', 'input/fsh/HealthCheck.fsh:64'],
      ['sdc/fragment-parse-error', 'smoking', 'input/fsh/HealthCheck.fsh:69'],
      ['sdc/uncatalogued-expression', 'smoking', 'input/fsh/HealthCheck.fsh:75'],
      ['sdc/parse-error', 'packs', 'input/fsh/HealthCheck.fsh:84'],
    ]);
    expect(report.summary.expressions).toEqual({ analysed: 13, unchecked: 1 });
  });

  it('prints the text output shown in its README', () => {
    const readme = readFileSync(`${healthCheck}README.md`, 'utf8');
    const shown = /`npx sdc-lint lint`:\n\n```text\n([\s\S]*?)```/.exec(readme)?.[1];
    // Versions change with every release; the README shows them only as an illustration.
    const withoutVersions = (text: string | undefined) => text?.replace(/\d+\.\d+\.\d+/g, 'x.y.z');
    const result = runBinary(['lint'], { cwd: healthCheck });
    expect(withoutVersions(result.stdout)).toBe(withoutVersions(shown));
  });
});
