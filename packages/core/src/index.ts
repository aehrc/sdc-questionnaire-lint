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
  LocalResource,
  QueryFragment,
  QuestionnaireDocument,
  Scope,
  SiteItem,
} from './analysis/expression-site.js';
export type {
  LintPlugin,
  LintRule,
  PluginCompat,
  RuleContext,
  RuleDocs,
  RuleFinding,
  RuleRelatedLocation,
} from './plugins/contract.js';
