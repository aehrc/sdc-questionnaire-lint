// The template-extract reproduction harness (S10): runs the pinned @aehrc/sdc-template-extract
// 1.0.15. Its ESM build fails on a directory import (ERR_UNSUPPORTED_DIR_IMPORT on
// fhirpath/fhir-context/r4), so the harness loads the CJS build. Its declarations import fhir/r4,
// which is not installed, so the harness gives its results loose types of its own.
import { createRequire } from 'node:module';
import { sdc } from '../support/sites.js';

type Json = Record<string, unknown>;

const require = createRequire(import.meta.url);
const { inAppExtract } = require('@aehrc/sdc-template-extract') as {
  inAppExtract: (
    response: Json,
    questionnaire: Json,
    comparisonSourceResponse: null,
  ) => Promise<{ extractSuccess: boolean; extractResult: Json }>;
};

export interface Extracted {
  // extractSuccess.
  readonly success: boolean;
  // The details.text of each issue, such as "Template obs: TemplateExtractContext extension found
  // on Observation.component[0].extension[0] but no valueString found.".
  readonly issues: readonly string[];
  // The resource of each entry of the extracted Bundle, in order.
  readonly resources: readonly Json[];
}

// Extracts a QuestionnaireResponse with the Questionnaire given as a resource, not a callback, and
// no comparison response.
export async function extract(questionnaire: Json, response: Json): Promise<Extracted> {
  const { extractSuccess, extractResult } = await inAppExtract(response, questionnaire, null);
  // An OperationOutcome on failure; otherwise { extractedBundle, issues, debugInfo }.
  const outcome = (extractSuccess ? extractResult.issues : extractResult) as {
    issue?: { details?: { text?: string } }[];
  } | null;
  const bundle = extractSuccess ? (extractResult.extractedBundle as { entry?: Json[] }) : undefined;
  return {
    success: extractSuccess,
    issues: (outcome?.issue ?? []).map((issue) => issue.details?.text ?? ''),
    resources: (bundle?.entry ?? []).map((entry) => entry.resource as Json),
  };
}

// A completed QuestionnaireResponse to the Questionnaire Q with the given items.
export function responseTo(item: readonly Json[]): Json {
  return {
    resourceType: 'QuestionnaireResponse',
    questionnaire: 'Q',
    status: 'completed',
    item,
  };
}

// A templateExtract extension with a template slice for each reference, in order.
export function templateExtract(...references: string[]): Json {
  return {
    url: `${sdc}templateExtract`,
    extension: references.map((reference) => ({ url: 'template', valueReference: { reference } })),
  };
}

export function context(value: Json): Json {
  return { url: `${sdc}templateExtractContext`, ...value };
}

// An Observation template with the id; code.text is its id unless given, so that the extracted
// resources show which template each came from.
export function observation(id: string, fields: Json = {}): Json {
  return { resourceType: 'Observation', id, status: 'final', code: { text: id }, ...fields };
}

// An Observation component whose valueString is the value of the FHIRPath value, evaluated against
// its context, with the extensions given before it, such as a templateExtractContext.
export function component(extension: readonly Json[], value = 'answer.value'): Json {
  return {
    extension,
    code: { text: 'c' },
    _valueString: { extension: [{ url: `${sdc}templateExtractValue`, valueString: value }] },
  };
}
