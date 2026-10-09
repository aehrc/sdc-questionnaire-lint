import { type AvailableVariables, availableVariables } from './available-variables.js';
import { type Declaration, findAssembleContextNames, findDeclarations } from './declarations.js';
import { type Dependencies, findDependencies } from './dependencies.js';
import type { ExpressionSite, QuestionnaireDocument } from './expression-site.js';
import {
  findVariableReferences,
  hasFhirPathText,
  type LinkIdReferences,
  type VariableReference,
} from './fhirpath.js';
import { findLinkIdReferencesAt, findLinkIds } from './linkids.js';
import { type DeclarationUse, findUses } from './uses.js';

// The facts core computes once per document and shares between its rules and the suppression
// assessment (core-rules.md, Shared analysis). Internal: plugin rules never receive it (D15).
export interface DocumentAnalysis {
  readonly declarations: readonly Declaration[];
  // The %name references of each FHIRPath site that parses, fragments included; a site that does
  // not parse has none (D18).
  readonly references: ReadonlyMap<ExpressionSite, readonly VariableReference[]>;
  // The names each expression can reference at its site; undefined at an uncatalogued site, where
  // name analysis cannot run.
  variablesAt(site: ExpressionSite): AvailableVariables | undefined;
  // What the expression of each declaration references.
  readonly dependencies: ReadonlyMap<Declaration, Dependencies>;
  // Whether the expressions of others reference each declaration.
  readonly uses: ReadonlyMap<Declaration, DeclarationUse>;
  // The linkIds of the Questionnaire's items, at any depth.
  readonly linkIds: ReadonlySet<string>;
  // The linkId references of each FHIRPath site that parses.
  readonly linkIdReferences: ReadonlyMap<ExpressionSite, LinkIdReferences>;
}

export function analyseDocument(
  document: QuestionnaireDocument,
  sites: readonly ExpressionSite[],
  // The configured hostVariables (D1).
  hostVariables: readonly string[] = [],
): DocumentAnalysis {
  const references = new Map<ExpressionSite, readonly VariableReference[]>();
  for (const site of sites) {
    const found = hasFhirPathText(site) ? findVariableReferences(site.text) : undefined;
    if (found !== undefined) references.set(site, found);
  }
  const declarations = findDeclarations(document, sites);
  const variablesAt = availableVariables(
    declarations,
    findAssembleContextNames(document),
    hostVariables,
  );
  return {
    declarations,
    references,
    variablesAt,
    dependencies: findDependencies(declarations, sites, references, variablesAt),
    uses: findUses(document, declarations, sites, references, variablesAt),
    linkIds: findLinkIds(document),
    linkIdReferences: findLinkIdReferencesAt(document, sites),
  };
}
