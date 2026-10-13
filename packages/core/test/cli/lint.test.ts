import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CompletedReport, FailedReport } from '../../src/index.js';
import type { SarifLog } from '../../src/report/sarif.js';
import { runBinary, runInProcess } from '../support/cli.js';
import { expectValidReport } from '../support/report.js';
import { tempTree } from '../support/tmp.js';

const cwd = fileURLToPath(new URL('../fixtures/cli/plugin-run/', import.meta.url));

function failed(stdout: string): FailedReport {
  return expectValidReport(JSON.parse(stdout)) as FailedReport;
}

// The environment outside GitHub Actions, even when these tests run in it: a github run must not
// append to the job summary of the test run itself.
const outsideActions = { ...process.env, GITHUB_STEP_SUMMARY: '' };

// The environment of a GitHub Actions step whose job summary is a fresh temporary file.
async function insideActions(): Promise<{ env: NodeJS.ProcessEnv; summary: string }> {
  const summary = path.join(await tempTree(), 'summary.md');
  return { env: { ...process.env, GITHUB_STEP_SUMMARY: summary }, summary };
}

function sarif(stdout: string): SarifLog['runs'][0] {
  return (JSON.parse(stdout) as SarifLog).runs[0];
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
      const result = runBinary(['lint'], { cwd: await ig(calculated('%resource.where(b)')) });
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

    it('keeps logging from an async rule out of JSON stdout after the run fails', async () => {
      const cwd = await pluginIg(
        "await new Promise((resolve) => setTimeout(resolve, 50)); console.log('late');",
      );
      // check must be async for the await.
      const config = path.join(cwd, 'sdc-questionnaire-lint.config.mjs');
      await writeFile(
        config,
        (await readFile(config, 'utf8')).replace('check(ctx)', 'async check(ctx)'),
      );
      const result = runBinary(['lint', '--format', 'json'], { cwd });
      expect(result.code).toBe(2);
      expect(failed(result.stdout).failure).toMatchObject({ code: 'RULE_CRASH' });
      expect(result.stderr).toMatch(/\nlate\n$/);
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

    it.each(['github', 'sarif'])(
      'keeps logging from the config and from check out of %s stdout',
      async (format) => {
        const cwd = await pluginIg(
          "console.log('rule says hello');",
          'warning',
          "console.info('config says hello');",
        );
        const result = runBinary(['lint', '--format', format], { cwd, env: outsideActions });
        expect(result.code).toBe(0);
        expect(result.stdout).not.toContain('hello');
        expect(result.stderr).toBe('config says hello\nrule says hello\n');
      },
    );

    it('describes the plugin and its rule in SARIF', async () => {
      const result = runBinary(['lint', '--format', 'sarif'], { cwd: await pluginIg(reportToday) });
      expect(result.code).toBe(0);
      const run = sarif(result.stdout);
      expect(run.tool.extensions).toContainEqual({ name: 'demo', version: '0.0.0' });
      expect(run.tool.driver.rules).toContainEqual({
        id: 'demo/no-today',
        shortDescription: { text: 'Flags today().' },
        defaultConfiguration: { level: 'warning' },
      });
      expect(run.results).toMatchObject([{ ruleId: 'demo/no-today', level: 'warning' }]);
    });

    it('exits 2 for a crash, with a SARIF log naming the rule and holding no results', async () => {
      const cwd = await pluginIg("throw new Error('boom');");
      const result = runBinary(['lint', '--format', 'sarif'], { cwd });
      expect(result.code).toBe(2);
      const run = sarif(result.stdout);
      expect(run).not.toHaveProperty('results');
      expect(run.invocations[0]).toMatchObject({
        executionSuccessful: false,
        toolExecutionNotifications: [
          { descriptor: { id: 'RULE_CRASH' }, associatedRule: { id: 'demo/no-today' } },
        ],
      });
      expect(result.stderr).toBe(
        'error: rule demo/no-today crashed: boom\n' +
          'help: this is a bug in the demo plugin; report it to its maintainers\n',
      );
    });

    it('exits 2 for a crash, with a GitHub annotation and a summary that did not complete', async () => {
      const cwd = await pluginIg("throw new Error('boom');");
      const { env, summary } = await insideActions();
      const result = runBinary(['lint', '--format', 'github'], { cwd, env });
      expect(result.code).toBe(2);
      expect(result.stdout).toBe(
        '::error title=sdc-lint failed%3A RULE_CRASH::rule demo/no-today crashed: boom' +
          '%0Arule: demo/no-today' +
          '%0Ahelp: this is a bug in the demo plugin; report it to its maintainers\n',
      );
      const markdown = await readFile(summary, 'utf8');
      expect(markdown).toMatch(/^### sdc-lint did not complete\n/);
      expect(markdown).toContain('- Rule: demo/no-today\n');
      expect(markdown).not.toContain('| Severity |');
    });
  });
});

