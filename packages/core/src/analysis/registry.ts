import type { ExpressionCarrier, ExpressionUseCase } from '../plugins/types.js';
import { FHIRPATH } from './fhirpath.js';

// The registry of SDC locations the linter understands (core-plan §3.1). Supporting another
// location is a new entry here, not walker code.

const CQL = 'text/cql';
const QUERY = 'application/x-fhir-query';

// The element an extension sits on: the Questionnaire root or an item.
export type Owner = 'root' | 'item';

export interface RegistryEntry {
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
  // Recorded for sdc/language-not-allowed, which does not exist yet.
  languages: readonly string[];
  useCases: readonly ExpressionUseCase[];
}

const sdc = 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-';

function entry(
  url: string,
  on: RegistryEntry['on'],
  languages: readonly string[],
  useCases: readonly ExpressionUseCase[],
  extra: Partial<Pick<RegistryEntry, 'subExtension' | 'declares'>> = {},
): RegistryEntry {
  return Object.freeze({
    url,
    on: Object.freeze(on),
    carrier: 'expression',
    declares: false,
    languages: Object.freeze(languages),
    useCases: Object.freeze(useCases),
    ...extra,
  });
}

const both = { root: true, item: true } as const;
const item = { item: true } as const;

export const registry: readonly RegistryEntry[] = Object.freeze([
  entry(
    'http://hl7.org/fhir/StructureDefinition/variable',
    both,
    [FHIRPATH, CQL, QUERY],
    ['rendering', 'population', 'extraction'],
    { declares: true },
  ),
  entry(`${sdc}calculatedExpression`, item, [FHIRPATH, CQL], ['rendering']),
  entry(`${sdc}enableWhenExpression`, item, [FHIRPATH, CQL], ['rendering']),
  entry(`${sdc}initialExpression`, item, [FHIRPATH, CQL], ['population']),
  entry(`${sdc}candidateExpression`, item, [FHIRPATH, CQL, QUERY], ['rendering']),
  entry(`${sdc}answerExpression`, item, [FHIRPATH, CQL, QUERY], ['rendering']),
  entry(`${sdc}contextExpression`, item, [FHIRPATH, CQL, QUERY], ['rendering']),
  entry(`${sdc}itemPopulationContext`, both, [FHIRPATH, CQL, QUERY], ['population'], {
    declares: true,
  }),
  entry(`${sdc}itemExtractionContext`, both, [FHIRPATH, CQL, QUERY], ['extraction']),
  entry(`${sdc}answerOptionsToggleExpression`, item, [FHIRPATH, CQL], ['rendering'], {
    subExtension: 'expression',
  }),
  entry(
    'http://hl7.org/fhir/StructureDefinition/targetConstraint',
    both,
    [FHIRPATH, CQL],
    ['rendering'],
    { subExtension: 'expression' },
  ),
  // Dynamic values of primitive elements: the elements core-plan §4.3 names, plus the title.
  entry(
    'http://hl7.org/fhir/StructureDefinition/cqf-expression',
    { root: ['title'], item: ['text', 'prefix', 'answerValueSet'] },
    [FHIRPATH, CQL, QUERY],
    ['rendering'],
  ),
]);
