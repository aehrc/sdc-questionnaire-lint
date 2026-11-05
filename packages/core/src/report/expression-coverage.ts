/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import type { ExpressionSite } from '../analysis/expression-site.js';
import { FHIRPATH } from '../analysis/fhirpath.js';
import { isQueryLanguage } from '../analysis/x-fhir-query.js';
import type { Summary } from './types.js';

// Approximates report-format.md § Run metadata and summary. A catalogued site with text is
// analysed when its language has an analysis. FHIRPath, a fragment included, gets the syntax
// check, which always completes, and the function check, which either runs or is prevented by an
// established syntax error. An x-fhir-query gets its shape check, counted apart from its
// fragments. Uncatalogued sites lack name analysis, and other languages have no analysis.
// incomplete holds the sites where an enabled check applies but could not complete
// (incompleteSites in plugins/builtin.ts).
export function summarizeExpressionCoverage(
  sites: readonly ExpressionSite[],
  incomplete: ReadonlySet<ExpressionSite> = new Set(),
): Summary['expressions'] {
  const analysed = sites.filter(
    (site) =>
      site.catalogued &&
      !incomplete.has(site) &&
      site.text !== undefined &&
      (site.language === FHIRPATH || isQueryLanguage(site.language)),
  ).length;
  return { analysed, unchecked: sites.length - analysed };
}