describe('sdc-lint lint --format github and sarif', () => {
  // 38 findings, mapped exactly, anchored, and unmapped for each reason the FSH allows.
  const sourceMap = fileURLToPath(new URL('../fixtures/source-map/', import.meta.url));
  const formats = ['text', 'json', 'github', 'sarif'];

  function jsonReport(): CompletedReport {
    return JSON.parse(
      runBinary(['lint', '--format', 'json'], { cwd: sourceMap }).stdout,
    ) as CompletedReport;
  }

  function brokenIg() {
    return tempTree({
      'fsh-generated/resources/Questionnaire-A.json': JSON.stringify({
        resourceType: 'Questionnaire',
        id: 'A',
        status: 'draft',
        extension: [
          {
            url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
            valueExpression: { language: 'text/fhirpath', expression: '%a.where(b' },
          },
        ],
      }),
    });
  }

  it.each([
    [
      'a clean IG',
      0,
      () =>
        tempTree({
          'fsh-generated/resources/Questionnaire-A.json':
            '{"resourceType":"Questionnaire","status":"draft"}',
        }),
    ],
    ['an IG with an error', 1, brokenIg],
    ['a missing path', 2, () => tempTree()],
  ])('exits with the same code in every format for %s', async (_case, code, makeIg) => {
    const cwd = await makeIg();
    const paths = code === 2 ? ['missing.json'] : [];
    for (const format of formats) {
      const result = runBinary(['lint', ...paths, '--format', format], {
        cwd,
        env: outsideActions,
      });
      expect([format, result.code]).toEqual([format, code]);
    }
  });

  it('annotates mapped findings at their FSH line and unmapped ones without a file', () => {
    const { findings } = jsonReport();
    const result = runBinary(['lint', '--format', 'github'], {
      cwd: sourceMap,
      env: outsideActions,
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toBe('');
    const lines = result.stdout.split('\n');
    const annotations = lines.slice(0, lines.indexOf('::group::sdc-lint findings'));
    expect(annotations).toHaveLength(findings.length);
    const mapped = findings.filter(
      (finding) => finding.kind === 'questionnaire' && finding.sourceLocation.status === 'mapped',
    );
    expect(
      annotations.filter((line) => / file=input\/fsh\/\S+\.fsh,line=\d+,/.test(line)),
    ).toHaveLength(mapped.length);
    expect(annotations.filter((line) => !line.includes(' file='))).toHaveLength(
      findings.length - mapped.length,
    );
    expect(mapped.length).toBeGreaterThan(0);
    expect(findings.length).toBeGreaterThan(mapped.length);
  });

  it('writes a job summary with a row per finding inside GitHub Actions', async () => {
    const { findings, summary: counts } = jsonReport();
    const { env, summary } = await insideActions();
    const result = runBinary(['lint', '--format', 'github'], { cwd: sourceMap, env });
    expect(result.code).toBe(1);
    const markdown = await readFile(summary, 'utf8');
    const total = counts.errors + counts.warnings + counts.info;
    expect(markdown).toMatch(new RegExp(`^### sdc-lint\n\n${String(total)} findings `));
    expect(
      markdown.split('\n').filter((line) => /^\| (error|warning|info) \|/.test(line)),
    ).toHaveLength(findings.length);
  });

  it('writes the failure annotation and summary for a missing path', async () => {
    const { env, summary } = await insideActions();
    const result = runBinary(['lint', 'missing.json', '--format', 'github'], {
      cwd: sourceMap,
      env,
    });
    expect(result).toEqual({
      code: 2,
      stdout:
        '::error file=missing.json,title=sdc-lint failed%3A INPUT_NOT_FOUND::' +
        'input missing.json does not exist' +
        '%0Ahelp: check the path; it is relative to the current directory\n',
      stderr:
        'error: input missing.json does not exist\n' +
        'help: check the path; it is relative to the current directory\n',
    });
    expect(await readFile(summary, 'utf8')).toBe(
      '### sdc-lint did not complete\n\n' +
        '- Code: INPUT\\_NOT\\_FOUND\n' +
        '- File: missing.json\n' +
        '- Problem: input missing.json does not exist\n' +
        '- Help: check the path; it is relative to the current directory\n',
    );
  });

  it('gives mapped results their FSH region and unmapped ones their compiled file in SARIF', () => {
    const { findings } = jsonReport();
    const result = runBinary(['lint', '--format', 'sarif'], { cwd: sourceMap });
    expect(result.code).toBe(1);
    const run = sarif(result.stdout);
    const results = run.results ?? [];
    expect(results).toHaveLength(findings.length);
    for (const { properties, locations } of results) {
      const { physicalLocation } = locations[0];
      const { status } = properties.sourceMapping as { status: string };
      expect(physicalLocation.artifactLocation.uriBaseId).toBe('%SRCROOT%');
      if (status === 'mapped') {
        expect(physicalLocation.artifactLocation.uri).toMatch(/^input\/fsh\/\w+\.fsh$/);
        expect(physicalLocation.region).toBeDefined();
      } else {
        expect(physicalLocation.artifactLocation.uri).toMatch(/^fsh-generated\/resources\//);
        expect(physicalLocation).not.toHaveProperty('region');
      }
    }
    const described = new Set((run.tool.driver.rules ?? []).map(({ id }) => id));
    for (const { ruleId } of results) expect(described).toContain(ruleId);
    expect(run.originalUriBaseIds?.['%SRCROOT%']?.uri).toMatch(/^file:\/\/.*\/$/);
  });

  it('writes a SARIF log with no results for a missing path', () => {
    const result = runBinary(['lint', 'missing.json', '--format', 'sarif'], { cwd: sourceMap });
    expect(result.code).toBe(2);
    const run = sarif(result.stdout);
    expect(run).not.toHaveProperty('results');
    expect(run.invocations[0].toolExecutionNotifications).toMatchObject([
      {
        descriptor: { id: 'INPUT_NOT_FOUND' },
        locations: [
          {
            physicalLocation: { artifactLocation: { uri: 'missing.json', uriBaseId: '%SRCROOT%' } },
          },
        ],
      },
    ]);
    expect(result.stderr).toMatch(/^error: input missing\.json does not exist\n/);
  });
});
