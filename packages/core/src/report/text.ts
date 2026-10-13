import { paintSeverity } from './colour.js';
import { findingDetailLines, primaryLocation } from './locations.js';
import { compareFindings } from './sort.js';
import type { CompletedReport, ExpressionExcerpt, Finding } from './types.js';

export interface TextFindingOptions {
  showInfo: boolean;
  colour: boolean;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${String(count)} ${count === 1 ? singular : pluralForm}`;
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

function findingLines(finding: Finding, colour: boolean): string[] {
  const primary = primaryLocation(finding);
  const place =
    primary.kind === 'source'
      ? `${primary.location.file}:${String(primary.location.line)}:${String(primary.location.column)}`
      : primary.file;

  const lines = [
    `${place}: ${paintSeverity(finding.severity, colour)} ${finding.ruleId} ${finding.message}`,
  ];
  if (finding.expression) lines.push(...excerptLines(finding.expression));
  lines.push(...findingDetailLines(finding).map((line) => `  ${line}`));
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
    `Linter: ${run.tool.version}. Plugins: ${plugins}.` +
      (run.sushi === undefined ? '' : ` SUSHI: ${run.sushi.version}.`),
  ];
  const smartForms = run.compat['smart-forms'];
  if (smartForms) {
    const extract = smartForms['template-extract'];
    lines.push(
      `Smart Forms: renderer ${smartForms.renderer}, populate ${smartForms.populate}` +
        `${extract === undefined ? '' : `, template-extract ${extract}`}.`,
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
