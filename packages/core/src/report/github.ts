// The GitHub Actions format: one workflow-command annotation per finding, then the complete text
// log, since GitHub shows only the first few annotations of each kind per step.
import { createHash } from 'node:crypto';
import { findingDetailLines, primaryLocation } from './locations.js';
import { compareFindings } from './sort.js';
import { formatTextFindings, formatTextSummary } from './text.js';
import type { CompletedReport, Finding, Severity } from './types.js';

type AnnotationCommand = 'error' | 'warning' | 'notice';

const commands: Record<Severity, AnnotationCommand> = {
  error: 'error',
  warning: 'warning',
  info: 'notice',
};

// Workflow-command escaping, as @actions/core does it: a message keeps its line breaks, and a
// property value cannot end the property list or the command.
export function escapeData(value: string): string {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

export function escapeProperty(value: string): string {
  return escapeData(value).replaceAll(':', '%3A').replaceAll(',', '%2C');
}

function workflowCommand(
  name: AnnotationCommand,
  properties: readonly (readonly [string, string])[],
  message: string,
): string {
  const list = properties.map(([key, value]) => `${key}=${escapeProperty(value)}`).join(',');
  return `::${name}${list === '' ? '' : ` ${list}`}::${escapeData(message)}`;
}

// A mapped finding is annotated at its FSH range. GitHub takes columns only on a single line,
// and its end column is inclusive where the report's is exclusive. An unmapped or config finding
// keeps its severity but gets no position, since GitHub has no place for a compiled JSON site or a
// config entry: its message names the file, and its detail lines the site.
function annotation(finding: Finding): string {
  const primary = primaryLocation(finding);
  const properties: [string, string][] = [];
  let first = finding.message;
  if (primary.kind === 'source') {
    const { file, line, column, endLine, endColumn } = primary.location;
    properties.push(['file', file], ['line', String(line)], ['endLine', String(endLine)]);
    if (line === endLine) {
      properties.push(
        ['col', String(column)],
        ['endColumn', String(Math.max(column, endColumn - 1))],
      );
    }
  } else {
    first = `${primary.file}: ${finding.message}`;
  }
  properties.push(['title', finding.ruleId]);
  const message = [first, ...findingDetailLines(finding)].join('\n');
  return workflowCommand(commands[finding.severity], properties, message);
}

// Stops GitHub from running workflow commands in text taken from the forms, such as a line of an
// expression that starts with ::. The token is the text's own hash: it is the same on every run,
// and the text cannot contain it.
function withoutCommands(text: string): string {
  const token = createHash('sha256').update(text).digest('hex');
  return `::stop-commands::${token}\n${text}::${token}::\n`;
}

// Annotations in report order, then every finding as text in a collapsed group, then the summary.
// Info findings are always included, as in JSON.
export function formatGithubReport(report: CompletedReport): string {
  const findings = [...report.findings].sort(compareFindings);
  const all = { showInfo: true, colour: false };
  const annotations = findings.map((finding) => `${annotation(finding)}\n`).join('');
  const log = formatTextFindings(findings, all);
  const group =
    log === '' ? '' : `::group::sdc-lint findings\n${withoutCommands(log)}::endgroup::\n`;
  return `${annotations}${group}${withoutCommands(formatTextSummary(report, all))}`;
}
