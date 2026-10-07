import type { ExpressionCarrier, ExpressionUseCase } from './expression-site.js';

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
  // Whether the location declares a name others can reference; other Expression names are
  // recorded on the site without declaring.
  declares: boolean;
  useCases: readonly ExpressionUseCase[];
}

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';

function entry(
  url: string,
  on: CatalogEntry['on'],
  useCases: readonly ExpressionUseCase[],
  extra: Partial<Pick<CatalogEntry, 'subExtension' | 'declares'>> = {},
): CatalogEntry {
  return Object.freeze({
    url,
    on: Object.freeze(on),
    carrier: 'expression',
    declares: false,
    useCases: Object.freeze(useCases),
    ...extra,
  });
}

const both = { root: true, item: true } as const;
const item = { item: true } as const;

export const extensionCatalog: readonly CatalogEntry[] = Object.freeze([
  entry(
    'http://hl7.org/fhir/StructureDefinition/variable',
    both,
    ['rendering', 'population', 'extraction'],
    { declares: true },
  ),
  entry(`${sdc}calculatedExpression`, item, ['rendering']),
  entry(`${sdc}enableWhenExpression`, item, ['rendering']),
  entry(`${sdc}initialExpression`, item, ['population']),
  entry(`${sdc}candidateExpression`, item, ['rendering']),
  entry(`${sdc}answerExpression`, item, ['rendering']),
  entry(`${sdc}contextExpression`, item, ['rendering']),
  entry(`${sdc}itemPopulationContext`, both, ['population'], { declares: true }),
  entry(`${sdc}itemExtractionContext`, both, ['extraction']),
  entry(`${sdc}answerOptionsToggleExpression`, item, ['rendering'], {
    subExtension: 'expression',
  }),
  entry('http://hl7.org/fhir/StructureDefinition/targetConstraint', both, ['rendering'], {
    subExtension: 'expression',
  }),
  // Dynamic values of primitive elements: the elements core-plan §4.3 names, plus the title.
  entry(
    'http://hl7.org/fhir/StructureDefinition/cqf-expression',
    { root: ['title'], item: ['text', 'prefix', 'answerValueSet'] },
    ['rendering'],
  ),
]);
