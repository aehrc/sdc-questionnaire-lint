import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CompletedReport, FailedReport } from '../../src/index.js';
import { runBinary, runInProcess } from '../support/cli.js';
import { expectValidReport } from '../support/report.js';
import { tempTree } from '../support/tmp.js';

const cwd = fileURLToPath(new URL('../fixtures/cli/plugin-run/', import.meta.url));

function completed(stdout: string): CompletedReport {
  return expectValidReport(JSON.parse(stdout)) as CompletedReport;
}

function failed(stdout: string): FailedReport {
  return expectValidReport(JSON.parse(stdout)) as FailedReport;
}

describe('sdc-lint lint', () => {
  it('exits 0 with warnings only', () => {
    const result = runBinary(['lint', '--config', 'warning.config.mjs'], { cwd });
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(': warning test/finding-per-questionnaire ');
    expect(result.stdout).toContain(
      '3 findings (0 errors, 3 warnings, 0 info) in 3 questionnaires.\n',
    );
  });

  it('exits 1 with an error, and the JSON report is complete', () => {
    const result = runBinary(['lint', '--config', 'error.config.mjs', '--format', 'json'], { cwd });
    expect(result.code).toBe(1);
    const report = completed(result.stdout);
    expect(report.status).toBe('completed');
    expect(report.findings).toHaveLength(3);
    expect(report.summary.errors).toBe(3);
  });

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

  it('keeps the exit code and counts with --show-info, changing only what is shown', () => {
    const hidden = runBinary(['lint', '--config', 'info.config.mjs'], { cwd });
    const shown = runBinary(['lint', '--config', 'info.config.mjs', '--show-info'], { cwd });
    expect(shown.code).toBe(hidden.code);
    expect(hidden.stdout).toMatch(
      /^4 findings \(0 errors, 0 warnings, 4 info\) in 3 questionnaires\. 4 info findings hidden; use --show-info\.\n/,
    );
    expect(shown.stdout).toContain(
      '\n4 findings (0 errors, 0 warnings, 4 info) in 3 questionnaires.\n',
    );
    expect(shown.stdout).toContain(': info test/second-rule First expression found.\n');
  });

  it('gives identical JSON with and without --show-info', () => {
    const plain = runBinary(['lint', '--config', 'info.config.mjs', '--format', 'json'], { cwd });
    const withInfo = runBinary(
      ['lint', '--config', 'info.config.mjs', '--format', 'json', '--show-info'],
      { cwd },
    );
    expect(withInfo).toEqual(plain);
  });

  it('fails a rule crash with exit 2, naming the rule on stderr and in the record', () => {
    const text = runBinary(['lint', '--config', 'crash.config.mjs'], { cwd });
    expect(text.code).toBe(2);
    expect(text.stdout).toBe('');
    expect(text.stderr).toMatch(/^error: rule crash\/boom failed on .*: boom\n/);

    const result = runBinary(['lint', '--config', 'crash.config.mjs', '--format', 'json'], { cwd });
    expect(failed(result.stdout).failure).toMatchObject({
      code: 'RULE_CRASH',
      ruleId: 'crash/boom',
    });
  });

  it('keeps plugin logging out of the JSON report', () => {
    const result = runBinary(['lint', '--config', 'logging.config.mjs', '--format', 'json'], {
      cwd,
    });
    expect(result.code).toBe(0);
    completed(result.stdout);
    expect(result.stderr).toContain('logging plugin imported\n');
    expect(result.stderr).toContain('checking A\n');
    expect(result.stderr).toContain('direct write from a rule\n');
  });

  it('reports an unexpected exception as INTERNAL_ERROR without a stack trace', async () => {
    const missing = `${await tempTree()}/gone`;
    const result = await runInProcess(['lint', '--format', 'json'], { cwd: missing });
    expect(result.code).toBe(2);
    expect(failed(result.stdout).failure).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(result.stderr).not.toMatch(/\n\s+at /);
  });
});

describe('colour', () => {
  const argv = ['lint', '--config', 'warning.config.mjs'];

  it('colours the severity for a terminal', async () => {
    const result = await runInProcess(argv, { cwd, isTTY: true });
    expect(result.stdout).toContain(': \u001b[33mwarning\u001b[39m test/');
  });

  it('is off with NO_COLOR, and off when stdout is not a terminal', async () => {
    const noColor = await runInProcess(argv, { cwd, isTTY: true, env: { NO_COLOR: '1' } });
    const piped = await runInProcess(argv, { cwd, isTTY: false });
    expect(noColor.stdout).not.toContain('\u001b[');
    expect(piped.stdout).toBe(noColor.stdout);
  });

  it('does not depend on CI', async () => {
    const plain = await runInProcess(argv, { cwd, isTTY: true });
    const ci = await runInProcess(argv, { cwd, isTTY: true, env: { CI: 'true' } });
    expect(ci).toEqual(plain);
    expect(runBinary(argv, { cwd, env: { ...process.env, CI: 'true' } })).toEqual(
      runBinary(argv, { cwd, env: { ...process.env, CI: '' } }),
    );
  });
});
