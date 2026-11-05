/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import pkg from '../package.json' with { type: 'json' };
import { formatGithubFailure, formatGithubFailureSummary } from './report/github.js';
import { formatJsonReport } from './report/json.js';
import { formatSarifFailure } from './report/sarif.js';
import type { FailedReport, FailureRecord, PackageVersion } from './report/types.js';

// The formats lint writes to stdout.
export type OutputFormat = 'text' | 'json' | 'github' | 'sarif';

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
  | 'PLUGIN_CRASH'
  | 'INTERNAL_ERROR';

interface FailureFields {
  message: string;
  help: string;
  path?: string;
  ruleId?: string;
  plugin?: PackageVersion;
}

// A rule crash must name its rule, and a plugin crash its plugin and file, so the type requires
// them for those codes only.
export type LintFailureInit =
  | (FailureFields & { code: Exclude<FailureCode, 'RULE_CRASH' | 'PLUGIN_CRASH'> })
  | (FailureFields & { code: 'RULE_CRASH'; ruleId: string })
  | (FailureFields & { code: 'PLUGIN_CRASH'; plugin: PackageVersion; path: string });

// A handled failure: the run stops, exits 2 and reports no findings.
export class LintFailure extends Error {
  override readonly name = 'LintFailure';
  readonly code: FailureCode;
  readonly help: string;
  readonly path?: string;
  readonly ruleId?: string;
  readonly plugin?: PackageVersion;

  constructor(init: LintFailureInit) {
    if (init.code === 'RULE_CRASH' && !init.ruleId) {
      throw new TypeError('A RULE_CRASH failure requires a ruleId');
    }
    // Typed as required, but an untyped caller may still omit them.
    if (init.code === 'PLUGIN_CRASH' && (!(init.plugin as unknown) || !init.path)) {
      throw new TypeError('A PLUGIN_CRASH failure requires a plugin and a path');
    }
    super(init.message);
    this.code = init.code;
    this.help = init.help;
    if (init.path !== undefined) this.path = init.path;
    if (init.ruleId !== undefined) this.ruleId = init.ruleId;
    if (init.plugin !== undefined) this.plugin = { ...init.plugin };
  }
}

// The message of a caught value, for failures that quote it. Never a stack trace.
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// A caught value as a failure to report: a LintFailure as is, anything else as INTERNAL_ERROR.
export function asLintFailure(error: unknown): LintFailure {
  if (error instanceof LintFailure) return error;
  return new LintFailure({
    code: 'INTERNAL_ERROR',
    message: `unexpected error: ${describeError(error)}`,
    help: 'this is a bug in sdc-questionnaire-lint; report it with the command you ran',
  });
}

export function renderFailureText(failure: LintFailure): string {
  return `error: ${failure.message}\nhelp: ${failure.help}\n`;
}

function failureRecord(failure: LintFailure): FailureRecord {
  return {
    code: failure.code,
    ...(failure.path === undefined ? {} : { path: failure.path }),
    ...(failure.ruleId === undefined ? {} : { ruleId: failure.ruleId }),
    ...(failure.plugin === undefined ? {} : { plugin: failure.plugin }),
    message: failure.message,
    help: failure.help,
  };
}

// The failed report document. It never carries run, findings or summary.
export function renderFailureJson(failure: LintFailure): string {
  const document: FailedReport = {
    schemaVersion: 1,
    status: 'failed',
    failure: failureRecord(failure),
  };
  return formatJsonReport(document);
}

// What a failure writes besides the error and help on stderr: a document on stdout, except in
// text, and for github a job summary section.
export interface FailureOutput {
  stdout?: string;
  summary?: string;
}

// cwd is the working directory report paths are relative to, which a SARIF log names.
export function renderFailureOutput(
  format: OutputFormat,
  failure: LintFailure,
  cwd: string,
): FailureOutput {
  switch (format) {
    case 'text':
      return {};
    case 'json':
      return { stdout: renderFailureJson(failure) };
    case 'github': {
      const record = failureRecord(failure);
      return { stdout: formatGithubFailure(record), summary: formatGithubFailureSummary(record) };
    }
    case 'sarif':
      return { stdout: formatSarifFailure(failureRecord(failure), pkg.version, cwd) };
  }
}
