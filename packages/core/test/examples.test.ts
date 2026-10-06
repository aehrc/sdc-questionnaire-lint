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
    expect(
      findings.map(({ ruleId, message, jsonLocation }) => [ruleId, jsonLocation.linkId, message]),
    ).toEqual([
      ['sdc/parse-error', 'bmi', 'This FHIRPath expression has a syntax error.'],
      ['sdc/parse-error', 'smoking', 'The character " is not valid here.'],
      ['sdc/parse-error', 'packs', 'The expression ends before it is complete.'],
      [
        'sdc/uncatalogued-expression',
        'smoking',
        'This expression is in a place the linter does not recognise, so only its FHIRPath syntax and function names can be checked.',
      ],
      [
        'sdc/unknown-function',
        'bmi',
        'fist() is not a FHIRPath function, so this expression fails when the form runs.',
      ],
    ]);
    expect(report.summary.expressions).toEqual({ analysed: 8, unchecked: 1 });
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
