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
  SourceLocation,
  SourceMapResult,
  SourceTarget,
  Suggestion,
  Summary,
} from './report/types.js';
export type { FailureCode } from './failure.js';
export { defineConfig } from './config/types.js';
export type { LintConfig, RuleSetting, SuppressionEntry } from './config/types.js';
// Language lookups for plugin rules (API stage A, docs/architecture.md § What a plugin can import).
export { definedLanguages, languagesAllowedAt } from './analysis/extension-catalog.js';
export { isQueryLanguage } from './analysis/x-fhir-query.js';
export type {
  CataloguedLocation,
  ExpressionCarrier,
  ExpressionSite,
  ExpressionUseCase,
  LocalResource,
  QueryFragment,
  QuestionnaireDocument,
  SiteItem,
} from './analysis/expression-site.js';
// Core's name analysis for plugin rules (API stages B, B2, C and D, docs/architecture.md § What a
// plugin can import).
export { definerOf } from './analysis/available-variables.js';
export type {
  AvailableVariables,
  BuiltinDefiner,
  Variable,
} from './analysis/available-variables.js';
export type { Declaration, DeclarationKind } from './analysis/declarations.js';
export type { Dependencies } from './analysis/dependencies.js';
export type { VariableReference } from './analysis/fhirpath.js';
export type { DeclarationUse } from './analysis/uses.js';
export type {
  HostVariablesInput,
  LintPlugin,
  LintRule,
  PluginCompat,
  RuleContext,
  RuleDocs,
  RuleFinding,
  RuleRelatedLocation,
} from './plugins/contract.js';
