// The GitHub Actions format: one workflow-command annotation per finding, then the complete text
// log, since GitHub shows only the first few annotations of each kind per step; and the Markdown
// job summary the CLI appends to $GITHUB_STEP_SUMMARY.
import { createHash } from 'node:crypto';
import { displayPointer, findingDetailLines, primaryLocation, resourceLabel } from './locations.js';
import { compareFindings } from './sort.js';
import { formatTextFindings, formatTextSummary } from './text.js';
import type { CompletedReport, FailureRecord, Finding, Severity } from './types.js';

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

// GitHub rejects a step summary over 1 MiB; rows stop short of it, leaving room for the rest.
const summaryLimit = 900 * 1024;

// Text from the forms as one table cell: Markdown and HTML render as written, a pipe cannot end
// the cell, and line breaks stay inside it.
export function markdownCell(text: string): string {
  return text
    .replace(/[\\`*_[\]~#]/g, '\\$&')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('|', '\\|')
    .replace(/\r\n|\r|\n/g, '<br>');
}

function locationCell(finding: Finding): string {
  const primary = primaryLocation(finding);
  if (primary.kind === 'source') {
    const { file, line, column } = primary.location;
    return markdownCell(`${file}:${String(line)}:${String(column)}`);
  }
  const site =
    primary.kind === 'config'
      ? displayPointer(primary.pointer)
      : `${resourceLabel(primary.resource)}; ${displayPointer(primary.pointer)}`;
  return `${markdownCell(primary.file)}<br>${markdownCell(site)}`;
}

function summaryRow(finding: Finding): string {
  const details = [
    finding.message,
    ...(finding.note === undefined ? [] : [`note: ${finding.note}`]),
    ...(finding.help === undefined ? [] : [`help: ${finding.help}`]),
  ];
  const cells = [
    finding.severity,
    markdownCell(finding.ruleId),
    locationCell(finding),
    markdownCell(details.join('\n')),
  ];
  return `| ${cells.join(' | ')} |\n`;
}

// The job summary: the counts, a table of every finding, then the run's inputs, suppressions,
// config and versions. limit is in bytes; tests lower it.
export function formatGithubSummary(report: CompletedReport, limit = summaryLimit): string {
  const [counts = '', ...facts] = formatTextSummary(report, { showInfo: true })
    .trimEnd()
    .split('\n');
  const head = `### sdc-lint\n\n${markdownCell(counts)}\n\n`;
  const tail = `\n${facts.map((fact) => `- ${markdownCell(fact)}\n`).join('')}`;
  const findings = [...report.findings].sort(compareFindings);
  if (findings.length === 0) return `${head.trimEnd()}\n${tail}`;

  let table = '| Severity | Rule | Location | Message |\n| :- | :- | :- | :- |\n';
  // Room for the note on findings left out, whose count has at most a few digits.
  let budget = limit - Buffer.byteLength(head + table + tail) - 100;
  let shown = 0;
  for (const finding of findings) {
    const row = summaryRow(finding);
    budget -= Buffer.byteLength(row);
    if (budget < 0) break;
    table += row;
    shown += 1;
  }
  const omitted = findings.length - shown;
  const note =
    omitted === 0
      ? ''
      : `\n${String(omitted)} more ${omitted === 1 ? 'finding is' : 'findings are'} in the job log.\n`;
  return `${head}${table}${note}${tail}`;
}

// A run that did not complete: one error annotation titled with the failure code, at the file the
// failure names when it names one.
export function formatGithubFailure(failure: FailureRecord): string {
  const properties: [string, string][] = [];
  if (failure.path !== undefined) properties.push(['file', failure.path]);
  properties.push(['title', `sdc-lint failed: ${failure.code}`]);
  const lines = [
    failure.message,
    ...(failure.ruleId === undefined ? [] : [`rule: ${failure.ruleId}`]),
    `help: ${failure.help}`,
  ];
  return `${workflowCommand('error', properties, lines.join('\n'))}\n`;
}

// The job summary of a run that did not complete. It has no counts and no table, so it cannot be
// read as a clean run.
export function formatGithubFailureSummary(failure: FailureRecord): string {
  const facts = [
    `Code: ${failure.code}`,
    ...(failure.path === undefined ? [] : [`File: ${failure.path}`]),
    ...(failure.ruleId === undefined ? [] : [`Rule: ${failure.ruleId}`]),
    `Problem: ${failure.message}`,
    `Help: ${failure.help}`,
  ];
  return `### sdc-lint did not complete\n\n${facts.map((fact) => `- ${markdownCell(fact)}\n`).join('')}`;
}
