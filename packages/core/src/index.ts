// Public library API.
export { defineConfig } from './config/types.js';
export type { LintConfig, RuleSetting, SuppressionEntry } from './config/types.js';
export type {
  ExpressionSite,
  ExpressionUseCase,
  LintPlugin,
  LintRule,
  QuestionnaireDocument,
  RuleContext,
  RuleFinding,
  Scope,
} from './plugins/types.js';
export type {
  CompletedReport,
  ConfigFinding,
  ConfigLocation,
  ConfigurationLocation,
  Edit,
  ExpressionExcerpt,
  FailedReport,
  FailureRecord,
  Finding,
  JsonLocation,
  JsonStringTarget,
  OffsetRange,
  PackageVersion,
  QuestionnaireFinding,
  QuestionnaireLocation,
  RelatedLocation,
  Report,
  ResourceIdentity,
  RunCompat,
  RunMetadata,
  Severity,
  SmartFormsVersions,
  SourceLocation,
  SourceMapResult,
  SourceTarget,
  Suggestion,
  Summary,
} from './report/types.js';
export type { FailureCode } from './failure.js';
