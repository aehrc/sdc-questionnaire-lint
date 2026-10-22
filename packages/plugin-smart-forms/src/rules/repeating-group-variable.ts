import type {
  Declaration,
  LintRule,
  QuestionnaireDocument,
  RuleRelatedLocation,
  SiteItem,
} from '@aehrc/sdc-questionnaire-lint';
import { elementName, isObject, resolve } from '../document.js';
import { readBy, requireCompat } from '../eligibility.js';
import { variableFactsAt } from '../facts/variables.js';
import { FHIRPATH } from '../urls.js';

// The nearest group with repeats: true among an item and its ancestors, or undefined when there is
// none. A repeating question does not count: its variables are evaluated once for its response
// item, whose answers repeat.
function repeatingGroupOf(document: QuestionnaireDocument, item: SiteItem): SiteItem | undefined {
  const below = item.pointer.slice(document.resourcePointer.length);
  const ends = [...below.matchAll(/\/item\/\d+/g)].map(({ index, 0: step }) => index + step.length);
  for (const end of ends.reverse()) {
    const pointer = document.resourcePointer + below.slice(0, end);
    const node = resolve(document, pointer);
    if (isObject(node) && node.type === 'group' && node.repeats === true) {
      return typeof node.linkId === 'string' ? { pointer, linkId: node.linkId } : { pointer };
    }
  }
  return undefined;
}

const samePlace = (a: Declaration, b: Declaration): boolean => a.item?.pointer === b.item?.pointer;

const help = 'compute it from the whole response, or move the item out of the repeating group';

const readsMessage = (name: string, group: string): string =>
  `%${name} is calculated for each repetition of ${group}, but Smart Forms keeps one value, so ` +
  'every repetition gets the value calculated for one of them, usually the last.';

const dependsMessage = (name: string, other: string, group: string): string =>
  `%${name} depends on %${other}, which is calculated for each repetition of ${group}; Smart ` +
  `Forms keeps one value of each, so %${name} may use another repetition's value.`;

export const repeatingGroupVariable: LintRule = {
  meta: {
    description:
      'Reports a variable on or below a repeating group whose value differs between ' +
      'repetitions, of which Smart Forms keeps one.',
    defaultSeverity: 'warning',
    docs: {
      checks:
        'Each text/fhirpath variable on a group that repeats, or on an item below one, that ' +
        'another expression references or may reference. It reports the variable when its ' +
        'value can differ between repetitions: its expression reads the item it is evaluated ' +
        'on, other than its linkId, or uses %context, or it references such a variable on the ' +
        'same item.',
      why:
        'SDC evaluates such a variable for each repetition of the group, so each repetition ' +
        'has its own value. The Smart Forms renderer evaluates it once for each repetition but ' +
        'keeps a single value for the whole form, so every expression that uses it gets the ' +
        'value of one repetition, usually the last, whichever repetition it is on.',
      exampleMessage: readsMessage('dose', 'item "Medication" (medication)'),
      fix:
        'Compute the value from the whole response, such as with ' +
        "%resource.item.where(linkId = 'medication').item.where(linkId = 'dose').answer.value, " +
        'or move the item out of the repeating group, in the FSH rules that set them. Then run ' +
        'SUSHI again. A calculatedExpression is not a per-repetition alternative: Smart Forms ' +
        'evaluates it once.',
      limitations:
        'The test is syntactic: an expression that reads the item may still give the same value ' +
        'in every repetition. A variable nothing references is not reported, and neither is ' +
        'one referenced only from another branch of the form, which sdc/undefined-variable ' +
        'reports. Variables on another item, root variables and itemPopulationContexts, which ' +
        'population binds per repetition, do not count, and neither does an expression that ' +
        'does not parse. Population evaluates the variable once, with an empty input, and is ' +
        'not reported. The renderer facts come from the Smart Forms source.',
    },
  },
  check(ctx) {
    const versions = requireCompat(ctx);
    if (!variableFactsAt('renderer', versions.renderer).has('item-variable-per-response-item')) {
      return;
    }
    const { document } = ctx;

    // The text/fhirpath item variables the renderer evaluates below a repeating group, each with
    // its group.
    const groups = new Map<Declaration, SiteItem>();
    for (const declaration of ctx.declarations) {
      const { kind, site, item } = declaration;
      if (kind !== 'variable' || site === undefined || item === undefined) continue;
      if (site.language !== FHIRPATH || ctx.readsInput(site) === undefined) continue;
      if (!readBy(ctx, site).some(({ component }) => component === 'renderer')) continue;
      const group = repeatingGroupOf(document, item);
      if (group !== undefined) groups.set(declaration, group);
    }

    // A variable is dependent when it reads its input, or references a dependent variable on its
    // item, in either order: within a repetition, a later one still holds the previous
    // repetition's value. Each gets the first such variable it references, if it does not read
    // its input itself.
    const dependent = new Map<Declaration, Declaration | undefined>();
    for (const declaration of groups.keys()) {
      const { site } = declaration;
      if (site !== undefined && ctx.readsInput(site) === true)
        dependent.set(declaration, undefined);
    }
    for (let changed = true; changed;) {
      changed = false;
      for (const declaration of groups.keys()) {
        if (dependent.has(declaration)) continue;
        const through = ctx
          .dependenciesOf(declaration)
          ?.on.find((other) => dependent.has(other) && samePlace(other, declaration));
        if (through !== undefined) {
          dependent.set(declaration, through);
          changed = true;
        }
      }
    }

    // In document order.
    for (const [declaration, group] of groups) {
      const { site, name } = declaration;
      if (!dependent.has(declaration) || site === undefined) continue;
      // sdc/unused-declaration's condition, whatever that rule's setting.
      if (ctx.useOf(declaration) === 'unreferenced') continue;
      const through = dependent.get(declaration);
      const groupName = elementName(document, group);
      const repeats: RuleRelatedLocation = {
        pointer: group.pointer,
        message: 'this group repeats',
      };
      if (through === undefined) {
        ctx.report({
          site,
          message: readsMessage(name, groupName),
          help,
          relatedLocations: [repeats],
        });
        continue;
      }
      ctx.report({
        site,
        message: dependsMessage(name, through.name, groupName),
        help,
        relatedLocations: [
          repeats,
          {
            ...(through.site === undefined ? { pointer: through.pointer } : { site: through.site }),
            message: `%${through.name} is calculated for each repetition`,
          },
        ],
      });
    }
  },
};
