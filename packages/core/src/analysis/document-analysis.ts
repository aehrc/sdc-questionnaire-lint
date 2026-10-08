import { type Declaration, findDeclarations } from './declarations.js';
import type { ExpressionSite, QuestionnaireDocument } from './expression-site.js';

// The facts core computes once per document and shares between its rules and the suppression
// assessment (core-rules.md, Shared analysis). Internal: plugin rules never receive it (D15).
export interface DocumentAnalysis {
  readonly declarations: readonly Declaration[];
}

export function analyseDocument(
  document: QuestionnaireDocument,
  sites: readonly ExpressionSite[],
): DocumentAnalysis {
  return { declarations: findDeclarations(document, sites) };
}
