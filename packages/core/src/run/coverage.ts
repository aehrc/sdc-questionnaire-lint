import { hasFhirPathText } from '../analysis/fhirpath.js';
import type { ExpressionSite } from '../plugins/types.js';
import type { Summary } from '../report/types.js';

// Coverage counts (report-format.md § Run metadata and summary), decided by core analysis alone.
// A registered FHIRPath site with text is analysed: its syntax check always completes, even when
// it finds an error or sdc/parse-error is off. Every other site has no supported analysis yet, and
// an unregistered site's scope is never analysed, so those are unchecked.
export function countExpressions(sites: readonly ExpressionSite[]): Summary['expressions'] {
  const analysed = sites.filter((site) => site.registered && hasFhirPathText(site)).length;
  return { analysed, unchecked: sites.length - analysed };
}
