// The SARIF 2.1.0 format: the completed report as one code-scanning run. It renders the same
// record as the JSON format, so findings, their order and fingerprints match it. The tests
// validate it against the OASIS schema in test/fixtures/sarif.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compareStrings } from '../compare.js';
import type { ResolvedRule } from '../plugins/rule-set.js';
import { findingDetailLines, type PrimaryLocation, primaryLocation } from './locations.js';
import { compareFindings } from './sort.js';
import type { CompletedReport, Finding, Severity } from './types.js';

export const sarifSchemaUri =
  'https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/schemas/sarif-schema-2.1.0.json';

// Artifact URIs are relative to this base, which stands for the working directory: report paths
// are relative to it too.
export const srcRoot = '%SRCROOT%';

// The partialFingerprints key carrying the report's fingerprint under this tool's own name.
export const fingerprintKey = 'sdcQuestionnaireLint/v1';

// The subset of SARIF 2.1.0 this format writes.
export type SarifLevel = 'error' | 'warning' | 'note';

interface SarifMessage {
  text: string;
}

interface SarifArtifactLocation {
  uri: string;
  uriBaseId?: string;
}

interface SarifRegion {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

interface SarifPhysicalLocation {
  artifactLocation: SarifArtifactLocation;
  region?: SarifRegion;
}

interface SarifLocation {
  id?: number;
  physicalLocation: SarifPhysicalLocation;
  message?: SarifMessage;
}

interface SarifReportingDescriptor {
  id: string;
  shortDescription?: SarifMessage;
  fullDescription?: SarifMessage;
  help?: SarifMessage;
  helpUri?: string;
  defaultConfiguration?: { level: SarifLevel };
}

interface SarifResult {
  ruleId: string;
  ruleIndex: number;
  level: SarifLevel;
  message: SarifMessage;
  locations: [SarifLocation];
  relatedLocations?: SarifLocation[];
  partialFingerprints: Record<string, string>;
  properties: Record<string, unknown>;
}

interface SarifToolComponent {
  name: string;
  version?: string;
  rules?: SarifReportingDescriptor[];
}

interface SarifInvocation {
  executionSuccessful: boolean;
}

interface SarifRun {
  tool: { driver: SarifToolComponent; extensions?: SarifToolComponent[] };
  invocations: [SarifInvocation];
  originalUriBaseIds?: Record<string, { uri: string }>;
  columnKind?: 'utf16CodeUnits';
  // Absent when the tool produced no results, which differs from [] for nothing found.
  results?: SarifResult[];
  properties?: Record<string, unknown>;
}

export interface SarifLog {
  $schema: string;
  version: '2.1.0';
  runs: [SarifRun];
}

const levels: Record<Severity, SarifLevel> = { error: 'error', warning: 'warning', info: 'note' };

export function sarifLevel(severity: Severity): SarifLevel {
  return levels[severity];
}

// A report path, relative to the working directory with / separators, as a URI reference under
// %SRCROOT%. A path on another Windows drive stays absolute in the report, so it gets a file URI.
export function artifactLocation(file: string): SarifArtifactLocation {
  if (path.isAbsolute(file)) return { uri: pathToFileURL(file).href };
  return { uri: file.split('/').map(encodeURIComponent).join('/'), uriBaseId: srcRoot };
}

// SARIF regions count lines and columns from 1, in UTF-16 code units under columnKind
// utf16CodeUnits, with an exclusive end column: the report's own convention, so nothing converts.
function physicalLocation(where: PrimaryLocation): SarifPhysicalLocation {
  if (where.kind !== 'source') return { artifactLocation: artifactLocation(where.file) };
  const { file, line, column, endLine, endColumn } = where.location;
  return {
    artifactLocation: artifactLocation(file),
    region: { startLine: line, startColumn: column, endLine, endColumn },
  };
}

function descriptor({ id, rule }: ResolvedRule): SarifReportingDescriptor {
  const { description, defaultSeverity, docsUrl, docs } = rule.meta;
  return {
    id,
    shortDescription: { text: description },
    ...(docs === undefined
      ? {}
      : { fullDescription: { text: docs.checks }, help: { text: docs.fix } }),
    ...(docsUrl === undefined ? {} : { helpUri: docsUrl }),
    defaultConfiguration: { level: sarifLevel(defaultSeverity) },
  };
}

// The rules that ran, and any rule a finding names, sorted by ID. A result's level carries its
// configured severity; a rule's default level stays its default.
function ruleDescriptors(
  rules: readonly ResolvedRule[],
  findings: readonly Finding[],
): SarifReportingDescriptor[] {
  const reported = new Set(findings.map(({ ruleId }) => ruleId));
  const descriptors = rules
    .filter(({ id, setting }) => setting !== 'off' || reported.has(id))
    .map(descriptor);
  const described = new Set(rules.map(({ id }) => id));
  for (const id of reported) if (!described.has(id)) descriptors.push({ id });
  return descriptors.sort((a, b) => compareStrings(a.id, b.id));
}

// What the report knows about a finding that SARIF has no field for: its compiled JSON site or
// config entry, how its FSH line was found or why not, and its expression.
function resultProperties(finding: Finding): Record<string, unknown> {
  const where =
    finding.kind === 'config'
      ? { configLocation: finding.configLocation }
      : {
          jsonLocation: finding.jsonLocation,
          sourceMapping:
            finding.sourceLocation.status === 'mapped'
              ? { status: 'mapped', confidence: finding.sourceLocation.confidence }
              : finding.sourceLocation,
        };
  return {
    ...where,
    ...(finding.expression === undefined ? {} : { expression: finding.expression }),
  };
}

function result(finding: Finding, ruleIndex: number): SarifResult {
  const related = (finding.relatedLocations ?? []).map((where, index): SarifLocation => ({
    id: index + 1,
    physicalLocation: physicalLocation(primaryLocation(where)),
    ...(where.message === undefined ? {} : { message: { text: where.message } }),
  }));
  return {
    ruleId: finding.ruleId,
    ruleIndex,
    level: sarifLevel(finding.severity),
    // The first sentence stays the summary viewers show; the detail lines follow, as in text.
    message: { text: [finding.message, ...findingDetailLines(finding)].join('\n') },
    locations: [{ physicalLocation: physicalLocation(primaryLocation(finding)) }],
    ...(related.length === 0 ? {} : { relatedLocations: related }),
    // The report's fingerprint has no line numbers. Setting primaryLocationLineHash stops
    // upload-sarif computing one from the source line, which changes whenever the line is edited.
    partialFingerprints: {
      primaryLocationLineHash: finding.fingerprint,
      [fingerprintKey]: finding.fingerprint,
    },
    properties: resultProperties(finding),
  };
}

// The base URI %SRCROOT% stands for; a base URI must end in /.
function directoryUri(directory: string): string {
  const href = pathToFileURL(directory).href;
  return href.endsWith('/') ? href : `${href}/`;
}

// One SARIF log with a trailing newline. rules are the run's resolved rules (lintWithRules); cwd is
// the working directory report paths are relative to.
export function formatSarifReport(
  report: CompletedReport,
  rules: readonly ResolvedRule[],
  cwd: string,
): string {
  const findings = [...report.findings].sort(compareFindings);
  const descriptors = ruleDescriptors(rules, findings);
  const ruleIndex = new Map(descriptors.map(({ id }, index) => [id, index]));
  const { tool, plugins, compat, selection } = report.run;
  const log: SarifLog = {
    $schema: sarifSchemaUri,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: { name: tool.name, version: tool.version, rules: descriptors },
          extensions: plugins.map(({ name, version }) => ({ name, version })),
        },
        invocations: [{ executionSuccessful: true }],
        originalUriBaseIds: { [srcRoot]: { uri: directoryUri(cwd) } },
        columnKind: 'utf16CodeUnits',
        results: findings.map((finding) => result(finding, ruleIndex.get(finding.ruleId) ?? 0)),
        properties: { selection, compat, summary: report.summary },
      },
    ],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
}
