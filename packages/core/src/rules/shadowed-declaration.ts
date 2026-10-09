import { extractionOnly } from '../analysis/available-variables.js';
import type { Declaration } from '../analysis/declarations.js';
import type { CoreRule } from '../plugins/core-rule.js';
import { elementName, placeOf } from './describe.js';

// Whether owner is on the root or on an ancestor item of declaration's item. Compared with a
// trailing /, so that /item/1 is not an ancestor of /item/10.
function onAncestor(owner: Declaration, declaration: Declaration): boolean {
  if (declaration.item === undefined) return false;
  return owner.item === undefined || declaration.item.pointer.startsWith(`${owner.item.pointer}/`);
}

// Whether some site can see both declarations (D19): extraction sites see only those whose only use
// is extraction, and other sites every declaration but an extractAllocateId.
const seenTogether = (a: Declaration, b: Declaration): boolean =>
  (extractionOnly(a.useCases) && extractionOnly(b.useCases)) ||
  (a.kind !== 'allocateId' && b.kind !== 'allocateId');

// The declaration that declaration overrides: the first of its name on the nearest ancestor
// element that declares it.
function shadowedBy(
  declaration: Declaration,
  declarations: readonly Declaration[],
): Declaration | undefined {
  let nearest: Declaration | undefined;
  for (const other of declarations) {
    if (
      other.name !== declaration.name ||
      !onAncestor(other, declaration) ||
      !seenTogether(other, declaration)
    ) {
      continue;
    }
    // An ancestor's pointer is a prefix of its descendants', so a longer pointer is nearer.
    if (
      nearest === undefined ||
      (other.item?.pointer.length ?? -1) > (nearest.item?.pointer.length ?? -1)
    ) {
      nearest = other;
    }
  }
  return nearest;
}

const message = (name: string, element: string, ancestor: string): string =>
  `The name %${name} on ${element} is also declared on ${ancestor}, so other expressions on ` +
  `${element} and its descendant items get this declaration's value.`;

export const shadowedDeclaration: CoreRule = {
  meta: {
    description: 'Reports a name an item declares that an ancestor item or the root also declares.',
    defaultSeverity: 'info',
    docs: {
      checks:
        'Looks for a declaration on an item of a name that an ancestor item or the ' +
        'Questionnaire root also declares: variables, other named expressions such as an ' +
        'itemPopulationContext, launchContexts and extractAllocateIds, in any combination that ' +
        'one expression could see: an extractAllocateId is seen only in extraction, where a ' +
        'variable is not. The declaration on the item is reported, with the nearest ancestor ' +
        'declaration of the name as a related location.',
      why:
        'SDC allows an item to override a name an ancestor declares: other expressions on the ' +
        "item and its descendants get the item's value, while its own expression gets the " +
        "ancestor's. SDC suggests a warning, because an author " +
        'who reuses a name by accident gets a different value than they expect. It is not an ' +
        'error, and modular forms often do it, so it is reported as info.',
      exampleMessage: message('weight', 'item "BMI" (bmi)', 'the Questionnaire root'),
      fix:
        'If the item should not override the name, rename one of the declarations, and update ' +
        'the expressions that should use it. Then run SUSHI again. If it should, leave it, or ' +
        'turn the rule off.',
      limitations:
        'Two declarations of one name on the same element are reported by ' +
        'sdc/duplicate-declaration instead. Contained resources and uncatalogued expressions ' +
        'declare nothing, and the names a module lists in assembleContext, or in hostVariables, ' +
        'are not declarations.',
    },
  },
  check(ctx, { declarations }) {
    const named = (declaration: Declaration) => elementName(ctx.document, declaration.item);
    for (const declaration of declarations) {
      const shadowed = shadowedBy(declaration, declarations);
      if (shadowed === undefined) continue;
      ctx.report({
        ...placeOf(declaration),
        message: message(declaration.name, named(declaration), named(shadowed)),
        help: `rename one of the declarations of %${declaration.name}, unless this item should override it`,
        relatedLocations: [
          { ...placeOf(shadowed), message: `%${shadowed.name} is also declared here` },
        ],
      });
    }
  },
};
