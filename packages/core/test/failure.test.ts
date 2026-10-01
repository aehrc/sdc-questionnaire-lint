import { describe, expect, it } from 'vitest';
import {
  type FailureCode,
  LintFailure,
  type LintFailureInit,
  renderFailureJson,
  renderFailureText,
} from '../src/failure.js';
import { validateReportSchema as validate } from './support/report.js';

const codes: FailureCode[] = [
  'USAGE_ERROR',
  'CONFIG_INVALID',
  'INPUT_NOT_FOUND',
  'INPUT_PATTERN_UNMATCHED',
  'INPUT_UNREADABLE',
  'INPUT_INVALID_JSON',
  'NO_QUESTIONNAIRES',
  'RULE_CRASH',
  'INTERNAL_ERROR',
];

function failureFor(code: FailureCode): LintFailure {
  const fields = { message: `Something failed (${code}).`, help: 'Do the next thing.' };
  return new LintFailure(
    code === 'RULE_CRASH' ? { ...fields, code, ruleId: 'test/crashes' } : { ...fields, code },
  );
}

describe('renderFailureJson', () => {
  it.each(codes)('renders a schema-valid failed document for %s', (code) => {
    const document = JSON.parse(renderFailureJson(failureFor(code))) as unknown;
    expect(validate(document), JSON.stringify(validate.errors, null, 2)).toBe(true);
    expect(document).toMatchObject({ schemaVersion: 1, status: 'failed', failure: { code } });
    expect(document).not.toHaveProperty('run');
    expect(document).not.toHaveProperty('findings');
    expect(document).not.toHaveProperty('summary');
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
});
