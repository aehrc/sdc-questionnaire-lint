/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import type {
  CataloguedLocation,
  ExpressionCarrier,
  ExpressionUseCase,
} from './expression-site.js';
import { FHIRPATH } from './fhirpath.js';
import { X_FHIR_QUERY, X_FHIR_QUERY_R5 } from './x-fhir-query.js';

// The catalog of SDC extensions the linter understands: the kinds of location an expression may
// sit in, not the expressions of any one Questionnaire (core-plan §3.1 calls it the registry).
// Supporting another location is a new entry here, not new code in expression-sites.ts.

// The element an extension sits on: the Questionnaire root or an item.
export type Owner = 'root' | 'item';

export interface CatalogEntry {
  url: string;
  // For a complex extension, the url of the sub-extension holding the valueExpression.
  subExtension?: string;
  // Where the extension may sit. For an extension on primitive elements, the element names per
  // owner whose _element companion carries it (_text carries it for text); otherwise the owners
  // whose own extension array carries it.
  on: Readonly<Partial<Record<Owner, readonly string[] | true>>>;
  carrier: ExpressionCarrier;
  // The SDC expressions table's use cases: behavior is rendering, population is population, all
  // is both, and the $extract extensions are extraction (core-rules.md D20).
  useCases: readonly ExpressionUseCase[];
  // The languages SDC allows at the location; absent when it allows any language.
  languages?: readonly string[];
}

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';

function entry(
  url: string,
  on: CatalogEntry['on'],
  useCases: readonly ExpressionUseCase[],
  extra: Partial<Pick<CatalogEntry, 'subExtension' | 'languages'>> = {},
): CatalogEntry {
  return Object.freeze({
    url,
    on: Object.freeze(on),
    carrier: 'expression',
    useCases: Object.freeze(useCases),
    ...extra,
  });
}

const both = { root: true, item: true } as const;
const renderingAndPopulation: readonly ExpressionUseCase[] = ['rendering', 'population'];
const item = { item: true } as const;

// FHIRPath or CQL, as the SDC expressions table restricts two locations. The newer CQL codes are
// accepted too, until the table's older CQL shorthand is reconciled with STU4 (core-rules.md, Open
// items).
const fhirPathOrCql = Object.freeze([
  'text/fhirpath',
  'text/cql',
  'text/cql-identifier',
  'text/cql-expression',
]);

export const extensionCatalog: readonly CatalogEntry[] = Object.freeze([
  entry('http://hl7.org/fhir/StructureDefinition/variable', both, renderingAndPopulation),
  entry(`${sdc}calculatedExpression`, item, ['rendering']),
  entry(`${sdc}enableWhenExpression`, item, ['rendering'], { languages: fhirPathOrCql }),
  entry(`${sdc}initialExpression`, item, renderingAndPopulation),
  entry(`${sdc}candidateExpression`, item, ['population']),
  entry(`${sdc}answerExpression`, item, ['population']),
  entry(`${sdc}contextExpression`, item, ['population'], { subExtension: 'expression' }),
  entry(`${sdc}itemPopulationContext`, both, ['population']),
  entry(`${sdc}itemExtractionContext`, both, ['extraction']),
  entry(`${sdc}answerOptionsToggleExpression`, item, ['rendering'], {
    subExtension: 'expression',
    languages: fhirPathOrCql,
  }),
  entry('http://hl7.org/fhir/StructureDefinition/targetConstraint', both, ['rendering'], {
    subExtension: 'expression',
  }),
  // Dynamic values of primitive elements: the elements core-plan §4.3 names, plus the title. Not in
  // the SDC expressions table, so it keeps rendering.
  entry(
    'http://hl7.org/fhir/StructureDefinition/cqf-expression',
    { root: ['title'], item: ['text', 'prefix', 'answerValueSet'] },
    ['rendering'],
  ),
]);

// The expression languages FHIR R4 and R5 define. A Questionnaire does not state its FHIR
// version, so both sets are accepted (D11). Exported to plugins: a language outside these codes is
// sdc/language-not-in-value-set's to report.
export const definedLanguages: readonly string[] = Object.freeze([
  'text/cql',
  FHIRPATH,
  X_FHIR_QUERY,
  X_FHIR_QUERY_R5,
  'text/cql-identifier',
  'text/cql-expression',
]);

// The languages SDC allows at a catalogued location; undefined when it allows any language.
// Exported to plugins: a language outside the list is sdc/language-not-allowed's to report, or the
// FHIR Validator's (sdc-inv1, application/x-fhir-query on enableWhenExpression), which the list
// also rejects.
export function languagesAllowedAt(location: CataloguedLocation): readonly string[] | undefined {
  return extensionCatalog.find((entry) => entry.url === location.url)?.languages;
}
