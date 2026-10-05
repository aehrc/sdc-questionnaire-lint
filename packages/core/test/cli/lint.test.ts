import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { FailedReport } from '../../src/index.js';
import { runBinary, runInProcess } from '../support/cli.js';
import { expectValidReport } from '../support/report.js';
import { tempTree } from '../support/tmp.js';

const cwd = fileURLToPath(new URL('../fixtures/cli/plugin-run/', import.meta.url));

function failed(stdout: string): FailedReport {
  return expectValidReport(JSON.parse(stdout)) as FailedReport;
}

describe('sdc-lint lint', () => {
  it('runs with built-in defaults and no findings in a clean IG', async () => {
    const ig = await tempTree({
      'fsh-generated/resources/Questionnaire-A.json': JSON.stringify({
        resourceType: 'Questionnaire',
        status: 'draft',
      }),
    });
    const result = runBinary(['lint'], { cwd: ig });
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^0 findings in 1 questionnaire\.\n/);
  });

  it('exits 2 for a missing path with empty stdout in text mode', () => {
    const result = runBinary(['lint', 'missing.json'], { cwd });
    expect(result).toEqual({
      code: 2,
      stdout: '',
      stderr:
        'error: input missing.json does not exist\n' +
        'help: check the path; it is relative to the current directory\n',
    });
  });

  it('exits 2 for a missing path with a failed document in JSON mode', () => {
    const result = runBinary(['lint', 'missing.json', '--format', 'json'], { cwd });
    expect(result.code).toBe(2);
    expect(failed(result.stdout).failure).toEqual({
      code: 'INPUT_NOT_FOUND',
      path: 'missing.json',
      message: 'input missing.json does not exist',
      help: 'check the path; it is relative to the current directory',
    });
    expect(result.stderr).toMatch(/^error: input missing\.json does not exist\n/);
  });

  it('reports an unexpected exception as INTERNAL_ERROR without a stack trace', async () => {
    const missing = `${await tempTree()}/gone`;
    const result = await runInProcess(['lint', '--format', 'json'], { cwd: missing });
    expect(result.code).toBe(2);
    expect(failed(result.stdout).failure).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(result.stderr).not.toMatch(/\n\s+at /);
  });
});
