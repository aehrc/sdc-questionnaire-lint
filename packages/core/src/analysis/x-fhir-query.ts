import type { ExpressionSite } from '../plugins/types.js';

export const X_FHIR_QUERY = 'application/x-fhir-query';

// Whether the query checks apply to a site: an Expression whose language is exactly
// x-fhir-query, with text. Its fragments are FHIRPath sites of their own.
export function hasQueryText(site: ExpressionSite): site is ExpressionSite & { text: string } {
  return site.carrier === 'expression' && site.language === X_FHIR_QUERY && site.text !== undefined;
}

// Where the {{…}} fragments of an x-fhir-query are.
export interface QueryFragmentScan {
  // The closed fragments, in order: zero-based UTF-16 offsets of the text between the braces.
  fragments: { startOffset: number; endOffset: number }[];
  // The offset of the first {{ with no }} after it; the scan stops there.
  unclosedAt?: number;
}

// Each {{ ends at the next }}, so a }} inside the fragment's FHIRPath, even in a string, ends it
// early.
export function scanQueryFragments(text: string): QueryFragmentScan {
  const fragments: QueryFragmentScan['fragments'] = [];
  let open = text.indexOf('{{');
  while (open !== -1) {
    const close = text.indexOf('}}', open + 2);
    if (close === -1) return { fragments, unclosedAt: open };
    fragments.push({ startOffset: open + 2, endOffset: close });
    open = text.indexOf('{{', close + 2);
  }
  return { fragments };
}

// How a FHIR search may start, leniently: a fragment; ?, $ or _ for a system-level search or
// operation; an absolute URL; or a resource-type-shaped name followed by the end, /, ? or a
// fragment. Search parameters and resource type names are not validated.
const searchShape = /^(?:\{\{|[?$_]|https?:\/\/|[A-Z][A-Za-z]*(?:$|[/?]|\{\{))/;

// What is wrong with the shape of a query, or undefined when it has an accepted shape. An unclosed
// {{ is reported before the shape.
export function findQueryShapeProblem(text: string): 'unclosed' | 'not-a-search' | undefined {
  if (scanQueryFragments(text).unclosedAt !== undefined) return 'unclosed';
  return searchShape.test(text) ? undefined : 'not-a-search';
}
