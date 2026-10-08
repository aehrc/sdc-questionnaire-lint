import pkg from '../../package.json' with { type: 'json' };
import type { ExpressionSite } from '../analysis/expression-site.js';
import { findFhirPathSyntaxProblem, hasFhirPathText } from '../analysis/fhirpath.js';
import { hasQueryText } from '../analysis/x-fhir-query.js';
import { fragmentParseError } from '../rules/fragment-parse-error.js';
import { hasCataloguedLanguage, languageNotAllowed } from '../rules/language-not-allowed.js';
import {
  hasExpressionLanguage,
  languageNotInValueSet,
} from '../rules/language-not-in-value-set.js';
import { parseError } from '../rules/parse-error.js';
import { querySyntax } from '../rules/query-syntax.js';
import { staleSuppression } from '../rules/stale-suppression.js';
import { uncataloguedExpression } from '../rules/uncatalogued-expression.js';
import { unknownFunction } from '../rules/unknown-function.js';
import type { LintPlugin } from './contract.js';

// Core rules (core-plan §4.1). Rules are added as the analysis engine is built.
export const sdcPlugin: LintPlugin = {
  meta: { name: 'sdc', version: pkg.version },
  rules: {
    'fragment-parse-error': fragmentParseError,
    'language-not-allowed': languageNotAllowed,
    'language-not-in-value-set': languageNotInValueSet,
    'parse-error': parseError,
    'query-syntax': querySyntax,
    'uncatalogued-expression': uncataloguedExpression,
    'unknown-function': unknownFunction,
  },
};

// Where each built-in rule completes its check at an Expression site. Only there does the absence
// of its findings make a suppression stale (cli.md § Stale suppressions); a rule missing here, such
// as a plugin rule, leaves its suppressions not assessed.
export const completesCheck: Readonly<Record<string, (site: ExpressionSite) => boolean>> = {
  'sdc/fragment-parse-error': hasQueryText,
  'sdc/language-not-allowed': hasCataloguedLanguage,
  'sdc/language-not-in-value-set': hasExpressionLanguage,
  'sdc/parse-error': hasFhirPathText,
  'sdc/query-syntax': hasQueryText,
  'sdc/uncatalogued-expression': () => true,
  'sdc/unknown-function': (site) =>
    hasFhirPathText(site) && findFhirPathSyntaxProblem(site.text) === undefined,
};

export const staleSuppressionId = 'lint/stale-suppression';

// Holds lint/stale-suppression, whose findings come from the suppression assessment.
export const lintPlugin: LintPlugin = {
  meta: { name: 'lint', version: sdcPlugin.meta.version },
  rules: { 'stale-suppression': staleSuppression },
};
