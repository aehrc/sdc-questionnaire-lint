// The populate reproduction harness (S10): runs the pinned @aehrc/sdc-populate 4.7.1 in plain Node.
// Its declarations import fhir/r4, which is not installed, so its own types are any; the harness
// gives its results loose types of its own instead.
import { populateQuestionnaire } from '@aehrc/sdc-populate';
import { sdc } from '../support/sites.js';

type Json = Record<string, unknown>;

export interface Populated {
  // populateSuccess.
  readonly success: boolean;
  // The details.text of each OperationOutcome issue, such as "Error: … undefined environment
  // variable: questionnaire".
  readonly issues: readonly string[];
  // populatedContext: the names population bound, which the app passes on as additionalContext.
  readonly context: Json | undefined;
  // The populated QuestionnaireResponse.
  readonly response: Json | undefined;
  // Each URL passed to the fetch callback, in order.
  readonly urls: readonly string[];
}

export const patient = { resourceType: 'Patient', id: 'pat-1' };
const emptySearchset = { resourceType: 'Bundle', type: 'searchset', entry: [] };

// Populates a Questionnaire for the patient pat-1. fetch answers each request by URL; a request it
// does not answer gets an empty searchset Bundle.
export async function populate(
  questionnaire: Json,
  { fetch }: { fetch?: (url: string) => Json | undefined } = {},
): Promise<Populated> {
  const urls: string[] = [];
  const result: {
    populateSuccess: boolean;
    populateResult: {
      populatedResponse: Json;
      issues?: { issue?: { details?: { text?: string } }[] };
      populatedContext?: Json;
    } | null;
  } = await populateQuestionnaire({
    questionnaire,
    patient,
    fetchResourceCallback: (url: string) => {
      urls.push(url);
      return Promise.resolve({ data: fetch?.(url) ?? emptySearchset });
    },
    fetchResourceRequestConfig: { sourceServerUrl: 'https://fhir.example.org' },
    // Its timer is never cleared, so keep it short.
    timeoutMs: 5000,
  });
  const populated = result.populateResult;
  return {
    success: result.populateSuccess,
    issues: (populated?.issues?.issue ?? []).map((issue) => issue.details?.text ?? ''),
    context: populated?.populatedContext,
    response: populated?.populatedResponse,
    urls,
  };
}

// The Questionnaire with a patient launchContext added to its root extensions. Without a launch
// context, source query or query variable, population does not run, and without root extensions
// item FHIRPath variables are skipped.
export function withPatientLaunch(questionnaire: Json): Json {
  const launch = {
    url: `${sdc}launchContext`,
    extension: [
      { url: 'name', valueCoding: { system: `${sdc}launchContext`, code: 'patient' } },
      { url: 'type', valueCode: 'Patient' },
    ],
  };
  const extensions = Array.isArray(questionnaire.extension)
    ? (questionnaire.extension as unknown[])
    : [];
  return { ...questionnaire, extension: [launch, ...extensions] };
}

// The response items with a linkId, at any depth, in document order.
export function responseItems(response: Json | undefined, linkId: string): Json[] {
  const found: Json[] = [];
  const visit = (items: unknown): void => {
    for (const item of Array.isArray(items) ? (items as Json[]) : []) {
      if (item.linkId === linkId) found.push(item);
      visit(item.item);
      for (const answer of Array.isArray(item.answer) ? (item.answer as Json[]) : []) {
        visit(answer.item);
      }
    }
  };
  visit(response?.item);
  return found;
}

// The answers of the first response item with a linkId; [] when it is absent or has none.
export function answersOf(response: Json | undefined, linkId: string): unknown[] {
  const [item] = responseItems(response, linkId);
  return Array.isArray(item?.answer) ? (item.answer as unknown[]) : [];
}
