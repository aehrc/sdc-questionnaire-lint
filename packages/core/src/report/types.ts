// The version 1 JSON report (docs/report-format.md). Field names follow
// docs/schemas/lint-report.schema.json exactly; the schema is the source of truth.
import type { FailureCode } from '../failure.js';

export type Severity = 'error' | 'warning' | 'info';

// Lines and columns are one-based; columns count UTF-16 code units; ends are exclusive.
export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

// Zero-based UTF-16 offsets into a decoded string; the end is exclusive.
export interface OffsetRange {
  startOffset: number;
  endOffset: number;
}

// core-plan §7.2. An unmapped result carries no coordinates.
export type SourceMapResult =
  | { status: 'mapped'; confidence: 'exact' | 'anchored'; location: SourceLocation }
  | { status: 'unmapped'; reason: 'ambiguous' | 'multiline' | 'not-found' | 'source-unavailable' };

export interface ResourceIdentity {
  resourceType: string;
  id?: string;
  // "" for a standalone root, /entry/N/resource in a Bundle, or a contained-resource pointer.
  pointer: string;
}

export interface JsonLocation {
  file: string;
  pointer: string;
  resource: ResourceIdentity;
  linkId?: string;
}

export interface ConfigLocation {
  file: string;
  pointer: string;
}

export interface QuestionnaireLocation {
  kind: 'questionnaire';
  jsonLocation: JsonLocation;
  sourceLocation: SourceMapResult;
}

export interface ConfigurationLocation {
  kind: 'config';
  configLocation: ConfigLocation;
}

export type RelatedLocation = (QuestionnaireLocation | ConfigurationLocation) & {
  message?: string;
};

// text is the complete decoded expression or query at the finding's pointer.
export interface ExpressionExcerpt {
  text: string;
  range?: OffsetRange;
}

export type SourceTarget = SourceLocation & { kind: 'source' };

export interface JsonStringTarget extends OffsetRange {
  kind: 'json-string';
  file: string;
  pointer: string;
}

export interface Edit {
  target: SourceTarget | JsonStringTarget;
  oldText: string;
  replacement: string;
}

export interface Suggestion {
  description: string;
  applicability: 'machine-applicable' | 'maybe-incorrect' | 'has-placeholders';
  edits: [Edit, ...Edit[]];
}

interface FindingFields {
  ruleId: string;
  severity: Severity;
  message: string;
  help?: string;
  note?: string;
  docsUrl?: string;
  fingerprint: string;
  expression?: ExpressionExcerpt;
  relatedLocations?: RelatedLocation[];
  suggestions?: Suggestion[];
}

export type QuestionnaireFinding = FindingFields & QuestionnaireLocation;

// Only the reserved lint namespace reports against the configuration.
export type ConfigFinding = FindingFields & ConfigurationLocation & { ruleId: `lint/${string}` };

export type Finding = QuestionnaireFinding | ConfigFinding;

export interface PackageVersion {
  name: string;
  version: string;
}

// A type alias rather than an interface, so it satisfies RunCompat's index signature.
export type SmartFormsVersions = {
  renderer: string;
  populate: string;
  'template-extract': string;
};

export interface RunCompat {
  'smart-forms'?: SmartFormsVersions;
  [namespace: string]: Record<string, string>;
}

export type RunKind = 'full' | 'targeted';

export interface RunMetadata {
  tool: { name: 'sdc-questionnaire-lint'; version: string };
  plugins: PackageVersion[];
  compat: RunCompat;
  selection: RunKind;
}

export interface Summary {
  files: { read: number; skipped: number };
  questionnaires: number;
  expressions: { analysed: number; unchecked: number };
  errors: number;
  warnings: number;
  info: number;
  suppressedFindings: number;
  suppressions: { applied: number; stale: number; notAssessed: number };
  config: string | null;
  fshSources: string[];
  fshSourceLookup: 'enabled' | 'omitted';
}

export interface CompletedReport {
  schemaVersion: 1;
  status: 'completed';
  run: RunMetadata;
  findings: Finding[];
  summary: Summary;
}

export interface FailureRecord {
  code: FailureCode;
  message: string;
  help: string;
  path?: string;
  ruleId?: string;
}

export interface FailedReport {
  schemaVersion: 1;
  status: 'failed';
  failure: FailureRecord;
}

export type Report = CompletedReport | FailedReport;
