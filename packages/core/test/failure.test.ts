import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import {
  type FailureCode,
  LintFailure,
  type LintFailureInit,
  renderFailureJson,
  renderFailureOutput,
  renderFailureText,
} from '../src/failure.js';
import type { SarifLog } from '../src/report/sarif.js';
import { expectValidReport, validateReportSchema } from './support/report.js';
import { expectValidSarif } from './support/sarif.js';

const codes: FailureCode[] = [
  'USAGE_ERROR',
  'CONFIG_INVALID',
  'INPUT_NOT_FOUND',
  'INPUT_PATTERN_UNMATCHED',
  'INPUT_UNREADABLE',
  'INPUT_INVALID_JSON',
  'NO_QUESTIONNAIRES',
  'RULE_CRASH',
  'PLUGIN_CRASH',
  'INTERNAL_ERROR',
];

function failureFor(code: FailureCode): LintFailure {
  const fields = { message: `Something failed (${code}).`, help: 'Do the next thing.' };
  if (code === 'RULE_CRASH') return new LintFailure({ ...fields, code, ruleId: 'test/crashes' });
  if (code === 'PLUGIN_CRASH') {
    return new LintFailure({
      ...fields,
      code,
      plugin: { name: 'test', version: '1.0.0' },
      path: 'questionnaires/a.json',
    });
  }
  return new LintFailure({ ...fields, code });
}

describe('renderFailureJson', () => {
  it.each(codes)('renders a schema-valid failed document for %s', (code) => {
    const document = expectValidReport(JSON.parse(renderFailureJson(failureFor(code))));
    expect(document).toMatchObject({ schemaVersion: 1, status: 'failed', failure: { code } });
    expect(document).not.toHaveProperty('run');
    expect(document).not.toHaveProperty('findings');
    expect(document).not.toHaveProperty('summary');
  });

  it('includes the plugin of a PLUGIN_CRASH', () => {
    expect(JSON.parse(renderFailureJson(failureFor('PLUGIN_CRASH')))).toEqual({
      schemaVersion: 1,
      status: 'failed',
      failure: {
        code: 'PLUGIN_CRASH',
        path: 'questionnaires/a.json',
        plugin: { name: 'test', version: '1.0.0' },
        message: 'Something failed (PLUGIN_CRASH).',
        help: 'Do the next thing.',
      },
    });
  });

  it.each(['plugin', 'path'])('makes the schema reject a PLUGIN_CRASH without %s', (field) => {
    const document = JSON.parse(renderFailureJson(failureFor('PLUGIN_CRASH'))) as {
      failure: Record<string, unknown>;
    };
    Reflect.deleteProperty(document.failure, field);
    expect(validateReportSchema(document)).toBe(false);
  });

  it('omits absent optional fields rather than writing null', () => {
    const document = JSON.parse(renderFailureJson(failureFor('INTERNAL_ERROR'))) as {
      failure: object;
    };
    expect(Object.keys(document.failure).sort()).toEqual(['code', 'help', 'message']);
  });

  it('includes path and ruleId when present', () => {
    const failure = new LintFailure({
      code: 'RULE_CRASH',
      message: 'Rule test/crashes threw: boom.',
      help: 'Report the crash to the plugin author.',
      path: 'questionnaires/a.json',
      ruleId: 'test/crashes',
    });
    expect(renderFailureJson(failure)).toBe(
      `${JSON.stringify(
        {
          schemaVersion: 1,
          status: 'failed',
          failure: {
            code: 'RULE_CRASH',
            path: 'questionnaires/a.json',
            ruleId: 'test/crashes',
            message: 'Rule test/crashes threw: boom.',
            help: 'Report the crash to the plugin author.',
          },
        },
        null,
        2,
      )}\n`,
    );
  });
});

describe('renderFailureText', () => {
  it('renders the two-line error and help format', () => {
    const failure = new LintFailure({
      code: 'INPUT_NOT_FOUND',
      message: 'input missing.json does not exist',
      help: 'check the path, or run sdc-lint lint with no paths to lint the IG',
      path: 'missing.json',
    });
    expect(renderFailureText(failure)).toBe(
      'error: input missing.json does not exist\n' +
        'help: check the path, or run sdc-lint lint with no paths to lint the IG\n',
    );
  });
});

