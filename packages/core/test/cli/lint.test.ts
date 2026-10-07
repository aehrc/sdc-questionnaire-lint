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

  describe('with a suppression of a deleted file', () => {
    const A = 'fsh-generated/resources/Questionnaire-A.json';
    const suppressionIg = () =>
      tempTree({
        'sdc-questionnaire-lint.config.json': JSON.stringify({
          suppress: [
            {
              rule: 'sdc/parse-error',
              file: 'fsh-generated/resources/Questionnaire-Gone.json',
              reason: 'demo',
            },
          ],
        }),
        [A]: JSON.stringify({ resourceType: 'Questionnaire', status: 'draft' }),
      });

    it('prints a stale warning at the entry in a full run, and exits 0', async () => {
      const result = runBinary(['lint'], { cwd: await suppressionIg() });
      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(
        /^sdc-questionnaire-lint\.config\.json: warning lint\/stale-suppression A suppression of sdc\/parse-error targets fsh-generated\/resources\/Questionnaire-Gone\.json, which no longer exists\.\n {2}location: \/suppress\/0\n {2}help: remove this entry from suppress\n/,
      );
      expect(result.stdout).toContain('Suppressions: 0 applied, 1 stale, 0 not assessed.\n');
    });

    it('does not assess it in a targeted run', async () => {
      const result = runBinary(['lint', A], { cwd: await suppressionIg() });
      expect(result.code).toBe(0);
      expect(result.stdout).not.toContain('lint/stale-suppression');
      expect(result.stdout).toMatch(/^0 findings in 1 questionnaire\./);
      expect(result.stdout).toContain('Suppressions: 0 applied, 0 stale, 1 not assessed.\n');
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

  describe('with a plugin', () => {
    // An .mjs config listing an inline demo plugin whose one rule runs body as check(ctx).
    function pluginIg(body: string, severity = 'warning', preamble = '') {
      return tempTree({
        'sdc-questionnaire-lint.config.mjs': `${preamble}
          export default {
            plugins: [{
              meta: { name: 'demo', version: '0.0.0' },
              rules: {
                'no-today': {
                  meta: { description: 'Flags today().', defaultSeverity: '${severity}' },
                  check(ctx) { ${body} },
                },
              },
            }],
          };`,
        'fsh-generated/resources/Questionnaire-A.json': JSON.stringify({
          resourceType: 'Questionnaire',
          id: 'A',
          status: 'draft',
          item: [
            {
              linkId: 'age',
              extension: [
                {
                  url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
                  valueExpression: { language: 'text/fhirpath', expression: 'today()' },
                },
              ],
            },
          ],
        }),
      });
    }
    const reportToday = `
      for (const site of ctx.sites) {
        if (site.text?.includes('today()')) ctx.report({ site, message: 'This expression uses today().' });
      }`;

    it('exits 0 for a warning, naming the plugin in the footer', async () => {
      const result = runBinary(['lint'], { cwd: await pluginIg(reportToday) });
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('warning demo/no-today This expression uses today().\n');
      expect(result.stdout).toMatch(/Plugins: demo@0\.0\.0, sdc@\S+\n/);
    });

    it('exits 1 for an error, with a complete JSON report', async () => {
      const cwd = await pluginIg(reportToday, 'error');
      const result = runBinary(['lint', '--format', 'json'], { cwd });
      expect(result.code).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({
        status: 'completed',
        findings: [{ ruleId: 'demo/no-today', severity: 'error' }],
      });
    });

    it('exits 2 for a crash, with a failed JSON report and stderr naming the rule', async () => {
      const cwd = await pluginIg("throw new Error('boom');");
      const result = runBinary(['lint', '--format', 'json'], { cwd });
      expect(result.code).toBe(2);
      expect(failed(result.stdout).failure).toEqual({
        code: 'RULE_CRASH',
        ruleId: 'demo/no-today',
        message: 'rule demo/no-today crashed: boom',
        help: 'this is a bug in the demo plugin; report it to its maintainers',
      });
      expect(result.stderr).toBe(
        'error: rule demo/no-today crashed: boom\n' +
          'help: this is a bug in the demo plugin; report it to its maintainers\n',
      );
    });

    it('keeps logging from the config and from check out of JSON stdout', async () => {
      const cwd = await pluginIg(
        "console.log('rule says hello'); process.stdout.write('rule writes\\n');",
        'warning',
        "console.info('config says hello');",
      );
      const result = runBinary(['lint', '--format', 'json'], { cwd });
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ status: 'completed' });
      expect(result.stderr).toBe('config says hello\nrule says hello\nrule writes\n');
    });
  });
});
