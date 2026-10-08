import { type Declaration, findDeclarations } from './declarations.js';
import type { ExpressionSite, QuestionnaireDocument } from './expression-site.js';
import { findVariableReferences, hasFhirPathText, type VariableReference } from './fhirpath.js';

// The facts core computes once per document and shares between its rules and the suppression
// assessment (core-rules.md, Shared analysis). Internal: plugin rules never receive it (D15).
export interface DocumentAnalysis {
  readonly declarations: readonly Declaration[];
  // The %name references of each FHIRPath site that parses, fragments included; a site that does
  // not parse has none (D18).
  readonly references: ReadonlyMap<ExpressionSite, readonly VariableReference[]>;
}

export function analyseDocument(
  document: QuestionnaireDocument,
  sites: readonly ExpressionSite[],
): DocumentAnalysis {
  const references = new Map<ExpressionSite, readonly VariableReference[]>();
  for (const site of sites) {
    const found = hasFhirPathText(site) ? findVariableReferences(site.text) : undefined;
    if (found !== undefined) references.set(site, found);
  }
  return { declarations: findDeclarations(document, sites), references };
}