describe('LintFailure', () => {
  it('is an Error carrying the code', () => {
    const failure = failureFor('CONFIG_INVALID');
    expect(failure).toBeInstanceOf(Error);
    expect(failure.name).toBe('LintFailure');
    expect(failure.code).toBe('CONFIG_INVALID');
  });

  it('rejects a RULE_CRASH without a ruleId', () => {
    // Bypasses the type check to exercise the runtime guard for untyped callers.
    const init = { code: 'RULE_CRASH', message: 'x', help: 'y' } as unknown as LintFailureInit;
    expect(() => new LintFailure(init)).toThrow(/requires a ruleId/);
  });

  it.each([
    ['a plugin', { path: 'a.json' }],
    ['a path', { plugin: { name: 'test', version: '1.0.0' } }],
  ])('rejects a PLUGIN_CRASH without %s', (_, fields) => {
    const init = { code: 'PLUGIN_CRASH', message: 'x', help: 'y', ...fields } as LintFailureInit;
    expect(() => new LintFailure(init)).toThrow(/requires a plugin and a path/);
  });
});

describe('renderFailureOutput', () => {
  const cwd = path.resolve('/work/ig');
  const crash = new LintFailure({
    code: 'RULE_CRASH',
    message: 'Rule test/crashes threw: boom.',
    help: 'Report the crash to the plugin author.',
    path: 'questionnaires/a b.json',
    ruleId: 'test/crashes',
  });

  function sarifOf(failure: LintFailure): SarifLog {
    const { stdout = '' } = renderFailureOutput('sarif', failure, cwd);
    return JSON.parse(stdout) as SarifLog;
  }

  it('writes nothing besides stderr in text', () => {
    expect(renderFailureOutput('text', crash, cwd)).toEqual({});
  });

  it('writes the failed report in json', () => {
    expect(renderFailureOutput('json', crash, cwd)).toEqual({ stdout: renderFailureJson(crash) });
  });

  it.each(codes)('writes one error annotation titled with %s in github', (code) => {
    const { stdout = '' } = renderFailureOutput('github', failureFor(code), cwd);
    expect(stdout.split('\n')).toHaveLength(2);
    expect(stdout).toMatch(
      // A PLUGIN_CRASH always names its file.
      new RegExp(
        `^::error (?:file=questionnaires/a\\.json,)?title=sdc-lint failed%3A ${code}::Something failed \\(${code}\\)\\.`,
      ),
    );
    expect(stdout.endsWith('%0Ahelp: Do the next thing.\n')).toBe(true);
  });

  it('annotates the file a failure names, with its rule, in github', () => {
    expect(renderFailureOutput('github', crash, cwd).stdout).toBe(
      '::error file=questionnaires/a b.json,title=sdc-lint failed%3A RULE_CRASH::' +
        'Rule test/crashes threw: boom.%0Arule: test/crashes' +
        '%0Ahelp: Report the crash to the plugin author.\n',
    );
  });

  it('writes a job summary with no counts in github', () => {
    expect(renderFailureOutput('github', crash, cwd).summary).toBe(
      [
        '### sdc-lint did not complete',
        '',
        '- Code: RULE\\_CRASH',
        '- File: questionnaires/a b.json',
        '- Rule: test/crashes',
        '- Problem: Rule test/crashes threw: boom.',
        '- Help: Report the crash to the plugin author.',
        '',
      ].join('\n'),
    );
  });

  it.each(codes)('writes a valid SARIF log with no results for %s', (code) => {
    const log = sarifOf(failureFor(code));
    expectValidSarif(log);
    const [run] = log.runs;
    expect(run).not.toHaveProperty('results');
    expect(run.tool.driver).toEqual({ name: 'sdc-questionnaire-lint', version: pkg.version });
    expect(run.invocations).toEqual([
      {
        executionSuccessful: false,
        toolExecutionNotifications: [
          {
            level: 'error',
            descriptor: { id: code },
            ...(code === 'RULE_CRASH' ? { associatedRule: { id: 'test/crashes' } } : {}),
            message: { text: `Something failed (${code}).\nhelp: Do the next thing.` },
            ...(code === 'PLUGIN_CRASH'
              ? {
                  locations: [
                    {
                      physicalLocation: {
                        artifactLocation: { uri: 'questionnaires/a.json', uriBaseId: '%SRCROOT%' },
                      },
                    },
                  ],
                }
              : {}),
            properties: { help: 'Do the next thing.' },
          },
        ],
      },
    ]);
  });

  it('locates the file a failure names under %SRCROOT% in SARIF', () => {
    const [run] = sarifOf(crash).runs;
    expect(run.invocations[0].toolExecutionNotifications?.[0]?.locations).toEqual([
      {
        physicalLocation: {
          artifactLocation: { uri: 'questionnaires/a%20b.json', uriBaseId: '%SRCROOT%' },
        },
      },
    ]);
    expect(run.originalUriBaseIds).toEqual({
      '%SRCROOT%': { uri: `${pathToFileURL(cwd).href}/` },
    });
  });
});
