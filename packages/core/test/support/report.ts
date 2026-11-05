/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsPlugin from 'ajv-formats';
import { expect } from 'vitest';
import type { OffsetRange, Report, SourceLocation, SourceMapResult } from '../../src/index.js';

// ajv-formats is CommonJS; under NodeNext its default export is the module object.
const addFormats = addFormatsPlugin.default;

export const docsDir = new URL('../../../../docs/', import.meta.url);

export function readJson(url: URL): unknown {
  return JSON.parse(readFileSync(url, 'utf8'));
}

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);

// Schema-only validation; read validateReportSchema.errors after a false result.
export const validateReportSchema = ajv.compile(
  readJson(new URL('schemas/lint-report.schema.json', docsDir)) as object,
);

function sourceRangeProblem(range: SourceLocation, where: string): string | undefined {
  const ordered =
    range.line < range.endLine || (range.line === range.endLine && range.column <= range.endColumn);
  return ordered ? undefined : `${where}: source range ends before it starts`;
}

function offsetRangeProblem(range: OffsetRange, where: string, length?: number): string[] {
  const problems: string[] = [];
  if (range.startOffset > range.endOffset)
    problems.push(`${where}: offset range ends before it starts`);
  if (length !== undefined && range.endOffset > length) {
    problems.push(`${where}: offset range ends past the end of the expression text`);
  }
  return problems;
}

function mappedProblem(result: SourceMapResult, where: string): string | undefined {
  return result.status === 'mapped' ? sourceRangeProblem(result.location, where) : undefined;
}

// The resource pointer is a prefix of the site pointer.
function pointerProblem(
  pointer: string,
  resourcePointer: string,
  where: string,
): string | undefined {
  return pointer === resourcePointer || pointer.startsWith(`${resourcePointer}/`)
    ? undefined
    : `${where}: pointer ${pointer} is outside its resource at ${resourcePointer}`;
}

// Constraints in docs/report-format.md that JSON Schema cannot express. Assumes a schema-valid report.
export function semanticProblems(report: Report): string[] {
  if (report.status === 'failed') return [];
  const { findings, summary } = report;
  const problems: (string | undefined)[] = [];
  const count = (severity: string): number =>
    findings.filter((finding) => finding.severity === severity).length;

  for (const severity of ['error', 'warning', 'info'] as const) {
    const key = severity === 'info' ? 'info' : (`${severity}s` as const);
    if (summary[key] !== count(severity)) {
      problems.push(
        `summary.${key} is ${String(summary[key])} but there are ${String(count(severity))} ${severity} findings`,
      );
    }
  }
  if (summary.files.skipped > summary.files.read) {
    problems.push('summary.files.skipped exceeds summary.files.read');
  }
  if (summary.questionnaires <= 0) problems.push('summary.questionnaires is not positive');
  for (const [state, value] of Object.entries(summary.suppressions)) {
    if (value < 0) problems.push(`summary.suppressions.${state} is negative`);
  }
  if (summary.suppressedFindings < 0) problems.push('summary.suppressedFindings is negative');

  const stale = findings.filter((finding) => finding.ruleId === 'lint/stale-suppression');
  if (stale.length > summary.suppressions.stale) {
    problems.push('more lint/stale-suppression findings than stale suppressions');
  }
  if (summary.fshSourceLookup === 'omitted' && summary.fshSources.length > 0) {
    problems.push('summary.fshSources is not empty although lookup was omitted');
  }
  const sorted = [...summary.fshSources].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (sorted.join('\n') !== summary.fshSources.join('\n')) {
    problems.push('summary.fshSources is not sorted');
  }

  findings.forEach((finding, index) => {
    const where = `findings/${String(index)}`;
    if (
      finding.ruleId === 'lint/stale-suppression' &&
      (finding.kind !== 'config' || finding.severity !== 'warning')
    ) {
      problems.push(`${where}: lint/stale-suppression must be a config warning`);
    }
    if (finding.kind === 'questionnaire') {
      const { pointer, resource } = finding.jsonLocation;
      problems.push(pointerProblem(pointer, resource.pointer, `${where}/jsonLocation`));
      problems.push(mappedProblem(finding.sourceLocation, `${where}/sourceLocation`));
    }
    if (finding.expression?.range) {
      problems.push(
        ...offsetRangeProblem(
          finding.expression.range,
          `${where}/expression`,
          finding.expression.text.length,
        ),
      );
    }
    finding.relatedLocations?.forEach((related, relatedIndex) => {
      if (related.kind === 'questionnaire') {
        problems.push(
          mappedProblem(
            related.sourceLocation,
            `${where}/relatedLocations/${String(relatedIndex)}`,
          ),
        );
      }
    });
    finding.suggestions?.forEach((suggestion, suggestionIndex) => {
      suggestion.edits.forEach(({ target }, editIndex) => {
        const editWhere = `${where}/suggestions/${String(suggestionIndex)}/edits/${String(editIndex)}`;
        problems.push(
          ...(target.kind === 'source'
            ? [sourceRangeProblem(target, editWhere)]
            : offsetRangeProblem(target, editWhere)),
        );
      });
    });
  });
  return problems.filter((problem) => problem !== undefined);
}

// Validates a captured JSON document against the schema and the semantic rules, and returns it typed.
export function expectValidReport(json: unknown): Report {
  expect(validateReportSchema(json), JSON.stringify(validateReportSchema.errors, null, 2)).toBe(
    true,
  );
  const report = json as Report;
  expect(semanticProblems(report)).toEqual([]);
  return report;
}
