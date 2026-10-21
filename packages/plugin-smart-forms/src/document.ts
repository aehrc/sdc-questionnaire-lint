import type {
  ExpressionSite,
  QuestionnaireDocument,
  SiteItem,
} from '@aehrc/sdc-questionnaire-lint';

// Reading the Questionnaire JSON behind a site. Core publishes no item API yet (API stage A), so
// the plugin resolves the pointers sites carry (docs/smart-forms-rules.md, Public API stages).

export type Json = Readonly<Record<string, unknown>>;

export function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The value when it is an array, else [].
export const arrayOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

// The items below an owner, the Questionnaire or an item, at any depth, in pre-order, through item
// only, as population and template extraction walk them.
export function itemsOf(owner: Json): Json[] {
  const found: Json[] = [];
  const visit = (items: unknown): void => {
    for (const item of arrayOf(items)) {
      if (!isObject(item)) continue;
      found.push(item);
      visit(item.item);
    }
  };
  visit(owner.item);
  return found;
}

function segmentsOf(pointer: string): string[] {
  return pointer === ''
    ? []
    : pointer
        .slice(1)
        .split('/')
        .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
}

// The value at a JSON Pointer from the root of the input file, or undefined when nothing is there.
export function resolve(document: QuestionnaireDocument, pointer: string): unknown {
  let node: unknown = document.resource;
  for (const segment of segmentsOf(pointer.slice(document.resourcePointer.length))) {
    node = Array.isArray(node) ? node[Number(segment)] : isObject(node) ? node[segment] : undefined;
  }
  return node;
}

// The pointer levels up from a pointer.
function up(pointer: string, levels: number): string {
  return pointer.split('/').slice(0, -levels).join('/');
}

// Where an extension sits: the object, and its index in the array that holds it.
export interface PlacedExtension {
  readonly extension: Json;
  readonly siblings: readonly unknown[];
  readonly index: number;
}

function placed(document: QuestionnaireDocument, pointer: string): PlacedExtension | undefined {
  const extension = resolve(document, pointer);
  const siblings = resolve(document, up(pointer, 1));
  const index = Number(pointer.slice(pointer.lastIndexOf('/') + 1));
  return isObject(extension) && Array.isArray(siblings)
    ? { extension, siblings, index }
    : undefined;
}

// The extension that holds a site's Expression, such as the variable or the targetConstraint, and
// for a complex extension also the sub-extension that holds it.
export function extensionOf(
  document: QuestionnaireDocument,
  site: ExpressionSite,
): { holder: PlacedExtension; sub?: PlacedExtension } | undefined {
  const own = up(site.expressionPointer, 1);
  if (site.location?.subExtension === undefined) {
    const holder = placed(document, own);
    return holder === undefined ? undefined : { holder };
  }
  const holder = placed(document, up(own, 2));
  const sub = placed(document, own);
  return holder === undefined || sub === undefined ? undefined : { holder, sub };
}

// The item a site is on, as JSON.
export function itemOf(document: QuestionnaireDocument, item: SiteItem): Json | undefined {
  const node = resolve(document, item.pointer);
  return isObject(node) ? node : undefined;
}

// The element a site is on, in a message: the item's text and linkId. The same output as core's
// elementName, which is internal (packages/core/src/rules/describe.ts).
export function elementName(document: QuestionnaireDocument, item: SiteItem | undefined): string {
  if (item === undefined) return 'the Questionnaire root';
  const node = itemOf(document, item);
  const text = typeof node?.text === 'string' ? node.text : undefined;
  if (item.linkId === undefined) {
    return text === undefined ? 'an item that has no linkId' : `item ${JSON.stringify(text)}`;
  }
  return text === undefined
    ? `item ${item.linkId}`
    : `item ${JSON.stringify(text)} (${item.linkId})`;
}
