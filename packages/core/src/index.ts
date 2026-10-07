// Public library API.
export { lint } from './lint.js';
export type { LintOptions } from './lint.js';
export { LintFailure } from './failure.js';
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
export { defineConfig } from './config/types.js';
export type { LintConfig, RuleSetting, SuppressionEntry } from './config/types.js';
export type {
  CataloguedLocation,
  ExpressionCarrier,
  ExpressionSite,
  ExpressionUseCase,
  LintPlugin,
  LintRule,
  LocalResource,
  QueryFragment,
  QuestionnaireDocument,
  RuleContext,
  RuleDocs,
  RuleFinding,
  Scope,
  SiteItem,
} from './plugins/types.js';
