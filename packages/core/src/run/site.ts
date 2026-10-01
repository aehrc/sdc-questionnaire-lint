import { isObject } from '../config/validate.js';
import { toPointer } from '../json-pointer.js';

// What identifies a reported site independently of array positions where possible.
export interface SiteIdentity {
  // linkId of the innermost item on the path.
  linkId?: string;
  // URLs of the extensions on the path below that item, outermost first.
  extensionUrls: string[];
  // valueExpression.name of the innermost extension, for variables and other declarations.
  declarationName?: string;
  // The rest of the pointer below the last item or extension; the whole resource-relative pointer
  // when the path crosses neither.
  tail: string;
  // The JSON value at the pointer, or undefined when the pointer does not resolve.
  value: unknown;
}

function step(node: unknown, segment: string): unknown {
  if (Array.isArray(node))
    return /^(0|[1-9]\d*)$/.test(segment) ? node[Number(segment)] : undefined;
  return isObject(node) ? node[segment] : undefined;
}

// Walks segments (relative to the resource) from the resource root.
export function identifySite(
  resource: Readonly<Record<string, unknown>>,
  segments: readonly string[],
): SiteIdentity {
  let node: unknown = resource;
  let linkId: string | undefined;
  let extensionUrls: string[] = [];
  let declarationName: string | undefined;
  let anchor = 0;
  segments.forEach((segment, index) => {
    node = step(node, segment);
    const parent = segments[index - 1];
    if (!isObject(node)) return;
    if (parent === 'item' && typeof node.linkId === 'string') {
      linkId = node.linkId;
      extensionUrls = [];
      declarationName = undefined;
      anchor = index + 1;
    } else if (
      (parent === 'extension' || parent === 'modifierExtension') &&
      typeof node.url === 'string'
    ) {
      extensionUrls.push(node.url);
      const expression = node.valueExpression;
      declarationName =
        isObject(expression) && typeof expression.name === 'string' ? expression.name : undefined;
      anchor = index + 1;
    }
  });
  return {
    ...(linkId === undefined ? {} : { linkId }),
    extensionUrls,
    ...(declarationName === undefined ? {} : { declarationName }),
    tail: toPointer(segments.slice(anchor)),
    value: node,
  };
}
