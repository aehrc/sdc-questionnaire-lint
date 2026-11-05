/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { type AvailableVariables, availableVariables } from './available-variables.js';
import { type Declaration, findAssembleContextNames, findDeclarations } from './declarations.js';
import { type Dependencies, findDependencies } from './dependencies.js';
import type { ExpressionSite, QuestionnaireDocument } from './expression-site.js';
import {
  findVariableReferences,
  hasFhirPathText,
  type LinkIdReferences,
  readsInput,
  type VariableReference,
} from './fhirpath.js';
import { findLinkIdReferencesAt, findLinkIds } from './linkids.js';
import { type DeclarationUse, findUses } from './uses.js';

// The facts core computes once per document and shares between its rules and the suppression
// assessment (core-rules.md, Shared analysis). Internal: a plugin rule receives only references,
// variablesAt, declarations, dependencies, uses and readsInput, through RuleContext's referencesAt,
// variablesAt (API stage B), declarations (stage B2), dependenciesOf, useOf and readsInput (stage
// C). Everything a rule can reach is frozen, because rules run before the suppression assessment
// reuses it.
export interface DocumentAnalysis {
  // In document order. RuleContext's declarations is this array.
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
  // Whether a FHIRPath site's expression reads its input other than its linkId; undefined at a site
  // with no references, because it is not FHIRPath with text that parses. Found on first use.
  readsInput(site: ExpressionSite): boolean | undefined;
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
    if (found !== undefined)
      references.set(site, Object.freeze(found.map((reference) => Object.freeze(reference))));
  }
  const declarations = Object.freeze(findDeclarations(document, sites));
  const inputReads = new Map<ExpressionSite, boolean | undefined>();
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
    readsInput: (site) => {
      if (!references.has(site) || !hasFhirPathText(site)) return undefined;
      if (!inputReads.has(site)) inputReads.set(site, readsInput(site.text));
      return inputReads.get(site);
    },
  };
}
