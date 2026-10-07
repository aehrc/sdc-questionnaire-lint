import { FHIRPATH } from '../analysis/fhirpath.js';
import { X_FHIR_QUERY } from '../analysis/x-fhir-query.js';
import type { ExpressionSite } from '../plugins/types.js';
import type { Summary } from './types.js';

// Approximates report-format.md § Run metadata and summary. A catalogued site with text is
// analysed when its language has an analysis. FHIRPath, a fragment included, gets the syntax
// check, which always completes, and the function check, which either runs or is prevented by an
// established syntax error. An x-fhir-query gets its shape check, counted apart from its
// fragments. Uncatalogued sites still lack scope analysis, and other languages have no analysis.
export function summarizeExpressionCoverage(
  sites: readonly ExpressionSite[],
): Summary['expressions'] {
  const analysed = sites.filter(
    (site) =>
      site.catalogued &&
      site.text !== undefined &&
      (site.language === FHIRPATH || site.language === X_FHIR_QUERY),
  ).length;
  return { analysed, unchecked: sites.length - analysed };
}
