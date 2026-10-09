import type { Declaration } from '../analysis/declarations.js';
import type { RuleRelatedLocation } from '../plugins/contract.js';
import type { CoreRule } from '../plugins/core-rule.js';
import { placeOf } from './describe.js';

// The element a declaration is on, in a message.
function elementName({ item }: Declaration): string {
  if (item === undefined) return 'the Questionnaire root';
  return item.linkId === undefined ? 'an item that has no linkId' : `item ${item.linkId}`;
}

const message = (name: string, element: string): string =>
  `The name %${name} is declared more than once on ${element}, so it is unclear which value ` +
  'expressions that use it get.';

export const duplicateDeclaration: CoreRule = {
  meta: {
    description: 'Reports a name declared more than once on one item or on the root.',
    defaultSeverity: 'error',
    docs: {
      checks:
        'Looks for two declarations of the same name on the same item, or on the Questionnaire ' +
        'root: variables, other named expressions such as an itemPopulationContext, ' +
        'launchContexts and extractAllocateIds, in any combination. The later declaration is ' +
        'reported, with the first as a related location.',
      why:
        'SDC makes it an error to assign the same name more than once on one item. An ' +
        'expression that uses the name may get either value, depending on the form filler.',
      exampleMessage: message('weight', 'item bmi'),
      fix:
        'Rename one of the declarations, and update the expressions that should use it, or ' +
        'remove the declaration that is not needed. Then run SUSHI again.',
      limitations:
        'Declarations of one name on an item and on its ancestor are not duplicates; a ' +
        'descendant overrides the name. A name that FHIRPath, FHIR or SDC reserves is not ' +
        'checked by this rule. Contained resources and uncatalogued expressions declare ' +
        'nothing, and sourceQueries results are not declarations.',
    },
  },
  check(ctx, { declarations }) {
    // The first declaration of each name on each element.
    const first = new Map<string, Declaration>();
    for (const declaration of declarations) {
      const key = JSON.stringify([declaration.item?.pointer ?? null, declaration.name]);
      const earlier = first.get(key);
      if (earlier === undefined) {
        first.set(key, declaration);
        continue;
      }
      const related: RuleRelatedLocation = {
        ...placeOf(earlier),
        message: `%${earlier.name} is also declared here`,
      };
      ctx.report({
        ...placeOf(declaration),
        message: message(declaration.name, elementName(declaration)),
        help: `rename or remove one of the declarations of %${declaration.name}`,
        relatedLocations: [related],
      });
    }
  },
};
