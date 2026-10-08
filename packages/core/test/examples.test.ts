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
      findings.map(({ ruleId, message, jsonLocation, sourceLocation }) => [
        ruleId,
        jsonLocation.linkId,
        sourceLocation.status === 'mapped'
          ? `${sourceLocation.location.file}:${String(sourceLocation.location.line)}`
          : sourceLocation.reason,
        message,
      ]),
    ).toEqual([
      ['sdc/parse-error', 'bmi', 'multiline', 'This FHIRPath expression has a syntax error.'],
      [
        'sdc/query-syntax',
        'height',
        'input/fsh/HealthCheck.fsh:36',
        "This x-fhir-query is not a FHIR search, so the form's request fails and the fields it fills stay empty.",
      ],
      [
        'sdc/unknown-function',
        'bmi',
        'input/fsh/HealthCheck.fsh:48',
        'fist() is not a FHIRPath function, so this expression fails when the form runs.',
      ],
      [
        'sdc/parse-error',
        'smoking',
        'input/fsh/HealthCheck.fsh:64',
        'The character " is not valid here.',
      ],
      [
        'sdc/fragment-parse-error',
        'smoking',
        'input/fsh/HealthCheck.fsh:69',
        'A closing ) is missing.',
      ],
      [
        'sdc/uncatalogued-expression',
        'smoking',
        'input/fsh/HealthCheck.fsh:75',
        'This expression is in a place the linter does not recognise, so only its FHIRPath syntax and function names can be checked.',
      ],
      [
        'sdc/parse-error',
        'packs',
        'input/fsh/HealthCheck.fsh:84',
        'The expression ends before it is complete.',
      ],
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
