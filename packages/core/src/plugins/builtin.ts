/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import pkg from '../../package.json' with { type: 'json' };
import type { DocumentAnalysis } from '../analysis/document-analysis.js';
import type { ExpressionSite } from '../analysis/expression-site.js';
import { findFhirPathSyntaxProblem, hasFhirPathText } from '../analysis/fhirpath.js';
import { hasQueryText } from '../analysis/x-fhir-query.js';
import type { AnalysedDocument } from '../inputs/read.js';
import {
  completesCycleCheck,
  dependencyCycle,
  leavesCycleCheckIncomplete,
} from '../rules/dependency-cycle.js';
import { duplicateDeclaration } from '../rules/duplicate-declaration.js';
import { externalExpression } from '../rules/external-expression.js';
import { fragmentParseError } from '../rules/fragment-parse-error.js';
import { hasCataloguedLanguage, languageNotAllowed } from '../rules/language-not-allowed.js';
import {
  hasExpressionLanguage,
  languageNotInValueSet,
} from '../rules/language-not-in-value-set.js';
import { parseError } from '../rules/parse-error.js';
import { querySyntax } from '../rules/query-syntax.js';
import { reservedName } from '../rules/reserved-name.js';
import { shadowedDeclaration } from '../rules/shadowed-declaration.js';
import { staleSuppression } from '../rules/stale-suppression.js';
import { uncataloguedExpression } from '../rules/uncatalogued-expression.js';
import { resolvesNamesAt, undefinedVariable } from '../rules/undefined-variable.js';
import { unknownFunction } from '../rules/unknown-function.js';
import {
  completesLinkIdCheck,
  leavesLinkIdCheckIncomplete,
  unresolvedLinkId,
} from '../rules/unresolved-linkid.js';
import {
  completesUnusedCheck,
  leavesUnusedCheckIncomplete,
  unusedDeclaration,
} from '../rules/unused-declaration.js';
import type { LintPlugin, LintRule } from './contract.js';
import type { ResolvedRule } from './rule-set.js';

// Core rules (core-plan §4.1). Rules are added as the analysis engine is built. A CoreRule is
// listed as a LintRule: the runner gives every sdc rule the analysis as a second argument.
export const sdcPlugin: LintPlugin = {
  meta: { name: 'sdc', version: pkg.version },
  rules: {
    'dependency-cycle': dependencyCycle as unknown as LintRule,
    'duplicate-declaration': duplicateDeclaration as unknown as LintRule,
    'external-expression': externalExpression,
    'fragment-parse-error': fragmentParseError,
    'language-not-allowed': languageNotAllowed,
    'language-not-in-value-set': languageNotInValueSet,
    'parse-error': parseError,
    'query-syntax': querySyntax,
    'reserved-name': reservedName as unknown as LintRule,
    'shadowed-declaration': shadowedDeclaration as unknown as LintRule,
    'uncatalogued-expression': uncataloguedExpression,
    'undefined-variable': undefinedVariable as unknown as LintRule,
    'unknown-function': unknownFunction,
    'unresolved-linkid': unresolvedLinkId as unknown as LintRule,
    'unused-declaration': unusedDeclaration as unknown as LintRule,
  },
};

// Where each built-in rule completes its check at an Expression site. Only there does the absence
// of its findings make a suppression stale (cli.md § Stale suppressions); a rule missing here, such
// as a plugin rule, leaves its suppressions not assessed.
export const completesCheck: Readonly<
  Record<string, (site: ExpressionSite, analysis: DocumentAnalysis) => boolean>
> = {
  'sdc/dependency-cycle': completesCycleCheck,
  'sdc/duplicate-declaration': () => true,
  'sdc/external-expression': () => true,
  'sdc/fragment-parse-error': hasQueryText,
  'sdc/language-not-allowed': hasCataloguedLanguage,
  'sdc/language-not-in-value-set': hasExpressionLanguage,
  'sdc/parse-error': hasFhirPathText,
  'sdc/query-syntax': hasQueryText,
  'sdc/reserved-name': () => true,
  'sdc/shadowed-declaration': () => true,
  'sdc/uncatalogued-expression': () => true,
  'sdc/undefined-variable': resolvesNamesAt,
  'sdc/unknown-function': (site) =>
    hasFhirPathText(site) && findFhirPathSyntaxProblem(site.text) === undefined,
  'sdc/unresolved-linkid': completesLinkIdCheck,
  'sdc/unused-declaration': completesUnusedCheck,
};

// Where a built-in rule applies to a site but cannot complete its check there, which makes the site
// unchecked (report-format.md § Run metadata and summary). A syntax error that prevents a check is
// an established invalid expression, not a limitation, so it is not one of these.
const leavesUnchecked: Readonly<
  Record<string, (site: ExpressionSite, analysis: DocumentAnalysis) => boolean>
> = {
  'sdc/dependency-cycle': leavesCycleCheckIncomplete,
  'sdc/undefined-variable': (site, analysis) =>
    analysis.references.has(site) && !resolvesNamesAt(site, analysis),
  'sdc/unresolved-linkid': leavesLinkIdCheckIncomplete,
  'sdc/unused-declaration': leavesUnusedCheckIncomplete,
};

// The sites of documents where an enabled rule could not complete its check; a rule that is off
// does not reduce coverage.
export function incompleteSites(
  documents: readonly AnalysedDocument[],
  rules: readonly ResolvedRule[],
): Set<ExpressionSite> {
  const checks = rules.flatMap(({ id, setting }) => {
    const check = leavesUnchecked[id];
    return setting === 'off' || check === undefined ? [] : [check];
  });
  return new Set(
    documents.flatMap(({ sites, analysis }) =>
      sites.filter((site) => checks.some((check) => check(site, analysis))),
    ),
  );
}

// The built-in rules that complete their check at every launchContext and extractAllocateId, which
// have no Expression site (core-rules.md D22). They reference nothing, so they are in no dependency
// cycle, and they are not variables, so they are never reported as unused (D4).
export const completesDeclarationCheck: ReadonlySet<string> = new Set([
  'sdc/dependency-cycle',
  'sdc/duplicate-declaration',
  'sdc/reserved-name',
  'sdc/shadowed-declaration',
  'sdc/unused-declaration',
]);

export const staleSuppressionId = 'lint/stale-suppression';

// Holds lint/stale-suppression, whose findings come from the suppression assessment.
export const lintPlugin: LintPlugin = {
  meta: { name: 'lint', version: sdcPlugin.meta.version },
  rules: { 'stale-suppression': staleSuppression },
};
