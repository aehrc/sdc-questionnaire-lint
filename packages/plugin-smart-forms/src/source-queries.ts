import type { QuestionnaireDocument } from 'sdc-questionnaire-lint';
import { isObject, type Json } from './document.js';
import { SOURCE_QUERIES } from './urls.js';

// The root sourceQueries extensions as Smart Forms population reads them
// (docs/smart-forms-rules.md, P4): only root extensions with the exact URL and a truthy
// valueReference, in extension order. Records without a name are kept: they still count for the
// index of later ones, and population still replaces embeddings in the Bundles of #%x references.
export interface SourceQuery {
  // The extension's index in the root's extension array.
  readonly extensionIndex: number;
  // Its index among the sourceQueries extensions with a valueReference: the i of sourceQuery<i>.
  readonly index: number;
  // valueReference.reference, when it is a string.
  readonly reference: string | undefined;
  // The name population binds the result to: id for #id, else sourceQuery<index>. undefined
  // without a reference, for an empty one and for # alone, which population never fetches or
  // binds. A #%x reference is named %x.
  readonly name: string | undefined;
  // For a #id reference, the first contained resource with that id whose resourceType is Bundle,
  // and its index in contained; population reads only that one.
  readonly bundle?: { readonly resource: Json; readonly containedIndex: number };
}

export function readSourceQueries(document: QuestionnaireDocument): readonly SourceQuery[] {
  const { extension, contained } = document.resource;
  const extensions: readonly unknown[] = Array.isArray(extension) ? extension : [];
  const resources: readonly unknown[] = Array.isArray(contained) ? contained : [];
  const records: SourceQuery[] = [];
  extensions.forEach((each, extensionIndex) => {
    if (!isObject(each) || each.url !== SOURCE_QUERIES || !each.valueReference) return;
    const index = records.length;
    const value = each.valueReference;
    const reference =
      isObject(value) && typeof value.reference === 'string' ? value.reference : undefined;
    if (reference === undefined || reference === '' || reference === '#') {
      records.push({ extensionIndex, index, reference, name: undefined });
      return;
    }
    if (!reference.startsWith('#')) {
      records.push({ extensionIndex, index, reference, name: `sourceQuery${String(index)}` });
      return;
    }
    const id = reference.slice(1);
    const containedIndex = resources.findIndex(
      (resource) => isObject(resource) && resource.id === id && resource.resourceType === 'Bundle',
    );
    const resource = resources[containedIndex];
    records.push({
      extensionIndex,
      index,
      reference,
      name: id,
      ...(isObject(resource) ? { bundle: { resource, containedIndex } } : {}),
    });
  });
  return records;
}
