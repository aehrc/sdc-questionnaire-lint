import type { Declaration } from '../analysis/declarations.js';
import type { QuestionnaireDocument, SiteItem } from '../analysis/expression-site.js';
import { isObject } from '../object.js';
import type { RuleFinding } from '../plugins/contract.js';

// How core rules name and place what they report.

// The text of the item at a pointer, when it is a string.
function itemText(document: QuestionnaireDocument, item: SiteItem): string | undefined {
  let node: unknown = document.resource;
  for (const segment of item.pointer.slice(document.resourcePointer.length).split('/').slice(1)) {
    node = Array.isArray(node) ? node[Number(segment)] : isObject(node) ? node[segment] : undefined;
  }
  return isObject(node) && typeof node.text === 'string' ? node.text : undefined;
}

// The element a site or declaration is on, in a message: the item's text and linkId.
export function elementName(document: QuestionnaireDocument, item: SiteItem | undefined): string {
  if (item === undefined) return 'the Questionnaire root';
  const text = itemText(document, item);
  if (item.linkId === undefined) {
    return text === undefined ? 'an item that has no linkId' : `item ${JSON.stringify(text)}`;
  }
  return text === undefined
    ? `item ${item.linkId}`
    : `item ${JSON.stringify(text)} (${item.linkId})`;
}

// A declaration's place: its Expression, or the extension of a launchContext or extractAllocateId.
export function placeOf({ site, pointer }: Declaration): Pick<RuleFinding, 'site' | 'pointer'> {
  return site === undefined ? { pointer } : { site };
}
