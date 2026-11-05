/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import type { ExpressionSite } from './expression-site.js';

// The R4 code, and the R5 code that replaces it. Both are analysed as queries (D11).
export const X_FHIR_QUERY = 'application/x-fhir-query';
export const X_FHIR_QUERY_R5 = 'text/x-fhir-query';

// Whether a language is either query code. Exported to plugins.
export function isQueryLanguage(language: string | undefined): boolean {
  return language === X_FHIR_QUERY || language === X_FHIR_QUERY_R5;
}

// Whether the query checks apply to a site: an Expression whose language is either x-fhir-query
// code, with text. Its fragments are FHIRPath sites of their own.
export function hasQueryText(site: ExpressionSite): site is ExpressionSite & { text: string } {
  return site.carrier === 'expression' && isQueryLanguage(site.language) && site.text !== undefined;
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
