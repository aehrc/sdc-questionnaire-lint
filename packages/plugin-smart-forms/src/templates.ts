import type { QuestionnaireDocument } from 'sdc-questionnaire-lint';
import { arrayOf, isObject, itemsOf, type Json } from './document.js';
import { TEMPLATE_EXTRACT } from './urls.js';

// The contained resources Smart Forms template extraction uses as templates
// (docs/smart-forms-rules.md, P8), found by copying template-extract's four selection steps, so
// that a form template-extract rejects or misreads gives what it gives there.

// The key template-extract files the root's references under. It names no item unless an item
// has it as its linkId.
const QUESTIONNAIRE_LEVEL = 'QuestionnaireLevel';

// Step 1: the template id of a templateExtract, from the first template slice whose reference
// starts with #, without the #. None for a full URL, a missing slice, or # alone, which is still
// the first such slice.
function templateIdOf(extension: Json): string | undefined {
  const slice = arrayOf(extension.extension).find(
    (each) =>
      isObject(each) &&
      each.url === 'template' &&
      isObject(each.valueReference) &&
      typeof each.valueReference.reference === 'string' &&
      each.valueReference.reference.startsWith('#'),
  ) as { valueReference: { reference: string } } | undefined;
  const id = slice?.valueReference.reference.slice(1);
  return id === '' ? undefined : id;
}

// The template ids an owner's templateExtract extensions reference, in order.
function referencesOf(owner: Json): string[] {
  return arrayOf(owner.extension).flatMap((each) => {
    if (!isObject(each) || each.url !== TEMPLATE_EXTRACT) return [];
    const id = templateIdOf(each);
    return id === undefined ? [] : [id];
  });
}

// The index in contained of each template extraction uses, in contained order.
export function extractedTemplates(document: QuestionnaireDocument): readonly number[] {
  const questionnaire = document.resource;
  const items = itemsOf(questionnaire);
  // Step 2: the references keyed by owner, the root first; a later owner with the same key
  // replaces the earlier one's references, and keeps the key's place in the map. An item's key is
  // its linkId, whatever it is.
  const byKey = new Map<unknown, string[]>();
  const rootReferences = referencesOf(questionnaire);
  if (rootReferences.length > 0) byKey.set(QUESTIONNAIRE_LEVEL, rootReferences);
  for (const item of items) {
    const references = referencesOf(item);
    if (references.length > 0) byKey.set(item.linkId, references);
  }
  // Step 3: each template id to its key; the last mapping wins.
  const keyOf = new Map<string, unknown>();
  for (const [key, references] of byKey) {
    for (const id of references) keyOf.set(id, key);
  }
  // Step 4: a contained resource with a mapped id, the last one when ids repeat, whose key is the
  // linkId of an item.
  const templates = new Map<string, number>();
  arrayOf(questionnaire.contained).forEach((resource, index) => {
    if (!isObject(resource) || typeof resource.id !== 'string' || !keyOf.has(resource.id)) return;
    const key = keyOf.get(resource.id);
    if (items.some((item) => item.linkId === key)) templates.set(resource.id, index);
  });
  return [...templates.values()].sort((a, b) => a - b);
}
