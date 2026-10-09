import { paintSeverity } from './colour.js';
import { compareFindings } from './sort.js';
import type {
  CompletedReport,
  ExpressionExcerpt,
  Finding,
  RelatedLocation,
  ResourceIdentity,
  SourceMapResult,
} from './types.js';

export interface TextFindingOptions {
  showInfo: boolean;
  colour: boolean;
}

type UnmappedReason = Extract<SourceMapResult, { status: 'unmapped' }>['reason'];

const unmappedReasons: Record<UnmappedReason, string> = {
  ambiguous: 'the expression appears more than once',
  multiline: 'the expression spans several lines',
  'not-found': 'the expression was not found in the FSH sources',
  'source-unavailable': 'no FSH sources are available',
};

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${String(count)} ${count === 1 ? singular : pluralForm}`;
}

function displayPointer(pointer: string): string {
  return pointer === '' ? '(file root)' : pointer;
}

function resourceLabel(resource: ResourceIdentity): string {
  const name =
    resource.id === undefined
      ? `${resource.resourceType} without id`
      : `${resource.resourceType}/${resource.id}`;
  return resource.pointer === '' ? name : `${name} at ${resource.pointer}`;
}

// The line of the expression containing the range start, with a caret under the range when known.
function excerptLines({ text, range }: ExpressionExcerpt): string[] {
  if (text === '') return [];
  const start = Math.min(range?.startOffset ?? 0, text.length);
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const newline = text.indexOf('\n', start);
  const line = text.slice(lineStart, newline === -1 ? text.length : newline).replace(/\r$/, '');
  const lines = [`  ${line}`];
  if (range) {
    const end = Math.min(range.endOffset, lineStart + line.length);
    const width = Math.max(1, end - start);
    // Keep tabs so the caret lines up with the excerpt in a terminal.
    const padding = line.slice(0, start - lineStart).replace(/[^\t]/g, ' ');
    lines.push(`  ${padding}^${'~'.repeat(width - 1)}`);
  }
  return lines;
}

// A related location of a finding: its FSH line when mapped, otherwise its JSON Pointer in the
// finding's file, or its config entry.
function relatedPlace(related: RelatedLocation): string {
  if (related.kind === 'config') {
    return `${related.configLocation.file} ${displayPointer(related.configLocation.pointer)}`;
  }
  if (related.sourceLocation.status === 'unmapped') {
    return displayPointer(related.jsonLocation.pointer);
  }
  const { file, line, column } = related.sourceLocation.location;
  return `${file}:${String(line)}:${String(column)}`;
}

function findingLines(finding: Finding, colour: boolean): string[] {
  let place: string;
  if (finding.kind === 'config') place = finding.configLocation.file;
  else if (finding.sourceLocation.status === 'mapped') {
    const { file, line, column } = finding.sourceLocation.location;
    place = `${file}:${String(line)}:${String(column)}`;
  } else place = finding.jsonLocation.file;

  const lines = [
    `${place}: ${paintSeverity(finding.severity, colour)} ${finding.ruleId} ${finding.message}`,
  ];
  if (finding.expression) lines.push(...excerptLines(finding.expression));
  if (finding.kind === 'config') {
    lines.push(`  location: ${displayPointer(finding.configLocation.pointer)}`);
  } else if (finding.sourceLocation.status === 'unmapped') {
    const { pointer, resource } = finding.jsonLocation;
    lines.push(`  location: compiled JSON; ${resourceLabel(resource)}; ${displayPointer(pointer)}`);
    lines.push(`  note: FSH line not found, ${unmappedReasons[finding.sourceLocation.reason]}`);
  }
  for (const related of finding.relatedLocations ?? []) {
    const message = related.message === undefined ? '' : `: ${related.message}`;
    lines.push(`  related: ${relatedPlace(related)}${message}`);
  }
  if (finding.note !== undefined) lines.push(`  note: ${finding.note}`);
  if (finding.help !== undefined) lines.push(`  help: ${finding.help}`);
  return lines;
}

// Sorted findings, each followed by a newline and separated by a blank line; '' when none are shown.
export function formatTextFindings(
  findings: readonly Finding[],
  { showInfo, colour }: TextFindingOptions,
): string {
  return [...findings]
    .filter((finding) => showInfo || finding.severity !== 'info')
    .sort(compareFindings)
    .map((finding) => `${findingLines(finding, colour).join('\n')}\n`)
    .join('\n');
}

// Counts always cover every unsuppressed finding, including hidden info findings.
export function formatTextSummary(
  report: CompletedReport,
  { showInfo }: { showInfo: boolean },
): string {
  const { run, summary } = report;
  const total = summary.errors + summary.warnings + summary.info;
  const questionnaires = plural(summary.questionnaires, 'questionnaire');

  let counts =
    total === 0
      ? `0 findings in ${questionnaires}.`
      : `${plural(total, 'finding')} (${plural(summary.errors, 'error')}, ` +
        `${plural(summary.warnings, 'warning')}, ${String(summary.info)} info) in ${questionnaires}.`;
  if (summary.info > 0 && !showInfo) {
    counts += ` ${plural(summary.info, 'info finding')} hidden; use --show-info.`;
  }

  const fshSources =
    summary.fshSourceLookup === 'omitted'
      ? 'lookup omitted'
      : summary.fshSources.length === 0
        ? 'none found'
        : summary.fshSources.join(', ');
  const config = summary.config ?? 'none, built-in defaults';
  const plugins = run.plugins.map((plugin) => `${plugin.name}@${plugin.version}`).join(', ');

  const lines = [
    counts,
    `Inputs: ${run.selection} run; ${plural(summary.files.read, 'file')} read, ` +
      `${String(summary.files.skipped)} skipped. Expressions: ${String(summary.expressions.analysed)} ` +
      `analysed, ${String(summary.expressions.unchecked)} unchecked. ` +
      `Suppressed findings: ${String(summary.suppressedFindings)}.`,
    `Suppressions: ${String(summary.suppressions.applied)} applied, ` +
      `${String(summary.suppressions.stale)} stale, ` +
      `${String(summary.suppressions.notAssessed)} not assessed.`,
    `Config: ${config}. FSH sources: ${fshSources}.`,
    `Linter: ${run.tool.version}. Plugins: ${plugins}.`,
  ];
  const smartForms = run.compat['smart-forms'];
  if (smartForms) {
    lines.push(
      `Smart Forms: renderer ${smartForms.renderer}, populate ${smartForms.populate}, ` +
        `template-extract ${smartForms['template-extract']}.`,
    );
  }
  return `${lines.join('\n')}\n`;
}

// Findings, a blank line, then the summary.
export function formatTextReport(report: CompletedReport, options: TextFindingOptions): string {
  const findings = formatTextFindings(report.findings, options);
  const summary = formatTextSummary(report, options);
  return findings === '' ? summary : `${findings}\n${summary}`;
}
