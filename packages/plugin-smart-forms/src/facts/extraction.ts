import {
  type Evidence,
  extractContexts,
  extractTemplates,
  type Reported,
  reported,
  reproduced,
} from './evidence.js';

// How template-extract reads templates and their templateExtractContexts. Template extraction is
// checked only when compat selects template-extract (S3), so these facts are keyed by its version
// alone, outside the renderer and populate FactTable. Cited at template-extract's release commit
// 0fca4c36 (S11) in docs/smart-forms-rules.md, Template extraction.
// - context-read-only-from-value-string: a templateExtractContext is read only from a truthy
//   valueString, which wins when a valueExpression is present too. Otherwise extraction warns
//   "Template <id>: TemplateExtractContext extension found on <path> but no valueString found.",
//   goes on, evaluates the values below against the response item of the item that references the
//   template, without repeating for each result of the context, and leaves the extension in the
//   output (walkTemplate.ts:89-111, removeTemplateArtifacts.ts:29-35).
// - first-context-only: only the first templateExtractContext of an extension array is read; a
//   later one is never read, whatever its value (walkTemplate.ts:90).
// - template-selection: a template is a top-level contained resource, the last with its id, that
//   the first #id template slice of a templateExtract references, keyed by its owner: the root
//   under QuestionnaireLevel, then each item under its linkId, a later owner of a key replacing the
//   earlier's references. Each id maps to its last key, which must be the linkId of an item, so a
//   template referenced only from the root is never extracted, and a #id matching nothing is
//   ignored, without a warning (templateExtractRef.ts:131-186,228-240, templateMap.ts:43-110,
//   misc.ts:15-32).
// - no-context-name: no context binds a name, not even the name of the valueExpression of a context
//   read from valueString; the only names are %resource, %rootResource and the extractAllocateId
//   names (createFhirPathContext.ts:10-19).
// - template-extract-bundle-unread: nothing reads templateExtractBundle; a form with only it is
//   not extracted.
export type ExtractionBehaviour =
  | 'context-read-only-from-value-string'
  | 'first-context-only'
  | 'template-selection'
  | 'no-context-name'
  | 'template-extract-bundle-unread';

export interface ExtractionFact extends Reported {
  readonly behaviour: ExtractionBehaviour;
  readonly evidence: readonly Evidence[];
}

// The aehrc/smart-forms issues that report a behaviour.
const upstream: Readonly<Partial<Record<ExtractionBehaviour, readonly number[]>>> = {
  'context-read-only-from-value-string': [2172],
  'template-selection': [2169],
  'no-context-name': [2172],
};

function fact(behaviour: ExtractionBehaviour, ...evidence: Evidence[]): ExtractionFact {
  return reported<ExtractionFact>(
    Object.freeze({ behaviour, evidence: Object.freeze(evidence) }),
    upstream[behaviour],
  );
}

const contexts = (name: string): Evidence =>
  reproduced(extractContexts, `template-extract 1.0.15 templateExtractContext > ${name}`);
const templates = (name: string): Evidence =>
  reproduced(extractTemplates, `template-extract 1.0.15 templates > ${name}`);

const templateExtract1015: readonly ExtractionFact[] = Object.freeze([
  fact(
    'context-read-only-from-value-string',
    contexts(
      'warns about a context without valueString and extracts the values below it without it',
    ),
    contexts('repeats the element for each result of a valueString context and removes it'),
    contexts('reads valueString when both valueString and valueExpression are present'),
  ),
  fact(
    'first-context-only',
    contexts('reads only the first templateExtractContext in an extension array'),
  ),
  fact(
    'template-selection',
    templates('extracts the template of the first #id template slice of an item'),
    templates('extracts nothing for a bare # first slice, a full URL or a missing slice'),
    templates('replaces the references of an earlier item with the same linkId'),
    templates('extracts a template referenced from several items once, for the last'),
    templates('uses the last contained resource with the id'),
    templates('ignores a #id that matches no contained resource, without a warning'),
    templates('never extracts a template referenced only from the root, without a warning'),
    templates('extracts a root reference for an item with the linkId QuestionnaireLevel'),
  ),
  fact('no-context-name', contexts('binds no name to a context')),
  fact('template-extract-bundle-unread', templates('does not read templateExtractBundle')),
]);

// The facts by verified template-extract version.
export const extractionFacts: Readonly<Record<string, readonly ExtractionFact[]>> = Object.freeze({
  '1.0.15': templateExtract1015,
});

// The extraction facts of a selected template-extract version, by behaviour. A selected version
// with no facts is a plugin bug: every verified version must have them.
export function extractionAt(version: string): ReadonlyMap<ExtractionBehaviour, ExtractionFact> {
  const facts = extractionFacts[version];
  if (facts === undefined) {
    throw new Error(
      `the plugin has no extraction facts for Smart Forms template-extract ${version}`,
    );
  }
  return new Map(facts.map((each) => [each.behaviour, each]));
}
