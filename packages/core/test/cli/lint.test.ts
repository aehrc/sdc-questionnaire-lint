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

  describe('with expressions', () => {
    const calculated = (expression: string) => ({
      linkId: 'bmi',
      extension: [
        {
          url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
          valueExpression: { language: 'text/fhirpath', expression },
        },
      ],
    });

    function ig(item: unknown) {
      return tempTree({
        'fsh-generated/resources/Questionnaire-A.json': JSON.stringify({
          resourceType: 'Questionnaire',
          id: 'A',
          status: 'draft',
          item: [item],
        }),
      });
    }

    it('exits 1 and shows the expression with a caret for a broken expression', async () => {
      const result = runBinary(['lint'], { cwd: await ig(calculated('%a.where(b')) });
      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        'fsh-generated/resources/Questionnaire-A.json: error sdc/parse-error A closing ) is missing.\n' +
          '  %a.where(b\n' +
          '            ^\n',
      );
    });

    it('exits 0 with no findings when every expression is valid', async () => {
      const result = runBinary(['lint'], { cwd: await ig(calculated('%a.where(b)')) });
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/^0 findings in 1 questionnaire\./);
    });

    it('exits 0 for an info finding, and shows it only with --show-info', async () => {
      const cwd = await ig({
        linkId: 'q',
        extension: [
          {
            url: 'http://example.org/custom',
            valueExpression: { language: 'text/fhirpath', expression: '1 + 1' },
          },
        ],
      });
      const hidden = runBinary(['lint'], { cwd });
      const shown = runBinary(['lint', '--show-info'], { cwd });
      expect([hidden.code, shown.code]).toEqual([0, 0]);
      expect(hidden.stdout).not.toContain('sdc/uncatalogued-expression');
      expect(shown.stdout).toContain('info sdc/uncatalogued-expression');
      const summary = '1 finding (0 errors, 0 warnings, 1 info) in 1 questionnaire.';
      expect(hidden.stdout).toMatch(
        new RegExp(`^${summary.replace(/[.()]/g, '\\$&')} 1 info finding hidden`),
      );
      expect(shown.stdout).toContain(`\n${summary}\n`);
    });
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

  it('exits 2 for a missing --config with a CONFIG_INVALID document in JSON mode', () => {
    const result = runBinary(['lint', '--config', 'missing.json', '--format', 'json'], { cwd });
    expect(result.code).toBe(2);
    expect(failed(result.stdout).failure).toMatchObject({
      code: 'CONFIG_INVALID',
      path: 'missing.json',
    });
  });

  it('resolves defaults beneath a --config given from a parent directory', async () => {
    const parent = await tempTree({
      'ig/sdc-questionnaire-lint.config.json': '{}',
      'ig/fsh-generated/resources/Questionnaire-A.json': JSON.stringify({
        resourceType: 'Questionnaire',
        status: 'draft',
      }),
    });
    const config = ['--config', 'ig/sdc-questionnaire-lint.config.json', '--format', 'json'];
    const result = runBinary(['lint', ...config], { cwd: parent });
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      summary: { files: { read: 1 }, config: 'ig/sdc-questionnaire-lint.config.json' },
    });
    // A CLI path stays relative to the working directory.
    const targeted = runBinary(
      ['lint', ...config, 'ig/fsh-generated/resources/Questionnaire-A.json'],
      { cwd: parent },
    );
    expect(targeted.code).toBe(0);
  });

  it('reports an unexpected exception as INTERNAL_ERROR without a stack trace', async () => {
    const missing = `${await tempTree()}/gone`;
    const result = await runInProcess(['lint', '--format', 'json'], { cwd: missing });
    expect(result.code).toBe(2);
    expect(failed(result.stdout).failure).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(result.stderr).not.toMatch(/\n\s+at /);
  });
});
