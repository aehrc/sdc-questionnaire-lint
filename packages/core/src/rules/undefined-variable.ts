import type { DocumentAnalysis } from '../analysis/document-analysis.js';
import type {
  ExpressionSite,
  QuestionnaireDocument,
  SiteItem,
} from '../analysis/expression-site.js';
import { isObject } from '../object.js';
import type { CoreRule } from '../plugins/core-rule.js';
import { closestName } from '../suggest.js';

// Whether the rule completes its check at a site: the site is catalogued, its FHIRPath parses, and
// defineVariable left the name of every reference known (core-rules.md, slice 4c).
export function resolvesNamesAt(site: ExpressionSite, analysis: DocumentAnalysis): boolean {
  const references = analysis.references.get(site);
  return (
    analysis.variablesAt(site) !== undefined &&
    references !== undefined &&
    references.every(({ complete }) => complete)
  );
}

// The text of the item at a pointer, when it is a string.
function itemText(document: QuestionnaireDocument, item: SiteItem): string | undefined {
  let node: unknown = document.resource;
  for (const segment of item.pointer.slice(document.resourcePointer.length).split('/').slice(1)) {
    node = Array.isArray(node) ? node[Number(segment)] : isObject(node) ? node[segment] : undefined;
  }
  return isObject(node) && typeof node.text === 'string' ? node.text : undefined;
}

// The element a site is on, in a message.
function elementName(document: QuestionnaireDocument, item: SiteItem | undefined): string {
  if (item === undefined) return 'the Questionnaire root';
  const text = itemText(document, item);
  if (item.linkId === undefined) {
    return text === undefined ? 'an item that has no linkId' : `item ${JSON.stringify(text)}`;
  }
  return text === undefined
    ? `item ${item.linkId}`
    : `item ${JSON.stringify(text)} (${item.linkId})`;
}

const message = (name: string, element: string): string =>
  `%${name} is not available on ${element}.`;

export const undefinedVariable: CoreRule = {
  meta: {
    description: 'Reports a %name that is not available where it is used.',
    defaultSeverity: 'error',
    docs: {
      checks:
        'Every %name in a FHIRPath expression at a catalogued location, and in each {{…}} ' +
        'fragment of an x-fhir-query there, is looked up among the names available at that ' +
        'place: the declarations on its item, its ancestor items and the root, such as ' +
        'variables, other named expressions and launchContexts; the names FHIRPath, FHIR and ' +
        'SDC define, such as %resource, %context and %qitem; in a module, the names its ' +
        'assembleContext lists; and the names listed in hostVariables. An expression used in ' +
        'extraction sees only extractAllocateId names and named extraction contexts among the ' +
        'declarations.',
      why:
        'SDC says a name an expression uses must be declared on its item or an ancestor. A ' +
        'misspelt name, or one declared on another branch of the form, is not available there.',
      exampleMessage: message('weigt', 'item "BMI" (bmi)'),
      fix:
        'Correct the name in the FSH rule that sets the expression, or declare it on the item, ' +
        'an ancestor item or the root, then run SUSHI again. A module lists the names the ' +
        'Questionnaire that includes it supplies in assembleContext. If the application running the ' +
        'form supplies the name, list it in hostVariables in the config. The help names an ' +
        'available name that is similar, when there is one.',
      limitations:
        'Expressions in contained resources and at uncatalogued locations, and expressions that ' +
        'do not parse, are not checked. A name defineVariable binds is not reported in the later ' +
        'steps of its chain; a reference after a defineVariable whose name is computed is not ' +
        'checked. A similar name is suggested only within a small edit distance, so a swap of ' +
        'two letters, such as weigth, gets no suggestion.',
    },
  },
  check(ctx, analysis) {
    for (const site of ctx.sites) {
      const available = analysis.variablesAt(site);
      const references = analysis.references.get(site);
      if (available === undefined || references === undefined) continue;
      for (const { name, startOffset, endOffset, complete } of references) {
        if (!complete || available.resolve(name) !== undefined) continue;
        const similar = closestName(
          name,
          available.variables.map((variable) => variable.name),
        );
        ctx.report({
          site,
          message: message(name, elementName(ctx.document, site.item)),
          help:
            similar === undefined
              ? `declare it on ${site.item === undefined ? 'the root' : 'this item, an ancestor item or the root'}, ` +
                'or list it in hostVariables if the application running the form supplies it'
              : `a variable with a similar name is available: %${similar}`,
          range: { startOffset, endOffset },
        });
      }
    }
  },
};
