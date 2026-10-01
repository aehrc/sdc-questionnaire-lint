import type { FailedReport } from './report/types.js';

// Codes are stable and never reused for another cause (report-format.md § Failures).
export type FailureCode =
  | 'USAGE_ERROR'
  | 'CONFIG_INVALID'
  | 'INPUT_NOT_FOUND'
  | 'INPUT_PATTERN_UNMATCHED'
  | 'INPUT_UNREADABLE'
  | 'INPUT_INVALID_JSON'
  | 'NO_QUESTIONNAIRES'
  | 'RULE_CRASH'
  | 'INTERNAL_ERROR';

interface FailureFields {
  message: string;
  help: string;
  path?: string;
}

// A rule crash must name its rule, so the type requires ruleId for that code only.
export type LintFailureInit =
  | (FailureFields & { code: Exclude<FailureCode, 'RULE_CRASH'>; ruleId?: string })
  | (FailureFields & { code: 'RULE_CRASH'; ruleId: string });

// A handled failure: the run stops, exits 2 and reports no findings.
export class LintFailure extends Error {
  override readonly name = 'LintFailure';
  readonly code: FailureCode;
  readonly help: string;
  readonly path?: string;
  readonly ruleId?: string;

  constructor(init: LintFailureInit) {
    if (init.code === 'RULE_CRASH' && !init.ruleId) {
      throw new TypeError('A RULE_CRASH failure requires a ruleId');
    }
    super(init.message);
    this.code = init.code;
    this.help = init.help;
    if (init.path !== undefined) this.path = init.path;
    if (init.ruleId !== undefined) this.ruleId = init.ruleId;
  }
}

export function renderFailureText(failure: LintFailure): string {
  return `error: ${failure.message}\nhelp: ${failure.help}\n`;
}

// The failed report document. It never carries run, findings or summary.
export function renderFailureJson(failure: LintFailure): string {
  const document: FailedReport = {
    schemaVersion: 1,
    status: 'failed',
    failure: {
      code: failure.code,
      ...(failure.path === undefined ? {} : { path: failure.path }),
      ...(failure.ruleId === undefined ? {} : { ruleId: failure.ruleId }),
      message: failure.message,
      help: failure.help,
    },
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}
